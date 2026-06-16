# StudCast (Lone Ranger Estimator) — Project Instructions

## What This Is

**StudCast / Lone Ranger Estimator** — an AI-powered construction estimator for independent contractors. Core loop: a contractor speaks or types a job description → Gemini extracts materials + labor → a 3-tier pricing waterfall prices it → the contractor reviews an editable ledger → a Puppeteer-rendered PDF estimate is emailed out.

Multi-tenant SaaS, one tenant per E.164 phone number. Hosted on Google Cloud Run.

---

## Architecture

### Backend — `src/server.js` (single Express file)
- **AI extraction (two paths in `POST /api/process-text`, forked on the `PIPELINE_V2` env flag):**
  - *Legacy monolith:* one Gemini `EXTRACTION_PROMPT` call → `mergeIntoLedger`.
  - *`PIPELINE_V2=true`:* deterministic 3-stage pipeline in `src/lib/` — **Estimator** (LLM, scope) → **Pricer** (deterministic) → **Reviewer** (LLM, QA), via `createPipeline({db, ai}).runPipeline()`.
  - Both share the `persistLedger()` helper. Model: `gemini-3.5-flash`. (Remove the legacy branch once V2 is validated in prod.)
- **Pricing waterfall:** `assignUnitPrice()` / `assignLaborRate()` in `src/lib/pricingEngine.js` — explicit user price (`override`) → per-tenant `price_book` (`database`) → AI estimate (`ai`); labor adds a `default_labor_rate` tier.
- **Persistence:** Cloud Firestore, scoped under `users/{E.164phone}/…` (`estimates`, `settings/config`, `price_book`).
- **Auth:** Google OAuth ID tokens — `requireAuth` middleware verifies `Authorization: Bearer <token>`, resolves email → phone.
- **Billing:** Stripe — `requireSubscription` gate; `POST /api/billing/verify-session` activates subscriptions directly via the Stripe API (webhook-independent).
- **SMS:** Twilio OTP, **gated behind the `SMS_LIVE` env flag**. While `SMS_LIVE !== 'true'`, OTP routes through the Gmail email fallback (Twilio accepts unregistered 10DLC sends as "queued" but carriers reject async with error 30034). Flip `SMS_LIVE=true` once the A2P campaign is approved.
- **PDF:** Puppeteer (headless Chrome) renders the estimate and emails it via Nodemailer. The estimate PDF flow is `POST /api/generate-pdf` — fully self-contained, builds its HTML inline.

### Frontend — `ui/` (React 19 + Vite + TypeScript + Tailwind v4)
Served at `/dashboard` (built inside the Dockerfile, output to `ui/dist/`). "Cosmic glass" aesthetic: real starfield photo background, glassmorphism panels, a voice orb (with a barrel-roll animation into theater mode), a three-state Three.js material-yard visualizer (mini PIP → theater → fullscreen), an inline editable ledger, an editable scope-of-work field, and CSV supplier-price upload.

Components:
- `ui/src/App.tsx` — orchestrator: auth bootstrap (reads `authBearerToken` from localStorage, redirects to `/` on 401), API wiring, state.
- `ui/src/components/ThreeVisualizer.tsx` — WebGL material yard (**Stack mode only**): ledger items classified into physically-dimensioned stacks (`visualizer/catalog.ts`), procedural textures (`visualizer/textures.ts`), instanced per-piece geometry, shelf-packed layout, raycast tooltips.
- `ui/src/components/LedgerTable.tsx` — materials/labor tables (mobile cards + desktop table), scope-of-work, publish button.
- `ui/src/components/SettingsModal.tsx`, `EstimateList.tsx` — profile modal, project switcher (with delete).
- `ui/src/types.ts` — shared interfaces.

### Design system (read before frontend work)
- **`PRODUCT.md`** (strategic) + **`DESIGN.md`** (visual) at the repo root are the source of truth for the "Command Bridge" cosmic-glass system: register, brand voice, anti-references, color/type rules, component specs. `.impeccable/design.json` is the machine-readable sidecar. Generated/maintained via the `impeccable` skill.
- **Design tokens live in `ui/src/index.css` `@theme`** (Tailwind v4). Use them, don't hard-code:
  - **Color:** `cool-blue` = trust (money/totals/primary actions), `soft-violet` = AI/intelligence only; `live-emerald` = status/"from the source", `alert-rose` = destructive/error only; `navy-deep`/`navy-violet` = secondary-CTA gradient. Don't use raw Tailwind `emerald-*`/`rose-*` or hex.
  - **Type:** fixed `rem` scale with an **11px floor** — `text-micro` (11px, labels/badges) and `text-mini` (13px, data/body) below Tailwind's `text-base`/`lg`/`xl`. No ad-hoc `text-[Npx]`. Fully applied in `LedgerTable.tsx`, `App.tsx` + `ThreeVisualizer.tsx`; `SettingsModal`/`EstimateList` are not yet migrated.

### Legacy onboarding — `public/dashboard.html` at `/dashboard-legacy`
The hardened registration flow (Google OAuth → phone OTP → profile wizard) still lives here. After auth completes, `activateDashboard()` redirects into the React app at `/dashboard`. Landing page is `public/index.html` at `/`.

### 3D + AR
Three.js material yard only (`ThreeVisualizer.tsx`). The old single-wall "Build Layer" and the abandoned Unity WebGL pipeline have both been fully removed.

**WebXR AR is live on mobile.** `ThreeVisualizer` checks `navigator.xr.isSessionSupported('immersive-ar')` at init and fires `onARReady` with a toggle callback when supported. Two UI entry points in `App.tsx`: a pulsing "View in AR" pill below the mini PIP, and a circle button inside theater/fullscreen mode. On session start the yard scales feet → meters and all non-material scene elements (ground, grid, trucks) hide so stacks float over the real-world camera feed. Works on Chrome Android and Safari iOS 16+.

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

## Local development
- **Run the UI:** `cd ui && npm run dev` → http://localhost:5173/dashboard/ (Vite `base: '/dashboard/'`).
- **DEV auth bypass:** in dev (`import.meta.env.DEV`), `App.tsx`'s boot effect skips the auth/backend dance and renders built-in demo estimates — no login or backend needed. Production still does real Google-OAuth-token auth (redirect to `/` on missing token / 401). Hitting `/api` with a non-real token returns 401, whose handler redirects, so the dev bypass exists to avoid that reload loop.
- **ngrok HMR is opt-in:** set `NGROK_HOST=<reserved-domain> npm run dev` to route the HMR websocket through a tunnel (`vite.config.ts`). Without it, plain localhost HMR is used.
- `/api` is proxied to `localhost:8080` (the Express backend) in dev.

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
