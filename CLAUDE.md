# StudCast (Lone Ranger Estimator) — Project Instructions

## What This Is

**StudCast / Lone Ranger Estimator** — an AI-powered construction estimator for independent contractors. Core loop: a contractor speaks or types a job description → Gemini extracts materials + labor → a 3-tier pricing waterfall prices it → the contractor reviews an editable ledger → a Puppeteer-rendered PDF estimate is emailed out.

Multi-tenant SaaS, one tenant per E.164 phone number. Hosted on Google Cloud Run.

---

## Architecture

### Backend — `src/server.js` (single Express file)
- **AI extraction:** Gemini via `@google/genai` SDK — `EXTRACTION_PROMPT` turns transcripts into structured material/labor JSON (`mergeIntoLedger`).
- **Pricing waterfall:** `assignUnitPrice()` / `assignLaborRate()` — explicit user price → per-tenant `price_book` → AI estimate fallback.
- **Persistence:** Cloud Firestore, scoped under `users/{E.164phone}/…` (`estimates`, `settings/config`, `price_book`).
- **Auth:** Google OAuth ID tokens — `requireAuth` middleware verifies `Authorization: Bearer <token>`, resolves email → phone.
- **Billing:** Stripe — `requireSubscription` gate; `POST /api/billing/verify-session` activates subscriptions directly via the Stripe API (webhook-independent).
- **SMS:** Twilio OTP, **gated behind the `SMS_LIVE` env flag**. While `SMS_LIVE !== 'true'`, OTP routes through the Gmail email fallback (Twilio accepts unregistered 10DLC sends as "queued" but carriers reject async with error 30034). Flip `SMS_LIVE=true` once the A2P campaign is approved.
- **PDF:** Puppeteer (headless Chrome) renders the estimate and emails it via Nodemailer. The estimate PDF flow is `POST /api/generate-pdf` — fully self-contained, builds its HTML inline.

### Frontend — `ui/` (React 18 + Vite + TypeScript)
Served at `/dashboard` (built inside the Dockerfile, output to `ui/dist/`). "Cosmic glass" aesthetic: real starfield photo background, glassmorphism panels, a voice orb (with a barrel-roll animation into theater mode), a three-state Three.js material-yard visualizer (mini PIP → theater → fullscreen), an inline editable ledger, an editable scope-of-work field, and CSV supplier-price upload.

Components:
- `ui/src/App.tsx` — orchestrator: auth bootstrap (reads `authBearerToken` from localStorage, redirects to `/` on 401), API wiring, state.
- `ui/src/components/ThreeVisualizer.tsx` — WebGL material yard (**Stack mode only**).
- `ui/src/components/LedgerTable.tsx` — materials/labor tables (mobile cards + desktop table), scope-of-work, publish button.
- `ui/src/components/SettingsModal.tsx`, `EstimateList.tsx` — profile modal, project switcher (with delete).
- `ui/src/types.ts` — shared interfaces.

### Legacy onboarding — `public/dashboard.html` at `/dashboard-legacy`
The hardened registration flow (Google OAuth → phone OTP → profile wizard) still lives here. After auth completes, `activateDashboard()` redirects into the React app at `/dashboard`. Landing page is `public/index.html` at `/`.

### 3D
Three.js material yard only. The old single-wall "Build Layer" and the abandoned Unity WebGL pipeline have both been fully removed.

---

## Key Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/process-text` / `/api/process` | Text / audio → Gemini extraction → merge into estimate |
| GET/POST | `/api/estimates`, `/api/estimates/:id`, `…/save` | List / load / save estimates |
| DELETE | `/api/estimates/:id` | Delete estimate |
| POST | `/api/generate-pdf` | Render estimate PDF + email |
| GET/POST | `/api/settings` | Contractor profile |
| POST | `/api/upload-csv` | Bulk supplier prices → `price_book` |
| POST | `/api/billing/create-checkout-session`, `…/verify-session` | Stripe |
| POST | `/api/auth/register`, `…/verify-otp` | Registration + OTP |
| POST | `/api/webhook` | Inbound SMS → ledger (validates `x-twilio-signature`) |

---

## Deploy
Docker → Cloud Run service `lone-ranger-app` (us-central1). The Dockerfile installs Chromium, builds the React app, and prunes dev deps. Secrets (Gemini key, Stripe keys, Twilio auth token, Gmail pass) live in Google Secret Manager; non-secret config as plain env vars.

```bash
gcloud builds submit --tag gcr.io/$(gcloud config get-value project)/lone-ranger-app
gcloud run deploy lone-ranger-app --image gcr.io/$(gcloud config get-value project)/lone-ranger-app --region us-central1 --platform managed --allow-unauthenticated
```
Env-only changes (no rebuild): `gcloud run services update lone-ranger-app --region us-central1 --update-env-vars KEY=VALUE`.

---

## Repo
`https://github.com/iPolluxx/StudCast` — main branch: `main`.

**Living context doc:** `docs/GEMINI_HANDOFF.md` — full session log, architecture decisions, schema, and open items. Read it before starting a session; update it after significant changes.
