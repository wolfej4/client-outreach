"""
SwyfTech Discovery — MSP discovery notes app.

A small Flask app that serves a single-page UI for capturing notes during
in-person MSP discovery meetings, and drafts a follow-up email by calling
a local Ollama instance via its OpenAI-compatible endpoint.

Configuration is via environment variables — see README.md.
"""
from __future__ import annotations

import json
import os
import logging
from pathlib import Path
from typing import Any

import requests
from flask import Flask, jsonify, request, send_from_directory


# ---- Configuration --------------------------------------------------------

OLLAMA_BASE_URL = os.environ.get(
    "OLLAMA_BASE_URL", "http://host.docker.internal:11434"
).rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")
OLLAMA_TIMEOUT = int(os.environ.get("OLLAMA_TIMEOUT", "180"))

SENDER_NAME = os.environ.get("SENDER_NAME", "")
SENDER_TITLE = os.environ.get("SENDER_TITLE", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "")
SENDER_PHONE = os.environ.get("SENDER_PHONE", "")
SENDER_LOCATION = os.environ.get("SENDER_LOCATION", "")
MSP_NAME = os.environ.get("MSP_NAME", "")

DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))
SETTINGS_FILE = DATA_DIR / "settings.json"

SETTINGS_KEYS = {
    "ollama_url", "ollama_model",
    "sender_name", "sender_title", "sender_email", "sender_phone",
    "sender_location", "msp_name",
}


# ---- Settings helpers -------------------------------------------------------

def load_settings_file() -> dict:
    try:
        return json.loads(SETTINGS_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def save_settings_file(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(data, indent=2))


# ---- Prompts --------------------------------------------------------------

SYSTEM_PROMPT = """You are writing follow-up emails for an MSP (managed IT \
services provider) after in-person discovery meetings with small and mid-size \
businesses. Your goal is an email that feels like it came from a local IT \
partner who genuinely listened — not a sales rep following a template.

OUTPUT FORMAT — follow exactly:
Subject: <subject line>

Hi <first name>,
<email body>

<sign-off>,
<sender name>
<sender title> | <sender company>
<sender email>
<sender phone>

SUBJECT LINE:
- Specific and conversational, never generic
- Reference something concrete: their industry, a named pain, a next step
- 6–10 words, no punctuation at the end, no ALL CAPS
- Good: "A few options for your patient data backups"
- Bad: "Following up on our conversation"

EMAIL BODY:
- 150–220 words
- Open with one or two sentences anchored in something specific they shared \
(a worry, a situation, a deadline, a goal). Never use "I hope this email \
finds you well", "It was great meeting you", or any hollow opener.
- Middle: weave in their priorities and timeline naturally — don't restate \
the meeting, move it forward.
- Signals — use them:
  * Objections (too expensive, locked in contract, happy with current IT): \
address the concern indirectly and without defensiveness; don't ignore it
  * Strong buying signals (asked for next steps, expressed urgency, \
decision-maker in the room): match that energy with a clear, confident ask
  * Concerns (cybersecurity, data loss, downtime): name the risk specifically, \
then point toward the solution without overselling
- Close with one or two concrete next steps matched to their timeline. \
If they said ASAP, propose a specific time. If they're exploring, offer \
a low-commitment first step.
- Sign off with "Talk soon," or "Thanks," — never "Best regards", "Sincerely", \
or "Warm regards".
- Voice: warm, direct, human. No jargon — no "synergy", "leverage", \
"circle back", "touch base", "reach out". No superlatives — no "excited", \
"thrilled", "delighted". No em-dashes as decoration.
- Use actual sender info; never leave placeholders like [your name]."""


def build_user_prompt(notes: dict, sender: dict) -> str:
    """Format captured notes into a structured user message."""

    def line(label: str, value: Any) -> str | None:
        if value is None:
            return None
        s = str(value).strip()
        if not s:
            return None
        return f"- {label}: {s}"

    lines = ["Discovery meeting notes:"]
    for label, key in [
        ("Company", "company"),
        ("Contact", "contact"),
        ("Contact role", "role"),
        ("Industry", "industry"),
        ("Headcount", "headcount"),
        ("Locations", "locations"),
        ("Current IT setup", "current_it"),
        ("Pain points", "pain_points"),
        ("Tech stack notes", "tech_stack"),
        ("Top priority", "top_priority"),
        ("Timeline", "timeline"),
        ("Decision-makers", "decision_makers"),
        ("Budget signal", "budget"),
        ("Other notes", "extra_notes"),
    ]:
        ln = line(label, notes.get(key))
        if ln:
            lines.append(ln)

    signals = notes.get("signals") or []
    if signals:
        lines.append("")
        lines.append("Signals logged during the meeting:")
        for sig in signals:
            lines.append(f"  [{sig.get('category', 'note')}] {sig.get('label', '')}")

    lines.append("")
    lines.append("Sign the email as:")
    if sender.get("name"):
        lines.append(f"- Name: {sender['name']}")
    if sender.get("title"):
        lines.append(f"- Title: {sender['title']}")
    if sender.get("msp"):
        lines.append(f"- Company: {sender['msp']}")
    if sender.get("email"):
        lines.append(f"- Email: {sender['email']}")
    if sender.get("phone"):
        lines.append(f"- Phone: {sender['phone']}")
    lines.append("")
    lines.append("Draft the follow-up email now.")
    return "\n".join(lines)


# ---- App ------------------------------------------------------------------

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("discovery")

app = Flask(__name__, static_folder="static", static_url_path="/static")


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/healthz")
def healthz():
    """Liveness — does the Flask app respond."""
    return jsonify(status="ok")


@app.route("/api/health")
def api_health():
    """Readiness — does the Flask app respond and can it reach Ollama."""
    out = {"app": "ok", "ollama": "unknown", "model": OLLAMA_MODEL, "url": OLLAMA_BASE_URL}
    try:
        r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=4)
        if r.ok:
            tags = r.json().get("models", [])
            names = {m.get("name") for m in tags}
            out["ollama"] = "ok"
            out["model_present"] = OLLAMA_MODEL in names
            out["available_models"] = sorted(n for n in names if n)[:25]
        else:
            out["ollama"] = f"http {r.status_code}"
    except requests.exceptions.RequestException as e:
        out["ollama"] = f"unreachable: {e.__class__.__name__}"
    return jsonify(out)


@app.route("/api/config")
def config():
    return jsonify(
        sender_name=SENDER_NAME,
        sender_title=SENDER_TITLE,
        sender_email=SENDER_EMAIL,
        sender_phone=SENDER_PHONE,
        sender_location=SENDER_LOCATION,
        msp_name=MSP_NAME,
        model=OLLAMA_MODEL,
    )


@app.route("/api/settings", methods=["GET"])
def get_settings():
    """Return saved settings, falling back to env-var defaults."""
    saved = load_settings_file()
    defaults = {
        "ollama_url":      OLLAMA_BASE_URL,
        "ollama_model":    OLLAMA_MODEL,
        "sender_name":     SENDER_NAME,
        "sender_title":    SENDER_TITLE,
        "sender_email":    SENDER_EMAIL,
        "sender_phone":    SENDER_PHONE,
        "sender_location": SENDER_LOCATION,
        "msp_name":        MSP_NAME,
    }
    merged = {k: saved.get(k) or v for k, v in defaults.items()}
    return jsonify(merged)


@app.route("/api/settings", methods=["POST"])
def post_settings():
    """Persist settings to data/settings.json."""
    body = request.get_json(silent=True) or {}
    cleaned = {k: str(v).strip() for k, v in body.items() if k in SETTINGS_KEYS}
    try:
        save_settings_file(cleaned)
    except OSError as e:
        log.error("Could not write settings: %s", e)
        return jsonify(error=f"Could not save settings: {e}"), 500
    log.info("Settings saved: %s", list(cleaned.keys()))
    return jsonify(ok=True)


@app.route("/api/draft-email", methods=["POST"])
def draft_email():
    notes = request.get_json(silent=True) or {}

    # Allow frontend settings to override server env vars
    ollama_url   = (notes.pop("_ollama_url",   None) or OLLAMA_BASE_URL).rstrip("/")
    ollama_model = notes.pop("_ollama_model", None) or OLLAMA_MODEL

    sender = {
        "name":  notes.pop("_sender_name",  None) or SENDER_NAME,
        "title": notes.pop("_sender_title", None) or SENDER_TITLE,
        "msp":   notes.pop("_msp_name",     None) or MSP_NAME,
        "email": notes.pop("_sender_email", None) or SENDER_EMAIL,
        "phone": notes.pop("_sender_phone", None) or SENDER_PHONE,
    }
    user_prompt = build_user_prompt(notes, sender)

    payload = {
        "model": ollama_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "temperature": 0.7,
    }

    log.info("Drafting email for company=%r model=%s", notes.get("company"), ollama_model)

    try:
        resp = requests.post(
            f"{ollama_url}/v1/chat/completions",
            json=payload,
            timeout=OLLAMA_TIMEOUT,
        )
    except requests.exceptions.Timeout:
        return jsonify(error=(
            f"Ollama timed out after {OLLAMA_TIMEOUT}s. The model may be loading "
            "(first run pulls weights into RAM) or the hardware is too slow for "
            f"{ollama_model}. Try a smaller model like llama3.2:3b."
        )), 504
    except requests.exceptions.ConnectionError:
        return jsonify(error=(
            f"Cannot reach Ollama at {ollama_url}. Check the URL in Settings "
            "or the OLLAMA_BASE_URL env var, confirm Ollama is running, and that "
            "the container can reach it (see README on Docker networking)."
        )), 502
    except requests.exceptions.RequestException as e:
        return jsonify(error=f"Request to Ollama failed: {e}"), 502

    if not resp.ok:
        return jsonify(
            error=f"Ollama returned HTTP {resp.status_code}: {resp.text[:300]}"
        ), 502

    try:
        data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()
    except (ValueError, KeyError, IndexError, TypeError) as e:
        return jsonify(error=f"Unexpected response shape from Ollama: {e}"), 502

    # Split subject line from body
    subject = ""
    body = content
    first_line = content.split("\n", 1)[0]
    if first_line.lower().startswith("subject:"):
        subject = first_line[8:].strip()
        body = content[len(first_line):].strip()

    return jsonify(draft=body, subject=subject, model=ollama_model)


if __name__ == "__main__":
    # Dev server. Production uses gunicorn (see Dockerfile).
    app.run(host="0.0.0.0", port=8000, debug=False)
