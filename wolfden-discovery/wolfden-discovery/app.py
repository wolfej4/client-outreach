"""
Wolfden Discovery — MSP discovery notes app.

A small Flask app that serves a single-page UI for capturing notes during
in-person MSP discovery meetings, and drafts a follow-up email by calling
a local Ollama instance via its OpenAI-compatible endpoint.

Configuration is via environment variables — see README.md.
"""
from __future__ import annotations

import os
import logging
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


# ---- Prompts --------------------------------------------------------------

SYSTEM_PROMPT = """You are drafting follow-up emails after in-person discovery \
meetings between an MSP (managed services provider) and a prospective client.

Style requirements:
- Warm, professional, conversational. Sound like a human who actually listened.
- Avoid corporate jargon: no "synergy", "leverage", "circle back", "touch base".
- Avoid superlatives: no "delighted", "thrilled", "excited".
- Never open with "I hope this email finds you well" or similar.
- No em-dashes used as decorative punctuation.

Structure:
1. A specific, human opening that references something concrete they shared \
(a pain point, a situation, a goal). One or two sentences.
2. A short middle that acknowledges their priorities and timeline naturally.
3. One or two concrete next steps appropriate to their situation. Be specific.
4. A plain sign-off followed by the sender's name on a new line. Use \
"Talk soon," or "Thanks," — not "Best regards" or "Sincerely".

Length: 150 to 220 words. Output the email body only — no subject line, no \
"Dear" salutation (use just "Hi <first name>,"). Do not include placeholders \
in brackets like [your name] — use the actual sender info provided."""


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


@app.route("/api/draft-email", methods=["POST"])
def draft_email():
    notes = request.get_json(silent=True) or {}

    sender = {
        "name": SENDER_NAME,
        "title": SENDER_TITLE,
        "msp": MSP_NAME,
        "email": SENDER_EMAIL,
        "phone": SENDER_PHONE,
    }
    user_prompt = build_user_prompt(notes, sender)

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "temperature": 0.7,
    }

    log.info("Drafting email for company=%r model=%s", notes.get("company"), OLLAMA_MODEL)

    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/v1/chat/completions",
            json=payload,
            timeout=OLLAMA_TIMEOUT,
        )
    except requests.exceptions.Timeout:
        return jsonify(error=(
            f"Ollama timed out after {OLLAMA_TIMEOUT}s. The model may be loading "
            "(first run pulls weights into RAM) or the hardware is too slow for "
            f"{OLLAMA_MODEL}. Try a smaller model like llama3.2:3b."
        )), 504
    except requests.exceptions.ConnectionError:
        return jsonify(error=(
            f"Cannot reach Ollama at {OLLAMA_BASE_URL}. Check the OLLAMA_BASE_URL "
            "env var, that Ollama is running, and that the container can reach it "
            "(see README on Docker networking)."
        )), 502
    except requests.exceptions.RequestException as e:
        return jsonify(error=f"Request to Ollama failed: {e}"), 502

    if not resp.ok:
        return jsonify(
            error=f"Ollama returned HTTP {resp.status_code}: {resp.text[:300]}"
        ), 502

    try:
        data = resp.json()
        draft = data["choices"][0]["message"]["content"].strip()
    except (ValueError, KeyError, IndexError, TypeError) as e:
        return jsonify(error=f"Unexpected response shape from Ollama: {e}"), 502

    return jsonify(draft=draft, model=OLLAMA_MODEL)


if __name__ == "__main__":
    # Dev server. Production uses gunicorn (see Dockerfile).
    app.run(host="0.0.0.0", port=8000, debug=False)
