# QueueStorm Warmup · PYM_Particles

> **Live deployment:** [https://webservicephising.onrender.com](https://webservicephising.onrender.com)
> · **Dashboard:** [https://webservicephising.onrender.com/](https://webservicephising.onrender.com/)
> · **Health check:** [https://webservicephising.onrender.com/health](https://webservicephising.onrender.com/health)

A hackathon mock preliminary API for team **PYM_Particles** that classifies digital-finance customer support tickets and routes them to the right back-office team.

The service accepts one support ticket and returns a structured classification:

| Field | Type | Meaning |
| --- | --- | --- |
| `case_type` | enum | What the ticket is about |
| `severity` | enum | How urgent it is |
| `department` | enum | Which team should handle it |
| `agent_summary` | string | Neutral one-line summary for the agent |
| `human_review_required` | boolean | Whether a human must look at it |
| `confidence` | number (0–1) | Classifier confidence |

A deterministic **rule-based classifier** is the source of truth. An **optional Google Gemini** layer can enrich the result on top. If Gemini is disabled, unavailable, times out, or returns invalid output, the API falls back to the rule-based result so the response is **always valid**.

---

## Table of contents

- [Live service](#live-service)
- [Tech stack](#tech-stack)
- [Endpoints](#endpoints)
  - [GET /health](#get-health)
  - [POST /sort-ticket](#post-sort-ticket)
  - [GET / (Dashboard)](#get--dashboard)
- [Safety rules](#safety-rules)
- [Classification priority](#classification-priority)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Sample tickets and expected results](#sample-tickets-and-expected-results)
- [Testing the live deployment](#testing-the-live-deployment)
- [Deploying your own copy on Render](#deploying-your-own-copy-on-render)
- [Project structure](#project-structure)
- [Submission form values](#submission-form-values)
- [Known issues or blockers](#known-issues-or-blockers)

---

## Live service

| Resource | URL |
| --- | --- |
| Dashboard (HTML) | `https://webservicephising.onrender.com/` |
| Liveness | `https://webservicephising.onrender.com/health` |
| Classification API | `https://webservicephising.onrender.com/sort-ticket` |

The dashboard at `/` is a single static page that calls `/sort-ticket` and `/health` on the same origin — open it in any browser to try the API without `curl`.

---

## Tech stack

- Node.js (>= 18)
- Express 4
- TypeScript 5
- Google Gemini API (optional, via `@google/genai`)
- Deterministic rule-based fallback
- Single Render Web Service (no separate frontend, no database, no auth, no file uploads)

## Endpoints

### GET /health

Simple liveness check. Always returns JSON.

```bash
curl https://webservicephising.onrender.com/health
```

```json
{
  "status": "ok",
  "service": "queuestorm-warmup",
  "team": "PYM_Particles",
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

This is the path configured in the Render health check.

### POST /sort-ticket

Classifies a single ticket.

```bash
curl -X POST https://webservicephising.onrender.com/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "T-001",
    "channel":   "app",
    "locale":    "en",
    "message":   "I sent 5000 taka to a wrong number this morning, please help me get it back"
  }'
```

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `ticket_id` | string | ✅ | Echoed back in the response |
| `message` | string | ✅ | Non-empty, max 4000 chars |
| `channel` | string | ❌ | `app` / `chat` / `call` / `web` — accepted, ignored by the classifier |
| `locale` | string | ❌ | `en` / `bn` — accepted, ignored by the classifier |

**Successful response** (exact 7-field schema, no extra fields):

```json
{
  "ticket_id": "T-001",
  "case_type": "wrong_transfer",
  "severity": "high",
  "department": "dispute_resolution",
  "agent_summary": "Customer reports sending 5000 BDT to a wrong recipient and requests recovery support.",
  "human_review_required": false,
  "confidence": 0.85
}
```

**Allowed `case_type` values**

- `wrong_transfer`
- `payment_failed`
- `refund_request`
- `phishing_or_social_engineering`
- `other`

**Allowed `severity` values**

- `low`
- `medium`
- `high`
- `critical`

**Allowed `department` values**

- `customer_support`
- `dispute_resolution`
- `payments_ops`
- `fraud_risk`

**Error responses**

- `400 { "error": "Invalid JSON body" }` — body is missing or not valid JSON
- `400 { "error": "ticket_id is required and must be a string" }`
- `400 { "error": "message is required and must be a non-empty string" }`
- `404 { "error": "Not Found", "path": "..." }` — any other unmatched route returns JSON, not HTML

### GET / (Dashboard)

For convenience, the same Express app also serves a small static dashboard at `/`. It is a single HTML page with a form, six sample tickets, color-coded result chips, and a raw-JSON viewer that calls `POST /sort-ticket` under the hood.

- Static assets live in `public/` and are served via `express.static`.
- The JSON API is still the real contract for submissions. The dashboard is just a reviewer-friendly UI for poking at the API in a browser.
- Unknown paths still return a JSON 404, so the dashboard never breaks API clients.

## Safety rules

The `agent_summary` field is always a **neutral summary** of what the customer reported. The service will never ask the customer to share:

- OTP
- PIN
- Password / passcode
- Verification code
- CVV
- Full card number or card details

If Gemini ever tries to produce such a sentence, it is rejected and the rule-based summary is used instead.

## Classification priority

When multiple categories could match a single message, the classifier uses this priority order:

1. `phishing_or_social_engineering`
2. `wrong_transfer`
3. `payment_failed`
4. `refund_request`
5. `other`

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

`npm run dev` starts the server with `tsx watch` on port 3000 (or whatever `PORT` is set to in `.env`).

## Environment variables

Create a `.env` file based on `.env.example`:

```env
PORT=3000
USE_GEMINI=true
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_TIMEOUT_MS=8000
```

Notes:

- Never commit `.env` or `.env.local`. They are ignored via `.gitignore`.
- Never hardcode `GEMINI_API_KEY` in code or in the repo.
- If `GEMINI_API_KEY` is empty, the service runs in rule-based-only mode.
- If `USE_GEMINI=false`, the service runs in rule-based-only mode.
- Gemini calls have a timeout (`GEMINI_TIMEOUT_MS`, default 8000ms) and fall back to rule-based on any failure.

## Local test commands

```bash
curl http://localhost:3000/health
```

```bash
curl -X POST http://localhost:3000/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{"ticket_id":"T-001","channel":"app","locale":"en","message":"I sent 3000 to wrong number"}'
```

```bash
curl -X POST http://localhost:3000/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{"ticket_id":"T-002","message":"Payment failed but balance deducted"}'
```

```bash
curl -X POST http://localhost:3000/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{"ticket_id":"T-003","message":"Someone called asking my OTP, is that bKash?"}'
```

```bash
curl -X POST http://localhost:3000/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{"ticket_id":"T-004","message":"Please refund my last transaction, I changed my mind"}'
```

```bash
curl -X POST http://localhost:3000/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{"ticket_id":"T-005","message":"App crashed when I opened it"}'
```

Expected case types / severities:

| Message | case_type | severity |
| --- | --- | --- |
| `I sent 3000 to wrong number` | `wrong_transfer` | `high` |
| `Payment failed but balance deducted` | `payment_failed` | `high` |
| `Someone called asking my OTP, is that bKash?` | `phishing_or_social_engineering` | `critical` |
| `Please refund my last transaction, I changed my mind` | `refund_request` | `low` |
| `App crashed when I opened it` | `other` | `low` |

## Production test commands (after Render deployment)

```bash
curl https://your-service-name.onrender.com/health
```

```bash
curl -X POST https://your-service-name.onrender.com/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{"ticket_id":"T-001","message":"Someone called asking my OTP, is that bKash?"}'
```

## Render deployment guide

Step 1: Push this project to a public GitHub repository.

Step 2: Go to the Render Dashboard.

Step 3: Click **New +**.

Step 4: Select **Web Service**.

Step 5: Connect the public GitHub repository.

Step 6: Use these settings:

- **Name:** `queuestorm-warmup-pym-particles`
- **Runtime:** Node
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Health Check Path:** `/health`

Step 7: Add environment variables:

- `USE_GEMINI=true`
- `GEMINI_API_KEY=<your Gemini API key>`
- `GEMINI_MODEL=gemini-2.5-flash-lite`
- `GEMINI_TIMEOUT_MS=8000`

If you don't have a Gemini API key yet, set `USE_GEMINI=false` to deploy in rule-based-only mode.

Step 8: Click **Deploy**.

Step 9: Copy the Render live URL. It will look like:

```
https://queuestorm-warmup-pym-particles.onrender.com
```

Step 10: Test the live service:

```
https://queuestorm-warmup-pym-particles.onrender.com/health
```

A `render.yaml` is included in this repo so Render can also deploy it as an "Infrastructure as Code" service. Remember to set `GEMINI_API_KEY` as a secret in the Render dashboard — it is marked `sync: false` in `render.yaml` so it is not synced into the repo.

## Project structure

```
src/
  index.ts                # Express server entry point
  routes/
    health.ts             # GET /health
    sortTicket.ts         # POST /sort-ticket
  services/
    classifier.ts         # Deterministic rule-based classifier
    gemini.ts             # Optional Gemini integration
  types/
    ticket.ts             # Shared TypeScript types
  utils/
    text.ts               # Amount detection helpers
    validation.ts         # Request + Gemini response validation
    safety.ts             # Unsafe-summary detection
public/
  index.html              # Static dashboard markup
  styles.css              # Dashboard styling
  app.js                  # Dashboard JS (calls /health and /sort-ticket)
.env.example
.gitignore
README.md
package.json
render.yaml
tsconfig.json
```

## Submission form values

- **Team name:** `PYM_Particles`
- **GitHub repository URL:** `<your public GitHub repo URL>`
- **Live API base URL:** `https://your-service-name.onrender.com`
- **Deployment platform:** `Render`
- **LLM used:** `Yes - Google Gemini API, with deterministic rule-based fallback.`

## Known issues or blockers

- Render free services may spin down after inactivity, so the first request after idle can be slower.
- Gemini may also be rate-limited or unavailable, so the API falls back to rule-based classification.
- The rule-based classifier is the source of truth; Gemini is only an enhancement.
