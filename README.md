# Wolfden Discovery

A small, single-page web app for capturing structured notes during in-person
MSP discovery meetings — and drafting a tailored follow-up email through your
local Ollama before you walk back to the car.

Designed to be used by **you** during a meeting on an iPad. Not a public-facing
intake form.

## What it does

- Touch-friendly chips and free-text fields for capturing the prospect's
  business profile, current IT setup, pain points, priorities, and decision
  process.
- Saves each meeting to browser `localStorage` so you can reopen and edit
  later. Up to 50 recent meetings shown in the **Recent** drawer.
- One tap on **Draft follow-up email** sends the captured notes to your
  Ollama server with a tuned system prompt that produces a warm, specific,
  non-sales-template follow-up.
- Copy the draft, regenerate it, or open it directly in your mail app
  (`mailto:` with To and Subject prefilled).

No cloud calls. No telemetry. Your notes stay on the iPad; the draft round-trip
goes only to your local Ollama.

## Stack

- Python 3.12 + Flask + gunicorn (single-file backend, ~150 lines)
- Vanilla JS frontend, no build step
- One Docker container

## Deploying in Portainer

The easiest path is **Stacks → Web editor**.

1. SSH to your Unraid box and drop these files in
   `/mnt/user/appdata/msp-discovery/` (or any path Portainer can read).
2. In Portainer: **Stacks → Add stack → Web editor**, name it
   `msp-discovery`, paste the contents of `docker-compose.yml`, then under
   **Environment variables** set the values you care about (or leave the
   defaults). Defaults assume Ollama is reachable at
   `http://host.docker.internal:11434`.
3. Toggle **Enable access control** if you share the Portainer instance.
4. **Deploy the stack**. Portainer builds the image from the Dockerfile and
   starts the container. The web UI is then on port `8742` (override in the
   compose file if you want).

If you'd rather not give Portainer the build context, you can build once on
the host:

```sh
cd /mnt/user/appdata/msp-discovery
docker build -t msp-discovery:latest .
```

…then change `build: .` to `image: msp-discovery:latest` in the compose file
and deploy.

## Configuration

All via env vars; see `.env.example`. The two that matter most:

| Variable | What it does |
|---|---|
| `OLLAMA_BASE_URL` | Where to reach Ollama (must be reachable from inside the container — see below) |
| `OLLAMA_MODEL` | Any model you've pulled with `ollama pull`. Defaults to `llama3.1:8b`. |

`SENDER_NAME`, `SENDER_TITLE`, `SENDER_EMAIL`, `SENDER_PHONE`, `MSP_NAME` get
fed into the email-drafting prompt so the sign-off is yours, not a placeholder.
`MSP_NAME` also replaces "Wolfden" in the page header.

`SENDER_LOCATION` shows next to the date in the header (the
"May 4 · Crestview, FL" line in the mockup).

## Reaching Ollama from inside the container

The compose file adds `host.docker.internal:host-gateway` to `extra_hosts`,
which makes that hostname resolve to the Docker host on Linux. If your Ollama
runs on the host (the typical Unraid setup), the default `OLLAMA_BASE_URL`
just works.

If your Ollama runs as another container, point at its container name and
join the same Docker network. Uncomment the `networks` block in the compose
file and set:

```yaml
environment:
  OLLAMA_BASE_URL: http://ollama:11434
networks:
  - homelab
```

You can sanity-check connectivity any time at `/api/health` — it returns the
list of models Ollama is currently exposing and whether your configured model
is among them.

## Putting it behind NPM + Pocket ID

This app has no auth — protect it at the edge.

In Nginx Proxy Manager, point a host like `discovery.wolfe.house` at
`http://<unraid-ip>:8742`, enable HTTPS, and use the standard Pocket ID OIDC
proxy config you already use for your other internal apps. The container only
needs to be reachable from NPM, so don't expose `8742` to the LAN if you can
help it (NPM and the app on a private Docker network is cleanest).

The app is happy behind a reverse proxy; nothing here cares about its public
URL or path.

## Model picks for an i5-6500 Ollama box

CPU-only, no GPU, no AVX-512:

- `llama3.2:3b` — drafts in ~10–15s. Decent but plain prose.
- `llama3.1:8b` (default) — ~30–50s. Noticeably warmer, more specific.
- `qwen2.5:7b` — comparable to llama3.1:8b, sometimes tighter prose.

No tool calling required — this is plain chat completion via Ollama's
OpenAI-compatible endpoint, so any chat-tuned model works.

## Where data lives

- **Meeting notes** → browser `localStorage` only. Per device. If you want
  notes synced or persisted server-side, point the `Save` button at NocoDB:
  in `static/app.js`, swap `writeHistory(history)` for a `fetch` to your
  NocoDB REST endpoint (the v2 API is documented at `/api/v2/...`). The
  shape of each record is already JSON-friendly.
- **Email drafts** → not persisted. Generated on demand from current notes.

## Local development

```sh
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
OLLAMA_BASE_URL=http://localhost:11434 python app.py
```

Then open http://localhost:8000.

## Roadmap hooks

If you want to extend this later, the natural next steps are:

- **Voice memo capture** — a record button on the page, ship audio to a local
  Whisper container, run the transcript through Ollama with an extraction
  prompt that fills the form fields. Lets you put the iPad face-down.
- **NocoDB sync** — swap `localStorage` for HTTP to a NocoDB table (one row
  per meeting). Status field for pipeline tracking.
- **Multiple email tones** — radio between "warm/personal", "tight/exec",
  "technical/detailed" before drafting; just changes the system prompt.
- **Export** — a "Print / save as PDF" button that styles the captured notes
  for filing.

## License

Use it however you want.
