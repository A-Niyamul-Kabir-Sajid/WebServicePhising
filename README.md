# QueueStorm Warmup - PYM_Particles

Backend-only API service for classifying digital finance customer support tickets.

This is a hackathon mock preliminary API for team **PYM_Particles**. The service accepts one customer support ticket and returns a structured classification (case type, severity, department, agent summary, confidence, and whether human review is required).

The service uses a deterministic **rule-based classifier** as the source of truth, with an **optional Google Gemini** enhancement layer on top. If Gemini is disabled, unavailable, times out, or returns invalid output, the API falls back to the rule-based result so the response is always valid.

## Tech stack

- Node.js (>= 18)
- Express
- TypeScript
- Google Gemini API (optional)
- Rule-based fallback
- Render Web Service (single deployable)

## Endpoints

### GET /health

Simple liveness check. Always returns JSON.

```json
{
  "status": "ok",
  "service": "queuestorm-warmup",
  "team": "PYM_Particles",
  "timestamp": "2026-06-25T12:00:00.000Z"
}
```

### POST /sort-ticket

Request body:

```json
{
  "ticket_id": "T-001",
  "channel": "app",
  "locale": "en",
  "message": "I sent 5000 taka to a wrong number this morning, please help me get it back"
}
```

Required fields:

- `ticket_id` (string)
- `message` (string, non-empty)

Optional fields (accepted but ignored for now): `channel`, `locale`.

Successful response (exact schema, no extra fields):

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

Allowed `case_type` values:

- `wrong_transfer`
- `payment_failed`
- `refund_request`
- `phishing_or_social_engineering`
- `other`

Allowed `severity` values:

- `low`
- `medium`
- `high`
- `critical`

Allowed `department` values:

- `customer_support`
- `dispute_resolution`
- `payments_ops`
- `fraud_risk`

Error responses:

- `400 { "error": "Invalid JSON body" }` — body is missing or not valid JSON
- `400 { "error": "ticket_id is required and must be a string" }`
- `400 { "error": "message is required and must be a non-empty string" }`

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
