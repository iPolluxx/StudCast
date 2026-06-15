# Lone Ranger Estimator — Live Project Context
> **Purpose:** This document is the handoff bridge between Gemini brainstorming sessions and Claude Code
> implementation sessions. Update it after every meaningful work session.
> **Last updated:** 2026-06-14 — **Deterministic Takeoff Engine** (quantity-accuracy hardening): new Stage 1.5 between Estimator and Pricer. The LLM now extracts *dimensions*; engineering formulas (IRC 2021 R602.7 / Wisconsin UDC SPS 321.25, RSMeans/NAHB) compute the quantities for wall framing, drywall, and exterior sheathing. Structural headers are sized via a cited span-table lookup (`src/data/spanTables.json`) that never interpolates — out-of-range spans (16 ft garage / engineered LVL) return "confirm with supplier". Formula lines are idempotent (REPLACE-by-`assemblyId` in `persistLedger`, manual edits demote to `override`). UI shows a "Calc'd" provenance badge with visible assumptions. Accuracy eval 0.638 → 1.000. Shipped commit `8f5142b`; rollback tag `pre-takeoff-engine` (`295d1c0`). Also: removed the demo-mode paywall leak (silent local parser → subscription gate + `/watch` video page). Earlier: Change Order upgrades (job-site photo upload, white-labeling, ESIGN consent, SHA-256 audit hash), CO/Invoice flow hardening, invoice PDF fix, type-scale migration, live mic, real change orders, master price sheet.

---

## What This App Is

**Lone Ranger Estimator** — a multi-tenant SaaS platform for independent contractors. The core loop:

1. Contractor speaks or types a job scope (voice, text, or SMS)
2. Gemini AI extracts structured scope from the transcript — *dimensions and typed assemblies*, plus loose materials + labor
2.5 A deterministic **Takeoff** stage computes material *quantities* from engineering formulas for known assemblies (wall framing, drywall, sheathing); where no formula applies, the LLM quantity is the fallback
3. Items are priced via a 4-tier waterfall: **explicit user price (`override`) → per-user `price_book` (`database`) → Menards market (`market`) → AI estimate (`ai`)**, plus a labor-default tier (see Pricing Engine below)
4. Contractor reviews/edits an interactive ledger
5. Clicks "Generate PDF" → Puppeteer renders a professional estimate, emails it to the contractor
6. Stripe handles subscriptions; Firestore is the database

> **One extraction/pricing path (steps 2–3).** As of 2026-06-07 the legacy monolith is gone. All three
> ingestion routes — `POST /api/process-text`, `POST /api/webhook` (SMS), and `POST /api/process` (audio) —
> run the **deterministic 3-stage pipeline** unconditionally (Estimator → Pricer → Reviewer;
> `src/lib/pipeline.js` → `createPipeline`), then persist via the shared `persistLedger()` helper. The
> `PIPELINE_V2` env flag, the `mergeIntoLedger` function, and the per-route legacy branches no longer exist.
> Full detail in **§ Sprint 2** below.

**Primary user:** Small independent contractors (plumbers, framers, roofers, general contractors) who currently
do estimates by hand or in spreadsheets. The killer feature is voice → bid in under 60 seconds from a job site.

---

## Architecture: Supervisor / Builder

Two fully separate layers. Unity WebGL was abandoned 2026-05-31 in favor of native Three.js for iteration speed and zero compilation cost.

### AI Supervisor (existing — `src/server.js`)
- Node.js / Express backend
- Receives voice/text input
- Calls Gemini to interpret contractor intent
- Emits deterministic JSON command packets
- Handles all business logic, auth, Stripe, PDF, Firestore
- **Service layer (`src/lib/`):** deterministic utilities and pricing logic are extracted into a dedicated module layer; `server.js` requires from there rather than defining inline. See below.

### Deterministic Builder (live — `public/dashboard.html` VizController)
- Three.js running in the browser — no compilation, no VM needed
- Two modes in the same visualizer panel:
  - **Stack Layer** — deterministic digital twin of a commercial lumber drop; scaled bounding box lifts, dunnage, wrapped texture, loose remainders, truck+trailer fleet, raycasting tooltips, HUD weight display
  - **Build Layer** — deterministic wall framing (plates, studs, openings) driven by Supervisor JSON
- Receives JSON packets from `POST /api/estimate/voice-to-json`
- NO AI, NO inference — pure deterministic geometry from framing math
- Strict contract: malformed JSON defaults to safe values via `sanitizePhase1Intent()`

**The key rule:** The Supervisor thinks. The Builder builds. They never swap roles.

**Unity status:** The `unity/` folder and C# scripts remain in the repo but are not part of the web product. GCP VM (`lone-ranger-unity-desktop`) is stopped and only needed if Unity standalone work resumes.

---

## Sprint 2: Deterministic 3-Stage Pipeline (now the sole extraction path)

The monolithic "one big Gemini extract-and-price call" has been **fully replaced** by a deterministic
pipeline that quarantines non-determinism to exactly **two auditable LLM boundaries**, with pure math in
the middle. (The legacy monolith and the `PIPELINE_V2` flag were retired 2026-06-07.)

> **Updated 2026-06-14:** a deterministic **Takeoff** stage (1.5) was inserted between the Estimator and
> the Pricer — the pipeline is now **4-stage**. See **§ Deterministic Takeoff Engine** below for full detail.

| Stage | Module | Type | Responsibility |
|-------|--------|------|----------------|
| 1. Estimator | `src/lib/estimator.js` | LLM (`gemini-3.5-flash`) | Raw input → price-free scope JSON + typed `assemblies[]` (dimensions, closed enum). **Input-source-agnostic** (`{ type: 'text'\|'voice'\|'image', payload }`) so the Sprint 3 blueprint-vision pivot is a ~20-line swap. |
| 1.5 Takeoff | `src/lib/takeoffEngine.js` | Deterministic | Expands assemblies into formula-counted line items; headers sized via `takeoffTables.js` span lookup. **Zero LLM/DB calls.** Loose materials pass through. |
| 2. Pricer | `src/lib/pricer.js` | Deterministic | Runs scope through existing `createPricingEngine`. Issues **zero LLM calls of its own**. |
| 3. Reviewer | `src/lib/reviewer.js` | LLM (`gemini-3.5-flash`, temp 0) | Non-destructive QA pass. Returns `{ ledger, warnings[], status }` — never mutates priced numbers. |
| — | `src/lib/pipeline.js` | Orchestrator | `createPipeline({db, ai, takeoffTables}).runPipeline(input, ctx)` chains 1→1.5→2→3 in memory (no persistence). |

**Cost-protection caveat (be precise):** Stage 2 issues no AI call itself, but the underlying engine's
`assignLaborRate` Priority 3 has a *latent* AI fallback that fires only when a labor item has neither an
explicit rate nor a configured `default_labor_rate`. With a default rate set, the stage is fully offline.

**Rollout (complete):** All three ingestion routes call `pipeline.runPipeline(...)` unconditionally, then
the shared `persistLedger()` helper:
- `POST /api/process-text` — `{ type: 'text', payload: text }`
- `POST /api/webhook` (SMS) — `{ type: 'text', payload: text }`
- `POST /api/process` (audio) — `{ type: 'image', payload: createPartFromUri(file.uri, file.mimeType) }`
  (the uploaded audio is passed as a multimodal Gemini part; the Estimator handles it identically).

`persistLedger()` receives already-priced materials/labor, so item pricing never runs twice. The legacy
`mergeIntoLedger` function and the `// LEGACY` branches have been deleted; the `PIPELINE_V2` env flag is
gone (no longer read anywhere).

**Token/cost metrics (fixed 2026-06-07):** `reviewer.js` now returns its `usageMetadata`, `pipeline.js`
sums it with the Estimator's into a `usage` rollup on the `runPipeline` result, and all three routes feed
that through the new `computeLlmCost(usage)` helper into `logInteraction`. So `llmTokens`/`cost` (and thus
the gateway dashboard's LLM-cost KPI + per-call columns) now report **real** numbers, summed across both
LLM boundaries — strictly better than the old monolith, which only counted its single call.

**Tests:** `__tests__/pipeline.test.js` — fully offline ($0 API), mocks Gemini + Firestore. Asserts the
end-to-end flow and that the Pricer makes zero AI calls when a default labor rate is present.

---

## Deterministic Takeoff Engine (2026-06-14)

**Problem solved:** previously *every* quantity in the ledger was a raw Gemini guess — nothing could catch
"16 ft wall but 9 studs." The Reviewer checks price plausibility and arithmetic, never whether a quantity
fits the scope. This stage flips the LLM's job: it extracts **dimensions**; deterministic formulas compute
the **counts**. "Formula where possible, LLM elsewhere."

**Files:**
- `src/lib/takeoffEngine.js` — `createTakeoffEngine({ tables, constants })` → `expandScope(scope)`. Pure, offline. Expands `assemblies[]` into priced-ready line items; loose materials pass through tagged `quantity_source:'ai'`.
- `src/lib/takeoffConstants.js` — citation-backed conventions (16″ OC, 3 studs/corner, 4 studs/opening, 10% sheet waste, 56.25 sqft/hr framing productivity) + fallback unit costs. Fixed now; per-tenant `settings/config` override deferred.
- `src/lib/takeoffTables.js` + `src/data/spanTables.json` — structural header span lookup.
- `docs/DEEP_RESEARCH_PROMPT.md` + `docs/Residential Construction Estimating Tables.txt` — the structured Gemini Deep Research spec and its citation-backed output (IRC 2021 R602.7 / Wisconsin UDC SPS 321.25-B, Appleton WI / 30 psf snow).

**v1 scope:** `wall_frame`, `drywall`, `exterior_sheathing` (closed enum in `estimator.js`). Deferred to v2:
roof/truss/garage-box, drywall corner bead (needs an outside-corner count), and multi-same-type-assembly
identity. The Estimator prompt has a **hard mutual-exclusion rule** so a wall and its studs can't both be counted.

**Formulas (exact):**
- studs = `ceil(L×12 / spacing) + 1 + corners×3 + openings×4` (2 king + 2 jack/opening; `corners` defaults to 2, LLM-extracted, visible+editable)
- plates = `ceil(L×3 / 16)`; framing labor hrs = `(L×H) / 56.25`
- drywall sheets = `ceil((L×H×sides − openings_area) × 1.10 / 32)` + compound/tape/screws
- sheathing sheets = `ceil((L×H − openings_area) × 1.10 / 32)` + house wrap + 8d nails

**Three load-bearing contracts (hardened via an Opus review pass):**
1. **Idempotency** — `src/db.js mergeLedgerItems`: formula lines REPLACE by `assemblyId` (`asm:<type>:<index>`), AI lines stay additive. Re-saying "make that wall 14 ft" recomputes instead of doubling. A manual edit demotes the line to `quantity_source:'override'` (UI `handleCellEdit`), which is protected from the purge.
2. **No double-counting** — closed `assembly_type` enum + mutual-exclusion prompt rule + per-assembly `confidence` (`<0.6` → LLM `fallback_quantities`).
3. **Field-shape** — each formula line carries `estimated_unit_cost` + `explicit_user_price:null` so the Pricer waterfall still works; provenance survives the Pricer (asserted by `__tests__/provenance.test.js`).

**Structural safety:** `lookupSpan` returns only cited rows (smallest `max_span_ft ≥ span`), **never interpolates**.
A 16 ft garage span exceeds the dimensional table → `{ size: null, note: 'confirm size with supplier' }`,
mirroring the research's explicit omission of prescriptive LVL garage headers. UI renders a "verify with supplier"
disclaimer + the IRC/UDC citation.

**Gotcha:** `.gitignore` `data/` also matches `src/data/` (git matches any depth) — `spanTables.json` needed a
`!src/data/` negation + `git add -f` to ship. `.dockerignore` `data/` only matches root, so the file lives under
`src/data/` (shipped by Docker) rather than top-level `data/`.

**Tests (+48 over the prior suite, 114 total):** `takeoffEngine.test.js` (exact counts, error contract, header
lookup), `takeoffTables.test.js` (never-interpolate, shipped IRC/UDC data), `mergeLedger.test.js` (replace vs
additive, override survival), `estimator.test.js`, `provenance.test.js`, `takeoff-eval.test.js` (accuracy
0.638 → 1.000 vs all-LLM baseline). **Rollback:** tag `pre-takeoff-engine` (`295d1c0`); feature commit `8f5142b`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js / Express |
| AI | `@google/genai` SDK (Gemini) |
| Database | Google Cloud Firestore |
| Auth | Google OAuth 2.0 ID Tokens |
| Billing | Stripe (subscriptions, webhooks) |
| SMS | Twilio (OTP verification, client notifications) |
| PDF | Puppeteer (headless Chromium) |
| 3D Frontend | Three.js — live: `three@^0.184` (r184) in the React app (`ui/src/components/ThreeVisualizer.tsx`); r128 in legacy `public/dashboard.html` |
| Hosting | Google Cloud Run (Docker) |

---

## Firestore Data Model

```
users/{phone}                         ← tenant root (phone = E.164, e.g. "+15551234567")
  .companyName, .email, .zipCode, .status

users/{phone}/settings/config         ← business profile + billing state
  .company_name, .company_address, .company_logo_url
  .license_number, .contact_email
  .default_labor_rate (default: 55)
  .global_markup_percent (default: 0)
  .tax_rate (default: 5.5)
  .active_subscription (bool)
  .subscription_status ('active' | 'past_due' | 'canceled' | 'unsubscribed')
  .estimateCount (sequential PDF counter)
  .isOnboarded (bool)

users/{phone}/estimates/{estimateId}  ← estimate documents
  .project_name, .scope_of_work
  .items[] (materials + labor mixed array)
  .total_amount, .item_count
  .client_name, .client_address
  .updatedAt

users/{phone}/estimates/{id}/change_orders/{coId}  ← change order subdocs
  .change_summary, .added_materials[], .added_labor[]
  .exclusions[], .change_order_total
  .approval_token (crypto random hex)
  .status ('pending' | 'approved')
  .pdf_base64
  .image_url (optional — GCS public URL of job-site photo)
  .sent_at, .sent_to (client email), .email_message_id
  .approvedAt (ISO timestamp)
  .approval_record { ip, timestamp, document_version_hash (SHA-256) }

users/{phone}/price_book/{itemId}     ← per-user custom pricing catalog
  .name, .price

market_prices/menards                 ← shared global price cache (not per-tenant)
  .last_run, .scraped, .failed        ← sync metadata written after each scrape run
  items/{sanitizedKey}                ← one doc per SKU (70 items)
    .name, .price, .unit              ← e.g. "2×4×8 Stud", 3.54, "each"
    .scraped_at (Timestamp)
    .url (Menards product page URL)
    .stale (bool) ← true if last scrape failed; pricingEngine skips stale docs

ledgers/{phone}                       ← legacy collection (pre-estimates migration)
registrations/{phone}                 ← OTP verification staging
approvals/{changeOrderId}             ← lookup map for token-gated approval page
```

---

## Pricing Engine (4-Tier Waterfall)

Priority order inside `assignUnitPrice()` (never short-circuits without reason):

1. **Explicit user price** (`override`) — contractor stated a price in the transcript → `item.explicit_user_price`
2. **Per-user price_book** (`database`) — Firestore subcollection `users/{phone}/price_book/{sanitizedId}`
2.5. **Menards market price** (`market`) — shared Firestore cache `market_prices/menards/items/{key}`, scraped weekly via Oxylabs. Only applied if `stale === false`. Sets `item.price_source = 'market'`, `item.market_source = 'menards'`, `item.market_age_h` (hours since last scrape).
3. **AI estimate fallback** (`ai`) — `item.estimated_unit_cost` embedded by Gemini in the extraction prompt

Labor uses the same tiered logic via `assignLaborRate()`, with `default_labor_rate` from settings as tier 2.

**Implementation note:** `assignUnitPrice` and `assignLaborRate` live in `src/lib/pricingEngine.js`, exposed via `createPricingEngine({ db, ai })`. The market tier lookup is handled inline via `findMarketKey()` imported from `src/lib/menardsScraper.js`. In tests, mock objects are injected — market tier lookup is `try/catch`-wrapped so a missing Firestore doc degrades gracefully to the AI tier.

## Service Layer (`src/lib/`)

| File | Contents | External deps |
|---|---|---|
| `src/lib/sanitize.js` | `parseGeminiJSON`, `sanitizeItemId`, `normalizePhone`, `sanitizePhase1Intent` | None — pure functions |
| `src/lib/pricingEngine.js` | `createPricingEngine({ db, ai })` factory → `assignUnitPrice`, `assignLaborRate` | `db` and `ai` injected via DI; imports `findMarketKey` from menardsScraper |
| `src/lib/menardsSKUs.js` | Array of 70 curated SKUs — `{ key, name, unit, url }` — all with verified `p-XXXXXXX` product page URLs | None — static data |
| `src/lib/menardsScraper.js` | `scrapeMenardsPrices(db)` — Oxylabs scraper loop (per-item Firestore writes); `findMarketKey(itemName)` — fuzzy-match item name to SKU key | Oxylabs REST API (`OXYLABS_USER`/`OXYLABS_PASS` env vars) |

`server.js` requires from these modules and provides its live clients at startup:
```js
const { parseGeminiJSON, sanitizeItemId, normalizePhone, sanitizePhase1Intent } = require('./lib/sanitize');
const { createPricingEngine } = require('./lib/pricingEngine');
// ... after db and ai are initialized ...
const { assignUnitPrice, assignLaborRate } = createPricingEngine({ db, ai });
```

---

## Auth Flow

- **REST endpoints:** `requireAuth` middleware — verifies Google ID Token from `Authorization: Bearer <token>`,
  resolves email → phone via `resolvePhoneByEmail()`, then checks `status === 'active'` in Firestore.
- **Subscription gate:** `requireSubscription` middleware — checks `active_subscription === true` in settings.
  Used on estimate/PDF/change-order routes.
- **Registration:** Two-step: `POST /api/auth/register` (Google token + phone + company) → Twilio OTP →
  `POST /api/auth/verify-otp` → sets `status: 'active'`.
- **SMS webhook:** Twilio signature validation (not OAuth — uses `x-twilio-signature` header).
- **Change order approval:** Token-gated (not OAuth) — `crypto.randomBytes(16)` approval token embedded in SMS link.

---

## API Surface

### Existing Routes (DO NOT MODIFY)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/webhook` | Twilio sig | SMS → extract → merge into ledger |
| POST | `/api/process-text` | requireAuth + sub | Web text → extract → merge |
| POST | `/api/process` | requireAuth + sub | Audio upload → Gemini File API → extract → merge |
| POST | `/api/generate-pdf` | requireAuth + sub | Render estimate PDF + email to contractor |
| POST | `/api/upload-csv` | requireAuth | Bulk import to price_book |
| GET | `/api/estimates` | requireAuth | List all estimates (sorted by updatedAt desc) |
| GET | `/api/estimates/:id` | requireAuth | Load single estimate |
| POST/PUT | `/api/estimates/:id/save` | requireAuth | Save/update estimate + self-teach price_book |
| DELETE | `/api/estimates/:id` | requireAuth | Delete estimate |
| GET | `/api/settings` | requireAuth | Load business profile config |
| POST | `/api/settings` | requireAuth | Save business profile config |
| POST | `/api/settings/logo` | requireAuth | Upload logo (GCS or base64 fallback) |
| POST | `/api/billing/create-checkout-session` | requireAuth | Create Stripe checkout URL |
| POST | `/api/webhooks/stripe` | Stripe sig (raw body) | Handle subscription lifecycle events |
| POST | `/api/auth/register` | Google token | Self-serve registration (step 1) |
| POST | `/api/auth/verify-otp` | Google token | OTP verification (step 2) |
| GET | `/api/me` | requireAuth | Returns authenticated user's phone |
| POST | `/api/change-orders/generate` | requireAuth + sub | AI extract change items + Puppeteer PDF |
| POST | `/api/change-orders/upload-image` | requireAuth + sub | Upload job-site photo to GCS `lone-ranger-change-orders`; returns `{ imageUrl }` |
| POST | `/api/change-orders/send` | requireAuth + sub | Email approval link to client (white-labeled, optional photo attachment) |
| GET | `/approve` | Token-gated (public) | Client-facing approval page (consent checkbox + typed signature, company white-labeled) |
| POST | `/api/change-orders/approve` | Token-gated (public) | Record client approval — writes IP, timestamp, SHA-256 hash to Firestore; notifies contractor |

### Admin Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/admin/sync-prices` | `X-Api-Key` header | Trigger Menards Oxylabs scrape → populate `market_prices` Firestore cache. Key = `ADMIN_API_KEY` env var. Also called weekly by Cloud Scheduler job `menards-price-sync`. |

### New Routes (Supervisor/Builder Phase 1)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/estimate/voice-to-json` | requireAuth | Translate voice transcript → Phase 1 JSON intent packet for Unity Builder |

---

## Supervisor/Builder: Phase 1 Schema

The JSON packet emitted by `/api/estimate/voice-to-json` and consumed by Unity C#:

```json
{
  "schemaVersion": "1.0",
  "projectType": "wall_frame",
  "dimensions":  { "lengthFt": 20.0, "heightFt": 9.0 },
  "structural":  { "studSpacingInches": 16, "treatedSolePlate": false, "wallType": "exterior" },
  "features":    { "doorOpenings": 0, "windowOpenings": 0, "cornerCount": 4 }
}
```

**Field rules (enforced by `sanitizePhase1Intent()` in Express — NOT just the AI prompt):**

| Field | Sub-object | Type | Default | Rule |
|---|---|---|---|---|
| `schemaVersion` | root | string | `"1.0"` | Always hard-pinned in Express |
| `projectType` | root | string | `"wall_frame"` | Always hard-pinned in Express |
| `lengthFt` | dimensions | float | `20` | Must be finite positive number |
| `heightFt` | dimensions | float | `9` | Must be finite positive number (modern residential) |
| `studSpacingInches` | structural | int | `16` | Snapped to exactly `16` or `24` |
| `treatedSolePlate` | structural | bool | `false` | Strict boolean check |
| `wallType` | structural | string | `"exterior"` | Validated to `"interior"` or `"exterior"` only |
| `doorOpenings` | features | int | `0` | Non-negative integer, floored |
| `windowOpenings` | features | int | `0` | Non-negative integer, floored |
| `cornerCount` | features | int | `4` | Non-negative integer, floored (4 = standard room) |

**C# contract classes:** `unity/Assets/Scripts/ConstructionPayload.cs` — `[Serializable]` classes matching this schema exactly for `JsonUtility.FromJson<ConstructionPayload>()`.

---

## Key Architectural Decisions Made

### 1. Two-Layer Defense for Missing AI Values
**Decision:** Gemini system prompt provides defaults AND Express applies a deterministic sanitizer
(`sanitizePhase1Intent()`) after parsing Gemini's response.

**Why:** Unity C# crashes on null — no recovery path. Gemini is probabilistic and WILL occasionally return
null/wrong-type despite perfect prompts. The Express sanitizer reconstructs the full object from scratch,
guaranteeing every field is valid before Unity receives it.

**Pattern reference:** Same as `assignUnitPrice()` — AI provides `estimated_unit_cost`, Express falls back
to `|| 0` as the hard floor.

### 2. Static File MIME Types for Unity WebGL
**Decision:** Enhanced `express.static` with `setHeaders` callback to set correct MIME types + Content-Encoding
for Unity's three compressed file types.

**Why:** Without `Content-Type: application/wasm`, Chrome/Firefox refuse to compile the WASM module.
Unity exports `.wasm`, `.data`, `.framework.js` in plain, gzip (`.gz`), and brotli (`.br`) variants.

### 3. Multi-Tenant by Phone Number (E.164)
**Decision:** All Firestore documents are scoped under `users/{E.164phone}`. Auth maps Google email → phone.

**Why:** Contractor identity in this industry is their cell number (used for SMS, job site comms). Keeps
data isolation simple and deterministic.

### 4. Self-Teaching Price Book
**Decision:** Every time a contractor generates or saves a PDF, the system writes approved material prices
back to their `price_book` subcollection.

**Why:** Pricing gets more accurate over time without contractor action. The system learns their actual
material costs from their own approved estimates.

---

## What Static Files Are Served

From `public/`:
- `index.html` — public marketing storefront at `/` (all sign-in links now → `/dashboard-legacy`)
- `dashboard.html` — **legacy onboarding only** at `/dashboard-legacy`. Handles Google OAuth → phone OTP → profile setup. After auth completes, `activateDashboard()` does `window.location.replace('/dashboard')` to hand off to the React app.
- `privacy.html`, `terms.html` — legal pages

From `ui/dist/` (built by Dockerfile):
- React 19 + Vite + TypeScript + Tailwind v4 app served at `/dashboard` and `/dashboard/*`
- `privacy.html`, `terms.html` — legal pages
- `3d_estimator.html`, `3d_framing_visualizer.html` — early 3D UI prototypes
- *(future)* Unity WebGL build files — `.wasm`, `.data`, `.framework.js`, `.loader.js`

---

## Work Session Log

### Session: 2026-06-11 — Change Order Upgrades: Photo Upload, White-Labeling, ESIGN Audit Trail

**Deployed:** revision `lone-ranger-app-00071-8g9`

#### What was built (4 commits)

**1. `fb9afe3` — Impeccable audit passes (a11y, contrast, perf, adapt, clarify).**
Full audit pass across all 9 dashboard components (`App.tsx`, `LedgerTable.tsx`, `EstimateList.tsx`, `SettingsModal.tsx`, `PriceSheetPanel.tsx`, `ChangeOrderModal.tsx`, `ChangeOrderInputModal.tsx`, `InvoiceModal.tsx`, `ui/index.html`, `ui/src/index.css`).
- **a11y:** `role="dialog"` + `aria-modal` + `trapTab` + focus-on-open for `SettingsModal`; `role="alert"` on all durable error banners; `role="status"` on flash toasts; SR-only `<h1>` in App; ARIA labels on icon-only buttons; removed invalid `role="menu"` from EstimateList.
- **Contrast:** all `/25`–`/50` text raised to `/70` floor (≈6.9:1 WCAG AA); `placeholder-starlight/50` → `/70` globally; dollar-prefix `/40` → `/70`.
- **Perf:** starfield parallax rAF loop now sleeps when settled (`|tgt−cur| < 0.01`); skips entirely for `prefers-reduced-motion` and coarse-pointer (touch) devices.
- **Polish:** single-timer `showStatus()` replaces 11 ad-hoc `setTimeout` pairs; `numDisplay` suppresses zero in ledger inputs; skeleton rows replace RefreshCw spinner in PriceSheetPanel; orb recording colors tokenized.
- **Adapt:** workflow bar `min-h-11`; AR pill `h-9`; employee remove `h-11`; SettingsModal grid responsive; EstimateList delete/confirm `h-11`.
- **Clarify:** `window.prompt` → inline stateful name-entry row in EstimateList; "Invoiced" badge → `text-micro`; em-dashes → periods throughout; status flash sentence-case.

**2. `150e7ae` — Change Order job-site photo upload.**
- **Backend `POST /api/change-orders/upload-image`:** multer memory storage (10 MB limit), `@google-cloud/storage` bucket `lone-ranger-change-orders`, per-tenant path `userPhone/timestamp_filename`, `makePublic()`, returns `{ imageUrl }`. `@google-cloud/storage` added to `package.json`.
- **GCS bucket created:** `gs://lone-ranger-change-orders` (us-central1), `lonerangerrunner@mightdoit.iam.gserviceaccount.com` → `roles/storage.objectAdmin`.
- **Frontend `ChangeOrderModal.tsx`:** dashed-border `Camera` tap target; spinner + "Uploading…" inline + `role="status"` footer message while in-flight; Send button disabled during upload (`|| imageUploading`); thumbnail preview + Remove button (clears state + `fileInputRef.value`); all image state reset on modal open.
- **Email injection:** `image_url` forwarded in `change-orders/send` payload; clickable `<a>` wrapper with `width=600`, `max-width:100%`, "Click to view full size" caption; `image_url` conditionally persisted to Firestore.

**3. `14ccca3` — White-labeling, ESIGN legal text, audit trail, contractor notification.**
- **White-label email (`POST /api/change-orders/send`):** `company_name` fetched from `users/{phone}/settings/config`; fallback chain: Firestore → OAuth `companyName` → email prefix → "Your Contractor". `from` field and HTML body both use resolved name.
- **Approval page (`GET /approve`):** contractor `company_name` in subtitle and footer ref; ESIGN Act legal consent text above Approve button (`font-size:11px`, muted).
- **Audit trail + notification (`POST /api/change-orders/approve`):** `x-forwarded-for` → `req.ip` → `'unknown'` captured; `{ ip, timestamp }` written to `approval_record` in Firestore. Contractor notification email fires with amount, timestamp, IP in green monospaced card. Notification failure non-fatal.

**4. `d293abd` — SHA-256 document hash, ESIGN consent UI, clickable email image.**
- **SHA-256 hash:** deterministic snapshot of `{ change_order_id, change_order_total, change_summary, added_materials, added_labor }` (fixed key order) hashed with `crypto.createHash('sha256')` (built-in, no new dep). `document_version_hash` stored in `approval_record`. Hash appears in contractor notification email (text + HTML).
- **Consent UI:** replaced static legal-text paragraph with checkbox ("I agree... ESIGN Act") + Georgia-font typed-name input. Approve button starts `disabled`; `updateApproveBtn()` gates on `checkbox.checked && name.length ≥ 2`. `typed_signature` forwarded to `POST /api/change-orders/approve` payload.
- **Email image fix:** bare `<img>` replaced with `<a target="_blank">` wrapper, `width=600`, `max-width:100%`, "Click to view full size" caption — renders large and tappable across all major email clients.

#### Files modified
```
src/server.js                                — upload-image route; white-label send; approval page consent UI + white-label; approve endpoint: IP capture, SHA-256 hash, audit_record, contractor notification; email image block
package.json / package-lock.json            — @google-cloud/storage added
ui/index.html                               — font preconnect/preload optimization
ui/src/App.tsx                              — parallax rAF idle, showStatus(), project dropdown hygiene, SR-only h1, orb tokens, contrast fixes
ui/src/components/ChangeOrderModal.tsx      — photo upload (Camera input, thumbnail, Remove, imageUploading gate, image_url in dispatch)
ui/src/components/ChangeOrderInputModal.tsx — contrast fix
ui/src/components/EstimateList.tsx          — inline name-entry, role hygiene, touch targets, contrast
ui/src/components/InvoiceModal.tsx          — role=status/alert, contrast
ui/src/components/LedgerTable.tsx           — numDisplay, contrast, role=alert
ui/src/components/PriceSheetPanel.tsx       — skeleton loading, flash timer, contrast, role fixes
ui/src/components/SettingsModal.tsx         — modal hygiene, grid responsive, contrast, touch targets
ui/src/index.css                            — orb recording tokens, font @import removed
```

#### New route
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/change-orders/upload-image` | requireAuth + sub | Upload job-site photo to GCS `lone-ranger-change-orders`; returns `{ imageUrl }` |

#### Infrastructure
- GCS bucket `gs://lone-ranger-change-orders` created in `us-central1`
- `lonerangerrunner@mightdoit.iam.gserviceaccount.com` granted `roles/storage.objectAdmin`

---

### Session: 2026-06-10 — Production-Ready Fixes (persistence, naming, price sheet, labor rates, CO email, invoice PDF)

**Deployed:** revision `lone-ranger-app-00065-spq` — CI green, smoke-tested (landing 200, dashboard 200, API auth gate 401).

> Note: the 2026-06-09 pipeline changes (`sanitize.js` hardening, `responseMimeType`,
> `persistLedger` merge rework) were **reverted by the owner** — the jest suite asserts the original
> behavior. Those files are now guarded: do not modify `sanitize.js`/`parseGeminiJSON`, the 3-stage
> pipeline (`estimator/pricer/reviewer`), or `persistLedger` without explicit direction.

#### What was built (5 incremental commits, jest 69/69 green throughout)

1. **`c708ce9` — Grid persistence + mock-data removal.** `updateEstimateItems` queues a debounced (900 ms) full-document save to `POST /api/estimates/:id/save`, flushed before voice/text extraction; the scope-of-work autosave rides the same full-payload path (its old scope-only POST hit route defaults and wiped `items` in Firestore). The `initialEstimates` demo seed is deleted everywhere — the ledger boots strictly `[]` when Firestore is empty (dev keeps only a no-redirect guard, no data).
2. **`3b554d6` — Named estimates + toolbar pivot.** "New Estimate" prompts for a name (blank → `Estimate - <date>`, Cancel aborts) and persists it. "AI Change Orders" → "Change Orders". "Lumber Price Overrides" → **Labor Rates**: an editable employee-wages grid (name/position + hourly wage, add/remove rows) saved under `settings.employee_wages` (POST/GET `/api/settings` validate + return it; capped at 50 entries). Supplier CSV upload moved to Settings → Price Sheet.
3. **`cc282b5` — Price sheet isolation.** `GET /api/price-sheet` additionally returns `market[]` (every cached Menards SKU). `PriceSheetPanel` renders three isolated tables: (1) the contractor's catalog/price_book with inline edit + delete, (2) read-only Menards market reference with save-to-book, (3) drift alerts where saved vs market differs >10 %, with one-tap sync.
4. **`ddc85f6` — Change Orders via email.** `ChangeOrderModal` swaps the phone input for a validated email input (client dropdown lists estimates with `client_email`; `Estimate` type gains `client_email?`). `POST /api/change-orders/send` now sends the `/approve` token link through the existing gmail nodemailer stack (branded HTML button), persisting `client_email` + `email_message_id`. Twilio SMS removed from this route.
5. **`a6a49d4` — Invoice PDF fix.** `renderInvoicePdf` adds semantic per-line Materials and Labor tables (legacy untyped rows classified by the role heuristic). **Root cause of the blank PDFs found:** Puppeteer v22+ returns `Uint8Array` from `page.pdf()`, and `uint8.toString('base64')` ignores the encoding arg (emits comma-joined decimals) — both `renderInvoicePdf` AND `renderChangeOrderPdf` were producing corrupt attachments. Both now wrap in `Buffer.from()` first. Verified by extracting the real function and rendering a sample invoice through headless Chrome (fully itemized, correct totals, escaped HTML).

#### Verification
`tsc -b && vite build` after each frontend commit; eslint clean on new lines; `node --check` + full jest (69/69) after each backend commit; sample invoice PDF rendered end-to-end and visually inspected.

---

### Session: 2026-06-08 — CO/Invoice Flow Hardening + Backend Tax Fix

#### What was built

**1. Durable CO dispatch confirmation (P1 — replaced ephemeral toast).**
After a change order is texted to a client, the instrument panel now shows a persistent green "Sent" card instead of a 5-second `statusFlash` toast. The card displays CO ID, dollar total (formatted), and the client phone number that was texted. It persists until the contractor explicitly taps "Create another." This is backed by a new `coDispatchedInfo` state in `App.tsx`; the ChangeOrderModal's `onDispatched` callback now receives the client phone number (`onDispatched: (phone: string) => void`).

**2. `invoiced` status badge in estimate switcher.**
`EstimateList.tsx` now renders a small `FileCheck` + "Invoiced" badge inline with the estimate name for any estimate whose `status === 'invoiced'`. The backend already sets this field on invoice generation; the badge just surfaces it. Also removed the 🚀 rocket emoji prefix from estimate rows.

**3. Backend CO tax rate — reads from contractor settings.**
Both CO routes were hardcoded to WI 5.5% (`0.055`). Fixed both to read `tax_rate` from the contractor's Firestore `settings/config` doc (falling back to 5.5% if not set), consistent with how the invoice and estimate routes handle taxes. Field renamed from `wi_sales_tax` → `sales_tax` in both generate and update routes (and the PUT response JSON). The `configSnap` was already loaded in both routes (for `defaultLaborRate`), so no extra Firestore read.

**4. TypeScript TS1005 fix — ChangeOrderModal ternary.**
The blocking-reason message panel had a malformed nested ternary (`? ... : ? ...` with no final branch), which broke `tsc -b`. Simplified to a two-branch ternary: the outer guard `(!validPhone || !hasItems)` already covers both cases, so the inner `!validPhone ?` condition was redundant.

**5. Final Invoice flow (prior session — already deployed, documented here for completeness).**
`POST /api/estimates/:id/generate-invoice` — takes `deposit_amount`, `payment_terms`, `payment_method_note`; reads approved CO totals; renders a Puppeteer PDF; emails to contractor; marks estimate `status: 'invoiced'` in Firestore. `InvoiceModal.tsx` — deposit input with live balance preview, payment terms select, payment instructions field, delivery disclosure showing contractor email, confirmation screen. `App.tsx` — "Generate Invoice" button in the action bar, `onSuccess` handler updates local estimate state to `invoiced`.

#### Files modified
```
ui/src/App.tsx                          — coDispatchedInfo state; durable CO sent card; CheckCircle import
ui/src/components/ChangeOrderModal.tsx  — onDispatched passes phone; ternary TS fix
ui/src/components/EstimateList.tsx      — invoiced badge; FileCheck import; removed rocket emoji
src/server.js                           — CO generate + PUT routes: tax_rate from settings, wi_sales_tax→sales_tax
```

#### Backend routes touched
| Method | Path | Change |
|---|---|---|
| POST | `/api/change-orders/generate` | tax_rate read from settings; field renamed sales_tax |
| PUT | `/api/change-orders/:id` | tax_rate read from settings; field renamed sales_tax |
| POST | `/api/estimates/:id/generate-invoice` | new — PDF + email + status:invoiced (prior session) |

---

### Session: 2026-06-07 — Phase 1 Housekeeping (Remove Legacy Monolith + Finish Type-Scale Migration)

**Goal:** Lock the codebase before Mode 2. Two cleanups.

#### 1. Backend — legacy monolith removed, V2 is the sole path (`src/server.js`)
- Deleted the `// LEGACY` extraction branches in `POST /api/process-text` and `POST /api/webhook`; both now run `pipeline.runPipeline({ type: 'text', payload })` → `persistLedger()` **unconditionally** (the `if (PIPELINE_V2 === 'true')` guard is gone).
- **Migrated `POST /api/process` (audio) to the pipeline too.** This route was *not* in the original task list — it called `mergeIntoLedger` with no `PIPELINE_V2` fork, so deleting `mergeIntoLedger` would have broken the live-mic path. It now uploads the audio to the Gemini File API and passes the part to `pipeline.runPipeline({ type: 'image', payload: createPartFromUri(...) })` → `persistLedger()`. The Estimator's `image` branch already handled multimodal parts, so this is functionally equivalent to the old inline `generateContent` call, but adds the Pricer + Reviewer stages.
- **Deleted `mergeIntoLedger`** entirely (dead code once all three routes price via the pipeline). `persistLedger()` stays — the shared persistence layer for all three.
- Removed the now-unused `const { EXTRACTION_PROMPT, VALID_TRADES } = require('./lib/estimator')` import (both only lived in that import + comments after the cleanup; still exported from `estimator.js` for the Estimator's own use). `createPartFromUri` import retained (audio route). Refreshed the two stale comment blocks.

#### 1b. Token/cost metrics restored (the gateway-dashboard tie-in)
Migrating the audio route to the pipeline would have zeroed its `cost`/`llmTokens` (the pipeline swallowed `usageMetadata`), and text/SMS were already 0 under V2 — which would have shown `$0.00` on the gateway dashboard's LLM-cost KPI + per-call columns. Fixed it properly: `reviewer.js` now returns `usageMetadata`; `pipeline.js` sums Estimator + Reviewer usage into a `usage` field on the `runPipeline` result; a new `computeLlmCost(usage)` helper in `server.js` converts that to `{ llmTokens, cost }` ($1.50/1M in, $9.00/1M out) which all three routes feed to `logInteraction`. Now reports real numbers across **both** LLM calls. Added a token-aggregation assertion to the pipeline happy-path test (mock now carries `usageMetadata`).

#### 2. Frontend — type-scale migration finished
Migrated the last three components off ad-hoc sizes onto the design system:
- `SettingsModal.tsx`, `EstimateList.tsx`, `ThreeVisualizer.tsx`: every `text-[9/10/11px]` / `text-xs` → `text-micro` (labels/badges/secondary) or `text-mini` (data/body rows). Raw `rose-400` → `alert-rose`; `text-[#ffffff]` → `text-starlight`; ThreeVisualizer HUD `text-purple-200` → `text-soft-violet`, tooltip `text-slate-100` → `text-starlight`. Non-text WebGL-overlay chrome (`bg-slate-900/*`, `border-purple-500/*`) left as-is. **No components remain on ad-hoc text sizes.**

#### Verified
- `npm test` — **66/66 green** (3 suites; the original task's "56" was stale). Tests target `src/lib/*` only, unaffected by the route edits.
- `cd ui && npm run build` — `tsc -b` clean (no type errors) + Vite build succeeds. (Pre-existing 560 kB chunk warning is the lazy-loaded `ThreeVisualizer` bundle.)

#### Files modified
```
src/server.js                            — removed legacy branches + mergeIntoLedger; audio→pipeline; computeLlmCost() + per-route cost wiring; import/comment cleanup
src/lib/reviewer.js                       — return usageMetadata
src/lib/pipeline.js                       — sumUsage() helper; usage rollup on runPipeline result
__tests__/pipeline.test.js                — mock usageMetadata + token-aggregation assertion
ui/src/components/SettingsModal.tsx       — type-scale + color tokens
ui/src/components/EstimateList.tsx        — type-scale + color tokens
ui/src/components/ThreeVisualizer.tsx     — type-scale + color tokens (HUD/tooltip text)
docs/GEMINI_HANDOFF.md                    — this entry + Sprint 2 / header sync
```

---

### Session: 2026-06-07 — Live Mic, Real Change Orders + Client Capture, Design Pass

#### What was built

**1. Live microphone (replaced the orb simulation).** `App.tsx`'s `toggleRecording` was a `setTimeout` that injected one hardcoded transcript. It now does real capture: `getUserMedia` → `MediaRecorder` → stop on second tap → `FormData` POST to `POST /api/process` (the audio-extraction route that already existed but was never wired). Strips the codec suffix from `MediaRecorder.mimeType` (`audio/webm;codecs=opus` → `audio/webm`) so multer's allow-list matches; surfaces permission/empty-recording/server errors as status flashes.

**2. Client details captured at PDF send time.** `PDFPreviewModal` gained a 3-field recipient strip (name / phone / address), pre-filled from the saved estimate. On send it persists those to Firestore via `POST /api/estimates/:id/save` *before* calling `generate-pdf`, and passes the typed values through `onConfirmSend` so the emailed PDF always has the right Bill To (the route reads client fields from the request body, so a stale closure would otherwise lose freshly-typed values). Added `client_phone` passthrough to the save route.

**3. Real change orders + dispatch.** `handleGenerateChangeOrder` was a full client-side mock; it now calls `POST /api/change-orders/generate` (Gemini extraction → pricing waterfall → Puppeteer PDF, all already built backend-side). On success a new **`ChangeOrderModal`** opens — a full-width modal with an editable materials/labor ledger, a **client picker dropdown** derived from saved estimates (deduplicated by phone, with a manual-phone fallback), exclusions, a totals breakdown (materials-only 5.5% WI tax, matching backend), and a "Text to client" dispatch button calling `POST /api/change-orders/send` (real Twilio SMS, gated by `SMS_LIVE`). Removed the old client-side approval simulation (`clientPortalCo`, `handleClientApprove`, the "Amend Review Auth" modal) — approval now happens on the client's phone via the existing `/approve` route.

**4. New backend route + refactor.** Added **`PUT /api/change-orders/:id`** so contractor edits in the modal actually persist: it recomputes totals from the edited line items (explicit overrides, no re-pricing) and regenerates the PDF, then dispatch sends the fresh version. Extracted a shared **`renderChangeOrderPdf()`** helper (used by both generate + update) to avoid duplicating the Puppeteer block. The modal only PUTs when the ledger was actually edited (a `dirty` flag), avoiding a redundant second PDF render on every send.

**5. Design pass (impeccable critique → audit → polish).** Critique of the change-order/PDF flow scored 25/40; audit went 11 → 17 → 19/20. Fixes:
- **Type:** every sub-11px `text-[Npx]` in `ChangeOrderModal`, `PDFPreviewModal`, and `PriceSheetPanel` lifted to the `text-micro`/`text-mini` tokens; change-order total promoted to `text-xl`.
- **Copy:** cockpit jargon ("Formulate Change Addendum", "Dispatch Authorization") → plain contractor English ("Create change order", "Text to client").
- **A11y:** `role="dialog"`/`aria-modal`/autofocus/Esc + a shared `trapTab()` focus trap (`focusTrap.ts`) on both modals; `htmlFor` label associations; `aria-label`s on icon-only controls; secondary text floored to `starlight/60` for contrast.
- **Responsive:** change-order unit-price/rate columns no longer hidden on mobile (were uneditable on a phone); tables `overflow-x-auto`; 44px modal close targets.
- **Anti-patterns:** removed a side-stripe border; `animate-bounce` → `animate-spin`/`animate-fade-in` (the status flash was looping infinitely); AR controls moved off raw `violet-700/800/900` gradients to the `soft-violet` ghost-chip pattern.
- **Perf:** `ThreeVisualizer` is now `React.lazy` + `Suspense` — initial JS bundle dropped **852 kB → 294 kB**; Three.js loads on demand.
- **Tokens/motion:** new `--color-stale-amber` token (drift flag); global `@media (prefers-reduced-motion: reduce)` guard added to `index.css`.

**Deployed:** revision `lone-ranger-app-00059-545` (serving 100%; supersedes `00058-bjf`).

#### Files created/modified
```
ui/src/App.tsx                          — live mic; real CO generation; client list; modal wiring; lazy ThreeVisualizer; AR controls; status-flash motion
ui/src/components/ChangeOrderModal.tsx  — new: editable CO ledger + client picker + dispatch
ui/src/components/PDFPreviewModal.tsx   — recipient strip; client-details save; focus trap
ui/src/components/PriceSheetPanel.tsx   — type-token migration; a11y; touch targets; stale-amber
ui/src/focusTrap.ts                     — new: shared modal Tab-trap helper
ui/src/index.css                        — --color-stale-amber token; reduced-motion guard
src/server.js                           — client_phone in save route; PUT /api/change-orders/:id; renderChangeOrderPdf() helper
DESIGN.md, docs/*.md, README.md         — doc sync (4-tier waterfall, AR treatment, motion)
```

#### Backend routes touched
| Method | Path | Change |
|---|---|---|
| POST | `/api/process` | now wired from the React UI (live mic audio) |
| POST | `/api/estimates/:id/save` | `client_phone` now persisted |
| POST | `/api/change-orders/generate` | refactored to use `renderChangeOrderPdf()` |
| PUT | `/api/change-orders/:id` | **new** — persist edits + regenerate PDF |
| POST | `/api/change-orders/send` | (unchanged) now driven from `ChangeOrderModal` |

---

### Session: 2026-06-07 — Master Price Sheet UI

#### What was built
Settings modal gained a **"Price Sheet" tab** (alongside the existing "Profile" tab). The modal widens to `max-w-5xl` when the Price Sheet tab is active.

**`PriceSheetPanel.tsx`** — full merged view of pricing data:
- **Your Saved Prices** table: name | your price (click to edit inline) | Menards market price | diff % (amber if >10%) | sync↓ (use market price) | delete (drops entry so it falls back to market/AI tier)
- **Menards Catalog — Not in Your Price Book**: all 70 Menards SKUs not yet overridden, with a `+` button to lock one into the price book at market price
- **Sync all from Menards** button: one-click update of every matched price_book entry

**5 new server.js routes:**

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/price-sheet` | Bearer | Merged price_book + Menards market; flags used market keys to build `marketOnly[]` section |
| PUT | `/api/price-book/:itemId` | Bearer | Inline price edit |
| DELETE | `/api/price-book/:itemId` | Bearer | Remove entry; item falls back to market → AI tier |
| POST | `/api/price-book/sync-from-menards` | Bearer | `{}` = sync all matched; `{ itemId, marketKey }` = sync one |
| POST | `/api/price-book` | Bearer | Save a market-only item into the price book |

**Why this matters:** Once a contractor's price_book fills up, the `database` tier always wins over the live `market` tier — prices silently go stale. The Price Sheet gives them visibility and a one-tap sync path instead of manual corrections.

**Deployed:** revision `lone-ranger-app-00058-bjf`

#### Files created/modified
```
ui/src/components/PriceSheetPanel.tsx   — new
ui/src/components/SettingsModal.tsx     — Profile | Price Sheet tab switcher
src/server.js                           — 5 new price-book routes
docs/GEMINI_HANDOFF.md                  — this entry
README.md                               — pricing waterfall section, service layer, routes, component tree
```

---

### Session: 2026-06-06/07 — Menards Market Pricing Tier (Oxylabs, 70 SKUs, Cloud Scheduler)

**Context:** AI-guessed prices are unreliable for real bids. Added a shared weekly-scraped Menards price cache as a new `market` tier (priority 2.5) sitting between the per-user `price_book` (`database`) tier and the AI fallback. All tenants benefit from one shared scrape. Target store: Wausau, WI.

#### 1. `src/lib/menardsSKUs.js` — curated SKU list (70 items)
Covers framing lumber (2x4–2x12, PT, LVL), sheathing (OSB, plywood, ZIP, AdvanTech), insulation (R-13 through R-49, rigid foam, spray foam), roofing (arch shingles, ice & water, felt, drip edge, ridge vent, pipe boot), drywall, siding (vinyl, LP SmartSide), aluminum trim (coil, soffit, fascia), MiTek connectors (joist hangers, hurricane ties, post bases), fasteners (16d/8d nails, screws, adhesives), concrete (60lb only — Menards doesn't carry 80lb), housewrap/vapor barrier/flashing tape, and windows.

All 70 entries have verified `p-XXXXXXX` product-page URLs — zero TODO placeholders remain. URLs were researched via `site:menards.com` Google searches (no Oxylabs credits consumed for URL discovery).

#### 2. `src/lib/menardsScraper.js` — Oxylabs scraper
- Posts each URL to `https://realtime.oxylabs.io/v1/queries` with `source:'universal'`, `render:'html'`, `geo_location:'Wisconsin,United States'`.
- Extracts price from JSON-LD structured data (`/"price"\s*:\s*([\d.]+)/`) with a `$`-regex fallback.
- **Per-item Firestore writes** (critical): each scraped price is written to `market_prices/menards/items/{key}` immediately — not batched at the end. This means any Cloud Run timeout preserves all prices scraped so far; only the remaining items fall through to stale/AI tier.
- Failed scrapes write `{ stale: true, last_attempted: now }` via merge without overwriting the last good price.
- 600ms polite delay between Oxylabs requests.
- `findMarketKey(itemName)` fuzzy-matches an extracted item name to a SKU key: normalizes both strings, then checks all SKU name tokens appear in the item name.

#### 3. `src/lib/pricingEngine.js` — market tier added
`findMarketKey()` imported from menardsScraper. Inside `assignUnitPrice()`, after the `database` tier and before the AI fallback: looks up the matched key in `market_prices/menards/items/{key}`, skips docs with `stale: true`, sets `price_source: 'market'`, `market_source: 'menards'`, `market_age_h` (hours since scrape). Entire lookup is try/catch-wrapped — any Firestore error degrades to the AI tier.

#### 4. `src/server.js` — `/api/admin/sync-prices` endpoint
`POST /api/admin/sync-prices` — authenticated by `X-Api-Key` header matching `ADMIN_API_KEY` env var (UUID). Calls `scrapeMenardsPrices(db)` and returns `{ ok: true, scraped, failed }`. Also hit by Cloud Scheduler on a weekly cron.

#### 5. `ui/src/components/LedgerTable.tsx` — Menards price badge
Added `market` to `SOURCE_META`. `sourceLabel()` returns `"Menards · Xh"` (age in hours). `sourceClass()` uses `bg-live-emerald/20 text-live-emerald`. Live market prices now show a green "Menards · Xh" badge in the ledger, consistent with the design system's "live-emerald = from the source" rule.

#### 6. Infrastructure deployed
- **Cloud Run env vars added:** `OXYLABS_USER=loneranger_7EgFl`, `OXYLABS_PASS=Y4e33~O~wziHlT`, `ADMIN_API_KEY=0216e563-a735-4106-8424-47a1315c7779`
- **Cloud Run timeout:** increased from 300s → 3600s (Oxylabs JS rendering averages ~25-30s/page × 70 items ≈ 35 min)
- **Cloud Scheduler job:** `menards-price-sync` in us-central1, `0 6 * * 1` (Monday 6AM CT), 600s attempt-deadline, first run June 8 2026
- **Oxylabs free trial:** 2,000-request trial; ~70 requests consumed in first sync run (~$0.09 of $1.00 credit)
- **Current revision:** `lone-ranger-app-00056-jfb`

#### Key fix: per-item writes (why the batch design would have failed)
The original plan batched all Firestore writes to the end of the scrape. With Cloud Run timeout at 900s and Oxylabs averaging 30s/call, a 70-item run takes ~35 min — far exceeding 900s. Even at 3600s the risk remains. Switched to immediate per-item writes so partial scrapes accumulate real data.

#### Files created
```
src/lib/menardsSKUs.js          — 70 curated SKUs with verified Menards product URLs
src/lib/menardsScraper.js       — Oxylabs scraper + findMarketKey() fuzzy matcher
```

#### Files modified
```
src/lib/pricingEngine.js        — market tier (priority 2.5) added to assignUnitPrice()
src/server.js                   — /api/admin/sync-prices endpoint
ui/src/components/LedgerTable.tsx — market badge (live-emerald, Menards · Xh)
docs/GEMINI_HANDOFF.md          — this entry
```

#### Git commits
- `1ad9ec1` — feat: Menards market pricing tier via Oxylabs scraper
- `dd9677a` — fix: write Menards prices to Firestore per-item instead of batch
- `661542a` — feat: fill all 36 remaining Menards product URLs — 70/70 verified

---

### Session: 2026-06-06 — PIPELINE_V2 SMS Webhook, CORS Fix, Gateway Dashboard Overhaul

#### 1. PIPELINE_V2 wired into `/api/webhook` (SMS bridge)
Previously the inbound Twilio SMS handler always used the legacy monolith extraction path regardless of the `PIPELINE_V2` flag. Added the same fork pattern used in `POST /api/process-text`:
- `PIPELINE_V2=true` → `pipeline.runPipeline({ type: 'text', payload: text }, { userPhone: from, zipCode })` → `persistLedger()`
- Legacy path kept as fallback (fenced with the `// LEGACY` comment, same as `process-text`)
- Both paths produce the same TwiML reply to the contractor

**Note:** The V2 path doesn't accumulate `llmTokens`/`cost` in `logInteraction` (the pipeline manages its own internal Gemini calls and doesn't surface token metadata to the caller). Same gap exists in `process-text`. Fix requires instrumenting pipeline stages to return aggregate token counts.

#### 2. CORS fix — gateway dashboard access
CORS origin was hard-pinned to `http://localhost:5174`, but Vite's default port is `5173`. Every fetch from the gateway dashboard was blocked by the browser. Fixed by expanding to an array:
```js
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }));
```
Port 5174 retained (StudCast React UI uses it); 5173 added for the gateway dashboard.

#### 3. Gateway dashboard refactored (`scratch/gateway-dashboard/`)
The gateway dashboard is a separate React/Vite app that reads from the backend's `GET /api/metrics`, `GET /api/interactions`, and `GET /api/interactions/stream` (SSE) endpoints. It was auto-polling metrics every 5 seconds and keeping a persistent SSE/Firestore `onSnapshot` open — together these would blow the Firestore 50K free-read daily limit in minutes with the dashboard open.

Changes made to `gateway-dashboard/src/App.tsx`:
- Removed `refetchInterval: 5000` from the metrics query
- Added `refetchOnWindowFocus: false` to both queries
- Removed the SSE `EventSource` `useEffect` entirely
- Added a **Refresh button** in the header (spins while loading, shows "Last updated HH:MM:SS")

Result: opening the dashboard costs 2 Firestore reads; refreshing costs 2 more. The backend's SSE endpoint and `onSnapshot` listener are still wired and functional — they just aren't used by default anymore.

Gateway dashboard README rewritten to accurately describe its role, the on-demand data model, and the cost implications (previously described the SSE architecture that was just removed).

#### 4. Name finalized: Lone Ranger Estimator
"StudCast" retired as the product name. All new references in README and this handoff use "Lone Ranger Estimator." GitHub repo slug (`iPolluxx/StudCast`) unchanged for now.

#### Files modified
```
src/server.js                              — PIPELINE_V2 fork in /api/webhook; CORS origin expanded
README.md                                  — title/branding updated to Lone Ranger Estimator
docs/GEMINI_HANDOFF.md                     — this entry + open items updated

(gateway-dashboard repo — separate git history)
gateway-dashboard/src/App.tsx              — manual refresh, SSE removed, refetchInterval removed
gateway-dashboard/README.md               — rewritten for accuracy
```

---

### Session: 2026-06-04 (Evening) — Cosmic-Glass Reskin of Public Pages + Impeccable Critique Fixes
**Claude:** Applied the "Command Bridge" cosmic-glass system to all static marketing/auth pages, then ran three `impeccable` critique passes and applied the findings.

#### 1. Pages reskinned to cosmic-glass system
- **`public/index.html`** (landing) — Full reskin: starfield hull photo background, glass panel sections, two-voice (cool-blue/violet) accents. Replaced fabricated testimonials with an honest FAQ. Dropped false "free trial" CTAs for price-honest copy ("Get Started · $49/mo"). Thinned section eyebrows 6 → 2; added a featured Core card to break grid sameness. Removed em-dash body copy. Added `:focus-visible` rings.
- **`public/dashboard.html`** (auth gateway) — Honest paywall copy (removed false "your free trial has ended"). OTP recovery: Resend code button (45s cooldown) + "Use a different number" link. Focus-visible rings on auth inputs. SMS consent text bumped 10px → 11px (min type-scale floor).
- **`public/privacy.html`** + **`public/terms.html`** — Meta-date contrast fix. Real support contact added to Privacy (`lonerangercontracting@gmail.com`).
- **`public/sms-optin.html`** — Minor copy fix.

#### 2. Shared starfield asset
Added **`public/starfield.jpg`** — the same Milky Way nebula photo used by the React dashboard — so all static pages share the visual backdrop (no separate asset per page).

#### 3. Critique snapshots
`.impeccable/critique/` now contains snapshots for `index.html`, `dashboard.html`, `privacy.html`, and `terms.html`.

#### Files modified
```
public/index.html                     — full cosmic-glass reskin, honest FAQ + CTAs
public/dashboard.html                 — honest paywall, OTP recovery, focus rings
public/privacy.html                   — contrast fix, real support email
public/terms.html                     — contrast fix
public/sms-optin.html                 — copy fix
public/starfield.jpg                  — added (shared backdrop asset)
.impeccable/critique/*.md             — new critique snapshots
```

---

### Session: 2026-06-04 (Afternoon) — A2P SMS Opt-In Surfaced Pre-Auth

**Context:** The A2P 10DLC campaign was rejected (error 30909 — CTA not verifiable without authentication). Carrier reviewers couldn't see the SMS consent without first logging in via Google OAuth.

**Fix:** Phone number, company name, and SMS consent checkbox are now on the public `loginGate` card (above the Google button) so the opt-in is verifiable without authentication. The values are threaded through the OAuth popup into the existing register → OTP → wizard flow with no data loss.

`public/sms-optin.html` now **redirects to `/dashboard-legacy`** so the TCR-submitted URL lands on the real working opt-in form rather than the standalone preview page.

#### Files modified
```
public/dashboard.html   — phone/company/consent fields on loginGate; values wired into OAuth flow
public/sms-optin.html   — redirect to /dashboard-legacy
```

---

### Session: 2026-06-04 — Frontend Design System + LedgerTable Overhaul (impeccable)
**Gemini:** n/a (implementation session).
**Claude:** Established a documented design system and ran a full quality arc on the estimate ledger via the `impeccable` skill. Critique score for `LedgerTable.tsx` moved **24 → 35 → 36 → 37 / 40** (Good → Excellent) across the passes.

#### 1. Design-system docs (repo root)
- **`PRODUCT.md`** — strategic: register=`product`, solo-contractor users, "Command Bridge" brand personality, anti-references (clunky legacy contractor software; generic SaaS dashboard), 5 design principles.
- **`DESIGN.md`** — visual (Google Stitch format): the "Command Bridge" cosmic-glass system. Color, type, elevation (glow-as-depth), component specs, Named Rules (Two-Voice, One Blue Number, Dark-On-Bright, No Hard Shadow, etc.). Machine-readable sidecar at **`.impeccable/design.json`**; live-mode config at `.impeccable/live/config.json`; critique snapshots in `.impeccable/critique/`.

#### 2. Design tokens — `ui/src/index.css` `@theme` (Tailwind v4)
- **Semantic colors** (were hard-coded): `live-emerald` #34d399 (status/source), `alert-rose` #fb7185 (destructive/error only), `navy-deep`/`navy-violet` (secondary-CTA gradient). Color meaning: `cool-blue`=trust (money/primary), `soft-violet`=AI/intelligence only.
- **Type scale** — fixed `rem`, ~1.18 ratio, **11px floor**: `text-micro` (0.6875rem) for labels/badges, `text-mini` (0.8125rem) for data/body, below Tailwind's `text-base`/`lg`/`xl`. Replaced all ad-hoc `text-[Npx]`. Applied in `LedgerTable.tsx` + `App.tsx`; `SettingsModal`/`EstimateList`/`ThreeVisualizer` **migrated 2026-06-07** (Phase 1 housekeeping) — type-scale rollout now complete across all components.
- **Ledger keyboard focus** rule (`#estimate-ledger-section :is(input,textarea):focus-visible`) for WCAG 2.4.7.

#### 3. `LedgerTable.tsx` overhaul (the critique arc)
- **harden:** `clampNum()` replaces `parseInt` → fractional hours/qty now work + negatives clamped; two-step delete confirm; confirm-before-send + disable-when-empty on Publish; durable inline publish-error + Retry (App.tsx `onPublish` now throws on non-OK); empty-section states.
- **clarify:** plain copy — "Materials/Labor/Role/Total" (was "Extracted … Allocation Sheets" / "Role Designation" / "Grand Valuation"); price-source badges → "Est./Yours/Saved" with hover tooltips; "Src/Del" → "Source/Delete".
- **colorize:** enforced the Two-Voice rule (decorative violet → cool-blue on non-AI elements).
- **keyboard nav (desktop tables):** Enter advances down the column / adds + focuses a new row at the bottom; ↑/↓ move between rows (data-attr coordinates + `handleCellKey`). Discoverability tip line.
- **audit + polish:** AA contrast (muted text → `/70`), focus ring, `<h3>` section headings, `<th scope="col">`, aria-labels; tokenized colors.

#### 4. `App.tsx`
- Token swaps (emerald/rose/navy → semantic tokens; kept the orb's decorative recording gradient as literal rose — *not* `alert-rose`, which is reserved for errors).
- Type-scale rollout (50 px sizes → micro/mini; folded off-scale `text-xs`/`text-sm` onto the ladder).
- **DEV-only auth bypass** in the boot `useEffect`: in `import.meta.env.DEV`, skip the auth/backend dance and render built-in demo estimates (production auth unchanged). Fixes a local reload loop (no token → redirect → re-mount → repeat; and the 401-from-backend variant).

#### 5. Local-dev config — `ui/vite.config.ts`
- ngrok HMR is now **opt-in** via `NGROK_HOST` env var; plain `npm run dev` uses localhost HMR. Previously the HMR socket was hard-pinned to a `wss` ngrok host, causing a reload loop when run locally.

#### Files created
```
PRODUCT.md
DESIGN.md
.impeccable/design.json
.impeccable/live/config.json
.impeccable/critique/*.md   (critique snapshots)
```
#### Files modified
```
ui/src/components/LedgerTable.tsx   — full UX/a11y/keyboard overhaul
ui/src/App.tsx                      — tokens, type scale, DEV auth bypass, onPublish throws
ui/src/index.css                    — @theme semantic-color + type-scale tokens, ledger focus rule
ui/vite.config.ts                   — ngrok HMR opt-in (NGROK_HOST)
DESIGN.md                           — type-scale floor sync
CLAUDE.md                           — design-system + local-dev sections, React 19 fix
docs/GEMINI_HANDOFF.md              — this entry
```

#### Open follow-ups (from this session)
- **Wire the React demo simulations to their real backend routes:** the voice orb (real mic capture → `/api/process`), the Change Order panel (`/api/change-orders/generate` + `/send`), and the client approval portal (`/approve`). All three are client-side sims today; endpoints already exist. (Documented in `docs/app-features.md` status banner.)
- ~~**Finish the type-scale migration:** `SettingsModal.tsx`, `EstimateList.tsx`, `ThreeVisualizer.tsx`~~ — **DONE 2026-06-07** (Phase 1 housekeeping).
- **Optional ledger refinements** (critique P3s, non-blocking): duplicate-row / bulk-delete, undo-after-delete, inline markup/tax help.
- **Dev-only conveniences to be aware of:** `App.tsx` DEV auth bypass and `vite.config.ts` `NGROK_HOST` opt-in — both guarded, no prod impact.
- **README.md** still says "React 18" and documents a removed "Build Layer" — minor, worth a cleanup pass.

---

### Session: 2026-06-03 (3) — Deterministic 3-Stage Pipeline (PIPELINE_V2)
**Claude:** Replaced the monolithic Gemini extract-and-price call with a deterministic 3-stage pipeline. Full architectural detail in the **Sprint 2** section above.

#### What was built
- `src/lib/estimator.js` — Stage 1 LLM: raw input → price-free scope JSON. `EXTRACTION_PROMPT` and `VALID_TRADES` moved here from `server.js` (single source of truth).
- `src/lib/pricer.js` — Stage 2 deterministic: wraps `createPricingEngine`; issues zero LLM calls when `default_labor_rate` is set.
- `src/lib/reviewer.js` — Stage 3 LLM (temp 0): non-destructive QA pass; never mutates priced numbers.
- `src/lib/pipeline.js` — Orchestrator: `createPipeline({db, ai}).runPipeline(input, ctx)` chains 1→2→3 in memory.
- `server.js` — Single `PIPELINE_V2` fork in `POST /api/process-text`; legacy monolith fenced with `// LEGACY` marker; `persistLedger()` extracted so both paths share persistence and never double-price.
- `__tests__/pipeline.test.js` — 10 offline integration tests ($0 API, Gemini + Firestore mocked). **Total suite: 66 tests.**
- Corrected stale "Gemini 1.5 Pro" references throughout to `gemini-3.5-flash`.

#### Verified
Clean boot under `PIPELINE_V2=true`, 401 auth gate intact, live end-to-end run through real `gemini-3.5-flash` (Estimator → Pricer → Reviewer).

#### Files created / modified
```
src/lib/estimator.js           — new
src/lib/pricer.js              — new
src/lib/reviewer.js            — new
src/lib/pipeline.js            — new
__tests__/pipeline.test.js     — new (10 tests)
src/server.js                  — PIPELINE_V2 fork, persistLedger extraction
README.md                      — updated
```

---

### Session: 2026-06-03 (2) — WebXR AR Mode, Draggable Mini PIP, Mobile Orb Fix
**Claude:** Added WebXR immersive-AR capability to the Three.js visualizer, made the mini PIP draggable, and fixed the mobile barrel-roll disappearing-orb bug.

#### 1. WebXR AR mode (`ThreeVisualizer.tsx`)
- `renderer.xr` enabled; render loop switched to `setAnimationLoop` (required for XR).
- On `immersive-ar` session start: env geometry (ground plane, parking grid, trucks) hidden; all scene geometry scales from feet → meters (`ft * 0.3048`); scene anchors to real world.
- On session end: env geometry restored, scale reverted.
- AR availability detected async (`navigator.xr.isSessionSupported('immersive-ar')`); result surfaced via `onARReady(supported: boolean)` callback to parent.

#### 2. AR controls (`App.tsx`)
- AR pill button rendered below the mini PIP (outside `overflow-hidden`) when AR is supported.
- Small circle AR button appears in medium and full visualizer modes.
- AR entry starts/ends the XR session.

#### 3. Draggable mini PIP (`App.tsx`)
- Mini PIP uses `onPointerDown` + `setPointerCapture` for drag. Position stored as `{x, y}` px offsets; constrained to viewport bounds.
- AR pill tracks the PIP position.

#### 4. Mobile barrel-roll fix (`App.tsx`)
- Barrel-roll animation conditionally skipped on mobile (`isMobile` check). The voice orb no longer disappears during theater-mode expansion on phones.

#### 5. Vite dev config (`ui/vite.config.ts`)
- `allowedHosts` added to accept ngrok tunnel hostnames.
- HMR websocket uses `wss` protocol through the ngrok host when `NGROK_HOST` is set.

#### Files modified
```
ui/src/App.tsx                        — draggable PIP, AR pill, mobile barrel-roll guard
ui/src/components/ThreeVisualizer.tsx — WebXR session, ft→m scaling, env hide/restore
ui/vite.config.ts                     — allowedHosts, HMR wss config
```

---

### Session: 2026-06-03 (1) — Milky Way Nebula Background Swap
**Claude:** Replaced the earlier starfield photo with a higher-quality 4000×6000 Milky Way/nebula shot.

- Cover sizing crops the portrait image to landscape; warm amber nebula glow sits behind the ledger zone, cool star field backs the header/orb area.
- Parallax drift tuned to portrait aspect ratio: ±2% horizontal (little room), ±4% vertical.
- `hue-rotate(-8deg)` bridges warm amber tones into the cool-blue/violet UI palette.

#### Files modified
```
ui/src/App.tsx              — parallax range tuned, CSS comment updated
ui/src/assets/starfield.jpg — replaced (167 KB → 2 MB Milky Way photo)
```

---

### Session: 2026-06-02 — Service Layer Extraction, Jest Test Suite, GitHub Actions CI

**Gemini:** Strategic review — identified zero tests as the primary gap for employer signal; directed path toward AI orchestration + XR niche.
**Claude:** Extracted service modules, wired DI, wrote 56-test offline suite, added CI pipeline.

#### 1. Service layer extraction — `src/lib/`

Four pure utility functions moved from `server.js` to `src/lib/sanitize.js`:
- `parseGeminiJSON` — strips Gemini markdown fences, returns parsed object
- `sanitizeItemId` — Firestore-safe document ID from a material name
- `normalizePhone` — E.164 normalization with 400-tagged error for invalid input
- `sanitizePhase1Intent` — deterministic clamping layer for AI-produced framing JSON

`assignUnitPrice` and `assignLaborRate` moved to `src/lib/pricingEngine.js` as a DI factory. Both previously closed over module-level `db` and `ai` singletons, making them impossible to test without live cloud clients.

`server.js` now requires from both modules and injects its live Firestore + Gemini instances at startup. Zero behavior change — pure refactor.

#### 2. Jest test suite — `__tests__/`

**`__tests__/sanitize.test.js`** (35 tests) — exercises every branch in the four pure functions:
- `parseGeminiJSON`: clean JSON, fenced JSON, whitespace, invalid input → `SyntaxError`
- `sanitizeItemId`: casing, special chars, null, truncation at 100 chars
- `normalizePhone`: 10-digit bare, formatted, E.164 passthrough, 11-digit no-plus, null/undefined throws with `status: 400`
- `sanitizePhase1Intent`: hard-pin of `schemaVersion`/`projectType`, all defaults on empty input, stud spacing snap, case-sensitive wallType validation, boolean-only treatedSolePlate, positive-only dimensions, integer-only feature counts, 1-decimal rounding

**`__tests__/pricingEngine.test.js`** (21 tests) — verifies every priority path:
- `assignUnitPrice`: Priority 1 explicit price (including 0, string coercion, non-numeric fallthrough); Priority 2 DB hit; Priority 3 AI fallback; Priority 2.5 labor-general with settings; $55/hr hardcoded default when settings doc missing; Firestore rejection → graceful fallback; total rounding; quantity=0 edge case
- `assignLaborRate`: Priority 1 explicit (including 0); Priority 2 settings hit (AI not called); Priority 3 AI fallback; AI failure → `rate:0`; null `userPhone` skips DB; total rounding; markdown-fenced AI response; field spread preservation

All 56 tests run offline in ~1 second. Zero API calls. Zero cloud credentials required.

#### 3. GitHub Actions CI — `.github/workflows/ci.yml`

Triggers on `push` and `pull_request` to `main`. Steps: `actions/checkout@v4` → `actions/setup-node@v4` (Node 20, npm cache) → `npm ci` → `npm test`. No secrets required. A failing test blocks the merge.

#### 4. Documentation

`README.md` updated with:
- New tech stack rows for Jest and GitHub Actions
- New "Service Layer Architecture" section (separation of concerns, DI pattern, test strategy, CI workflow YAML)
- Deployment section updated to link CI to Cloud Build
- Production Status table updated with test suite and CI rows

#### Files created
```
src/lib/sanitize.js
src/lib/pricingEngine.js
__tests__/sanitize.test.js
__tests__/pricingEngine.test.js
jest.config.js
.github/workflows/ci.yml
```

#### Files modified
```
package.json           — added "test": "jest" script, jest + @types/jest devDependencies
src/server.js          — removed 6 inline function definitions; requires from src/lib/
README.md              — service layer section, updated tables
docs/GEMINI_HANDOFF.md — this entry
```

---

### Session: 2026-06-01 (3) — Twilio SMS, Stripe Prod Fix, A2P Campaign Support

#### 1. Twilio credentials wired (root cause of "SMS never worked")
`.env` never had `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`, so `twilioClient.messages.create()` in `/api/auth/register` always threw → fell through to email/log. That's why OTP only ever appeared in logs. Added to local `.env`:
- `TWILIO_ACCOUNT_SID` — the `AC…` SID (in local `.env` / Cloud Run env; full value in Twilio Console)
- `TWILIO_AUTH_TOKEN` (sensitive — local `.env` + Secret Manager only, never committed)
- `TWILIO_PHONE_NUMBER=+17156002720`
- Test recipient used: `+15346262235`

Production (Cloud Run): SID + phone as plain env vars; **auth token in Google Secret Manager** secret `TWILIO_AUTH_TOKEN` (runtime SA `lonerangerrunner@mightdoit.iam.gserviceaccount.com` granted `secretAccessor`).

#### 2. CRITICAL: SMS_LIVE gate (`src/server.js` register endpoint)
Diagnostic test send confirmed `messages.create()` resolves to **"queued"** even for unregistered 10DLC numbers — the carrier rejection (**error 30034**) happens **async** and NEVER throws. So with creds present but campaign unapproved, the endpoint would falsely report `channel:'sms'` and skip the email fallback, stranding every signup.

**Fix:** Twilio attempt is now gated behind `SMS_LIVE` env flag. While `SMS_LIVE !== 'true'`, OTP routes through the email fallback (works today). Set in both `.env` and Cloud Run as `SMS_LIVE=false`.

>>> **WHEN CAMPAIGN IS APPROVED:** flip the flag — `gcloud run services update lone-ranger-app --region us-central1 --update-env-vars SMS_LIVE=true` (and set `SMS_LIVE=true` in local `.env`). SMS takes over instantly, zero code changes.

#### 3. Stripe checkout was BROKEN in production — fixed
`STRIPE_PRICE_ID` and `APP_URL` were missing from Cloud Run env (dropped in an earlier revision). Effects: `line_items[].price = undefined` → every subscribe 500'd; `APP_URL` fell back to `localhost:8080` → post-payment redirect went nowhere. Restored both via `--update-env-vars`:
- `STRIPE_PRICE_ID=price_1TbSwnDBZKEvykJPQB1BQE7c` (verified: active, $74.99/mo USD, test mode)
- `APP_URL=https://lone-ranger-app-879716207624.us-central1.run.app`

Note: price is test-mode; UI advertises $49–50/mo (mismatch is fine — pricing not finalized, dev/test only).

#### 4. A2P 10DLC campaign support
- Strengthened SMS consent checkbox in registration (`dashboard.html`) + public SMS disclosure in landing footer (`index.html`)
- Privacy policy already has gold-standard clause (`privacy.html:203` — "no mobile info shared with third parties... opt-in data not shared")
- **`public/sms-optin.html`** — standalone public preview of the consent UI so reviewers can verify CTA without Google OAuth login. Served automatically by express.static at `/sms-optin.html`.

>>> **TO REVERT POST-APPROVAL:** delete `public/sms-optin.html` and redeploy. Nothing references it (no routes/links/React) — clean removal.

**Campaign status:** submitted and **locked in review (cannot edit)**. Submission did NOT include the `/sms-optin.html` URL (page went live after submission). If rejected again, resubmit with that URL in the CTA/opt-in field. The $15 vetting fee is one-time per brand — editing/resubmitting a rejected campaign generally does not re-charge it.

#### 5. Outstanding console action (done by user)
- Inbound SMS webhook for `+17156002720` → already pointed at `https://lone-ranger-app-879716207624.us-central1.run.app/api/webhook`. Inbound bridge (`/api/webhook`, validates `x-twilio-signature` with `TWILIO_AUTH_TOKEN`) is gated by campaign approval like outbound.

#### 6. Security note
Twilio auth token was shared in plaintext during this session → rotate it in Twilio Console after approval, then update local `.env` + add a new Secret Manager version.

#### Current deployment state
- **Revision:** `lone-ranger-app-00044-k8k`
- **URL:** `https://lone-ranger-app-879716207624.us-central1.run.app`
- SMS_LIVE=false (email OTP fallback active); Stripe checkout working (test mode); SMS opt-in preview live

---

### Session: 2026-06-01 (2) — Orb Animation, Starfield Photo, UI Polish

#### 1. Barrel roll orb animation (theater mode)
When the visualizer expands to theater (medium) mode, the voice orb plays a 3-phase CSS animation:
- **Phase 1 — Anticipation (0–19%):** Orb nudges right, tilts back, flares bright (`brightness: 2.2`)
- **Phase 2 — Flight (19–78%):** Two full barrel rolls (~720°) sweeping left to `-44vw`
- **Phase 3 — Warp exit (78–100%):** Flash to `scale(1.4) brightness(5)` then rockets off screen and implodes to nothing

After 1.58s the center orb disappears and a compact version materialises on the left rail with a "here I am" bounce animation (`orb-land` keyframe: flash in → oversize pop → three settling oscillations). A right-side "Estimate Snapshot" panel fades in 0.3s later.

Both side panels use `pointer-events: none` on their containers so the center ledger column remains scrollable.

#### 2. Real starfield photo background
Replaced the procedural canvas star animation with the contractor's own night sky photo (`ui/src/assets/starfield.jpg`). CSS treatment:
- `brightness(0.52) contrast(1.25) saturate(1.8) hue-rotate(8deg)` — darkens, boosts star contrast, pushes toward cool-blue/violet
- `backgroundSize: 115% 115%` — oversized so parallax has room to drift
- Mouse parallax: `backgroundPosition` animated via RAF (48–52% range, inertia factor 0.04)
- Three CSS gradient overlays: violet aurora (upper-left), blue aurora (lower-right), edge vignette

Fix: root div had `bg-void-black` which covered the fixed `z-0` Starfield. Removed `bg-void-black` from root; body CSS (`background-color: #050810`) provides the fallback.

#### 3. Sidebar + instrument panel cleanup
- Framing Controls removed from left sidebar entirely
- Pricing panel split into two sections: CSV supplier sheet upload (`POST /api/upload-csv`) and manual rate overrides
- Visualization Settings panel simplified — just describes the material yard and orbit controls

#### 4. Scope of Work field
Editable textarea at top of ledger. Autosaves to Firestore via `POST /api/estimates/:id/save` with 1.2s debounce. Flows into PDF generation via `project.scope_of_work` in the `onPublish` payload.

#### 5. Project delete
Trash icon in the EstimateList dropdown. Confirms before calling `DELETE /api/estimates/:id`, removes from local state, switches to next available project.

#### 6. Extraction fix
`POST /api/process-text` returns `{ estimateId, itemCount }` — not `{ materials, labor }`. React app was parsing the wrong shape (always got 0 extracted). Fixed: after API success, reload the full estimate from `GET /api/estimates/:id` to get updated items. Also fixed filter that deleted all `price_source: "ai"` items (now only removes `(AI)`-tagged items from previous runs).

#### 7. Other fixes
- `PCFSoftShadowMap → PCFShadowMap` (Three.js deprecation)
- Navigation Help overlay removed from visualizer
- Visualizer overlay hidden in mini mode
- Side panel `pointer-events: none` so ledger scrolls in theater mode
- Placeholder text shortened to fit input box

#### Current deployment state
- **Revision:** `lone-ranger-app-00039-trp`
- **URL:** `https://lone-ranger-app-879716207624.us-central1.run.app`

---

### Session: 2026-06-01 — React Dashboard, Mobile Layout, UI Polish

#### 1. React 18 + Vite + TypeScript dashboard (`ui/`)
Built from scratch as a new frontend layer served by the existing Express server.

**Architecture:**
```
ui/src/
├── App.tsx                  ← orchestrator, auth, API wiring
├── types.ts                 ← shared TypeScript interfaces
└── components/
    ├── ThreeVisualizer.tsx  ← Three.js scene (Stack + Build modes)
    ├── SettingsModal.tsx    ← contractor profile modal
    ← EstimateList.tsx      ← project switcher dropdown
    └── LedgerTable.tsx      ← materials + labor tables with mobile cards
```

**Cosmic glass aesthetic:** procedural canvas starfield with parallax inertia (mouse-driven aurora gradient pools), glassmorphism panels, voice orb with pulsing ring animations.

**Express routing changes (`src/server.js`):**
- `/dashboard` → serves `ui/dist/` (React build)
- `/dashboard/*` → SPA fallback to `ui/dist/index.html`
- `/dashboard-legacy` → old `dashboard.html` (onboarding only)

**Dockerfile:** `RUN cd ui && npm ci && npm run build && rm -rf node_modules` — React app is built inside Docker, not committed.

#### 2. Auth + API integration
- Reads `authBearerToken` from `localStorage` on mount (same origin as legacy dashboard — token is shared)
- 401 → clears token, redirects to `/`
- Loads real estimates from `GET /api/estimates` (fixed: server returns plain array, not `{ estimates: [] }`)
- Fetches full estimate details (with `items[]`) from `GET /api/estimates/:id` on mount and lazily on project switch
- Loads settings from `GET /api/settings`
- Checks `active_subscription` → shows subscription gate if false
- Stripe `?session_id=` return: calls `POST /api/billing/verify-session` then cleans URL

#### 3. Onboarding handoff (zero-regression)
`activateDashboard()` in `dashboard.html` now does `window.location.replace('/dashboard' + search + hash)` immediately after confirming user is onboarded — no longer reveals the old dashboard HTML. New users go through the full OTP + profile flow untouched, then land in the React app.

Landing page (`index.html`) sign-in links updated from `/dashboard` → `/dashboard-legacy`.

#### 4. Puppeteer binary fix
Local dev machine has `/usr/bin/google-chrome`, not `/usr/bin/chromium`. Both Puppeteer launch calls in `server.js` updated to `google-chrome`. Production Dockerfile installs `chromium` via apt so Cloud Run is unaffected.

#### 5. PDF generation wired (`LedgerTable.tsx`)
"Publish & Send PDF" button was a browser `alert()`. Now calls `POST /api/generate-pdf` with auth header and full estimate payload. Shows spinner during generation, then a status flash above the voice orb: "PDF sent to {email}" on success, error message on failure.

#### 6. Three-state visualizer
Mini PIP card (top-right) → Medium banner (full-width, ledger scrolls below) → Full screen. State controlled by `vizSize: 'mini' | 'medium' | 'full'`. Three.js scene stays mounted across all states (no re-init on resize). Controls: `⤢` expand, `⤡` shrink, `⛶` fullscreen, `✕` close.

#### 7. Mobile layout overhaul
- Full-bleed canvas removed as background layer — Three.js is now in the three-state PIP frame
- Content is a scrollable column: workflow bar → voice orb → ledger
- Materials/labor render as **tap-friendly cards on mobile** (labeled fields, 48px touch targets), full table on desktop (`md:`)
- Instrument sidebar hidden on mobile; replaced with a bottom-left Wrench FAB that opens panels as bottom modal
- Instrument panels: full-screen bottom modal on mobile, side-float on desktop

#### 8. UI copy + cleanup
- "TAP ORB TO DICTATE" → **"DESCRIBE YOUR JOB"**
- Placeholder: "Type wall command & press Enter" → **"e.g. 24 ft garage wall, treated plates, 2 windows..."**
- Workflow bar stages: CAPTURE/PROCESS/VISUALIZE/FINALIZE → **DESCRIBE → TAKEOFF → REVIEW → DELIVER** (each button has a real action: focus input / scroll to ledger / trigger publish)
- Navigation Help overlay removed from Three.js canvas

#### Current deployment state
- **URL:** `https://lone-ranger-app-879716207624.us-central1.run.app`
- React dashboard live at `/dashboard`
- Legacy onboarding at `/dashboard-legacy`
- Puppeteer uses `/usr/bin/chromium` in production (Docker installs it via apt)

---

### Session: 2026-05-31 (4) — Stripe Fix, Email OTP, Viz Polish
**Gemini:** Strategic review — identified Stripe, Twilio, mobile UX, and material ID as critical risks.
**Claude:** Fixed Stripe subscription loop, implemented email OTP fallback, polished visualizer.

#### 1. Stripe checkout redirect loop (`src/server.js`, `public/dashboard.html`)
**Root cause:** `STRIPE_PRICE_ID` was missing from `.env` → 500 on subscribe. After adding it, checkout worked but subscription never activated because: (a) `STRIPE_WEBHOOK_SECRET` unset causes webhook 400; (b) polling timed out and showed the Subscribe gate again; (c) confused user clicked Subscribe → sent back to Stripe.

**Fix — `POST /api/billing/verify-session`:** New authenticated endpoint. On return from Stripe with `?session_id=cs_test_...`, the frontend immediately calls this endpoint, which calls `stripe.checkout.sessions.retrieve(session_id, { expand: ['subscription'] })`, confirms `payment_status === 'paid'` and `client_reference_id === userPhone`, then writes `active_subscription: true` directly to Firestore. Resolves in <1s without any webhook dependency. Polling fallback retained for edge cases.

**Frontend:** Session verification fires before polling. On activation, cleans URL with `window.history.replaceState` and shows success toast. Fallback polling toast changed from hard error to "if not active in a moment, refresh."

#### 2. Email OTP fallback (`src/server.js`, `public/dashboard.html`)
**Why:** Twilio 10DLC campaign still in review — new users cannot receive SMS OTP, blocking all onboarding.

**Transport priority:**
1. Twilio SMS (existing, unchanged)
2. Gmail via nodemailer (new) — sends to user's Google OAuth email, same `EMAIL_USER`/`EMAIL_PASS` creds as PDF delivery
3. Console log (dev fallback when both transports unavailable)

Response includes `{ channel: 'sms' | 'email' | 'log' }`. Frontend reads it and dynamically updates OTP modal title, subtitle, and button text:
- SMS: "Verify Your Phone" / "sent to your phone number"
- Email: "Verify Your Account" / "sent to your email address"

#### 3. Visualizer polish (`public/dashboard.html`)
- **Build Layer removed** — `renderBuild()`, `_animateBuildPieces()`, `switchTab()`, `fireVizIntent()`, all Build Layer state vars, tab buttons, `viz-build-info` div, and `viz-status` span all deleted (~240 lines)
- **HUD + status text removed** — `_hudEl`, `_initHUD()`, `_updateHUD()`, `_setStatus()` removed; fleet spawning math untouched
- **Discrete tooltips** — `userData` now `{ title, material, count, weight }` per physical mesh. Full Lift shows lift-specific data; Loose Stack shows remainder data
- **Loose board separation** — 0.03 ft gap between pieces in X; `EdgesGeometry` at 18% opacity added to each loose board so individual 2x4s read clearly
- **Material identifier improved** — any plate not explicitly "top plate" → PT by default (bottom/sole/sill plates are always PT per building code); SPF check guarded to skip plate-type items; OSB detects "plywood" in addition to "osb"/"sheathing"
- **Spatial bug fixed** — vehicles moved to `offsetZ=-38` (trailer rear at z=−3); zones moved to z=10/28/46 (was 42/55/68 which clipped into trailer and exceeded 130ft ground boundary)

#### Current deployment state
- **Revision:** `lone-ranger-app-00037-xxx` (deployed this session)
- **URL:** `https://lone-ranger-app-879716207624.us-central1.run.app`
- **Stripe:** `STRIPE_PRICE_ID` set in Cloud Run env. `STRIPE_WEBHOOK_SECRET` still needed for cancel/payment_failed lifecycle events.
- **Twilio:** 10DLC still in review. Email OTP fallback live.

---

### Session: 2026-05-31 (3) — Mode 1 Deterministic Material Yard Visualizer (All 5 Phases)
**Gemini:** Directed full replacement of abstract material yard with a physics-ready digital twin of a commercial lumber drop.
**Claude:** Implemented all 5 phases; deployed as revision `lone-ranger-app-00036-7lv`. Commit `8be25b7`.

#### Architecture of the new Stack Layer (`public/dashboard.html` — `VizController`)

The entire VizController was rewritten (~515 lines replaced). Build Layer (wall framing) is untouched.

**Phase 1 — Environment**
- `PlaneGeometry(150, 130)` asphalt ground with procedural canvas noise texture (repeat 12×12)
- Parking lot striping: white bay lines at ±12/24/36/48 ft in X; amber hazard stripe flanking vehicle zone
- `HemisphereLight(sky=0x7ec8e3, ground=0x5a3b20, 0.7)` — outdoor ambient fill
- `DirectionalLight(0xfff8e7, 1.4)` at (35, 50, 30) with PCF soft shadows, 2048×2048 shadow map
- Warehouse backdrop: 80×24 ft steel wall, 82×40 ft roof, 3 loading bay doors at x=±22, 0
- Scene fog from 70–115 ft (matches sky color for depth)

**Phase 2 — Hardcoded material constants (`MAT_CONST`)**

| Key | Lift qty | Piece dims (ft) | Lift dims (ft) | lbs/piece | lbs/lift |
|---|---|---|---|---|---|
| `SPF` | 294 | 3.5/12 × 1.5/12 × 8 | 49/12 W × 31.5/12 H × 8 L | 9.0 | 2,646 |
| `PT` | 294 | same | same | 15.0 | 4,410 |
| `OSB` | 86 | 47.875/12 × 0.418/12 × 95.875/12 | 47.875/12 W × 3 H × 95.875/12 L | 45.0 | 3,870 |

Dunnage: 3 blocks per lift, cross-section 3.5/12 × 3.5/12 ft, placed at 1 ft / 4 ft / 7 ft along lift length.
`TRAILER_MAX_LBS = 11200` (16-ft tandem-axle flatbed).

**Phase 3 — Delivery math & geometry (`_buildLiftGeo`)**
- `fullLifts = Math.floor(qty / liftQty)` — each rendered as AABB bounding box with per-face material array:
  - `BoxGeometry` face order: `[+X, -X, +Y(top), -Y(bottom), +Z, -Z]`
  - Faces 0,1,2,4,5 = plastic wrap `CanvasTexture` (striped semi-transparent)
  - Face 3 (-Y) = exposed wood grain `CanvasTexture` (horizontal grain lines, color-matched per species)
- `remainder = qty % liftQty` — individual pieces rowed on top (each `BoxGeometry(pW, pH, pL)`)
- Dunnage blocks rendered under each lift (before stackY increments)
- All geometry built into a sub-group positioned at zone coordinates; labels are sprites on top

**Phase 4 — Phased staging zones**
- Zone 1 (z = 42 ft): PT + SPF — closest to truck (first out, last in)
- Zone 2 (z = 55 ft): generic/unidentified trades (old abstract piles, still supported)
- Zone 3 (z = 68 ft): OSB sheathing bunks
- Each material gets its own `THREE.Group` sub-group; `zoneCurX` advances by `liftW + 2 ft` per material added to a zone

**Phase 5 — Payload physics + UI**
- **HUD overlay:** `position:absolute` div inside canvas parent, shows "Total Est. Weight: X,XXX lbs" + fleet warning
- **Fleet spawning:** `trucksNeeded = ceil(totalLbs / 11200)` — up to 3 truck+trailer combos spawned at x offsets of 20 ft each
- **Truck geometry:** cab (7.5 × 6.5 × 9), windshield glass (transparent), truck bed, 4 front/rear tires
- **Trailer geometry:** 8 × 16 ft flatbed deck at z+27, side rails, tandem axle tires at z+23 and z+27
- **Raycasting tooltips:** `mousemove` → `_raycaster.intersectObjects(_tooltipMeshes)` → HTML div with "Name | Qty | Weight lbs"
- **Tab integration:** `switchTab('build')` hides `_vehicleGroup`, HUD, and tooltip; Build Layer unchanged

#### Material identifier (`_identifyMaterial`)
Keyword matching on `item.name + item.trade`:
- `osb` or `sheathing` → `'OSB'`
- `treat`/`\bpt\b` + `plate`/`sill`/`bottom` → `'PT'`
- `2x4`/`stud`/`spf` or trade = `lumber`/`framing` → `'SPF'`
- Everything else → generic trade pile (Zone 2)

#### Current deployment state
- **Revision:** `lone-ranger-app-00036-7lv`
- **URL:** `https://lone-ranger-app-879716207624.us-central1.run.app`
- **Commits live:** all commits through `8be25b7` (includes security fixes from session 2)

---

### Session: 2026-05-31 (2) — Unity Pivot, Window Framing, Security Fixes
**Gemini:** Directed abandoning Unity WebGL pipeline in favor of native Three.js for the deterministic builder.
**Claude:** Implemented window framing in Build Layer, fixed 6 security vulnerabilities, confirmed architecture pivot.

#### Architecture pivot: Unity WebGL → Three.js
The Three.js Build Layer in `dashboard.html` already delivered the core proof of concept (wall rendered from voice input). Dropping Unity removes the compile pipeline, GCP VM dependency, and C# build tooling. Three.js is now the permanent Phase 2 deterministic builder.

#### Window framing added (`public/dashboard.html`)
`windowOpenings` from the Supervisor JSON was parsed but ignored by the renderer. Now fully implemented:
- King studs + trimmers on each side of rough opening
- Header at 6.5 ft, rough sill at 3 ft
- Cripple studs below sill and above header
- Multiple openings of any mix (doors + windows) now distribute evenly across the wall
- Sole plate gaps only at door openings (continuous under windows)
- Field studs correctly skip all opening zones

#### Security fixes (`src/server.js`)
Six vulnerabilities found and patched (4 HIGH, 2 MEDIUM):
1. **XSS in PDF HTML** — `escapeHtml()` now applied to `company_logo_url` before `<img src>` attribute
2. **XSS in change order page** — same fix applied to the unauthenticated `/approve` page
3. **Contractor PII exposed to clients** — `/api/change-orders/approve` no longer accepts `userPhone`/`parentEstimateId` from client body; looks them up server-side from `approvals` collection
4. **Weak OTP randomness** — `Math.random()` replaced with `crypto.randomInt()`
5. **Weak estimate ID randomness** — `Math.random()` replaced with `crypto.randomBytes()`
6. **Predictable change order IDs** — `CO-{timestamp}` replaced with `CO-{hex}`

Note: OTP plaintext log line intentionally left in place — Twilio campaign pending approval, log is the current onboarding path. Remove when Twilio campaign is approved.

### Session: 2026-05-31 — Mode 1 Visualizer Polish + Bug Fixes
**Gemini:** n/a (implementation session)
**Claude:** Fixed two visualizer bugs; replaced bar chart with material yard scene.

#### 1. End-stud missing bug (`public/dashboard.html`)
The field stud loop used `x <= L + 0.01` as a tolerance to force a terminal stud, but floating-point
spacing steps could overshoot past `L + 0.01` without triggering. For a 10 ft wall at 16" OC, the last
field stud lands at 9.33 ft and the next step (10.67 ft) skips the loop entirely.
**Fix:** Always explicitly place a bookend stud at `xOff + L` after the loop, with an `inOp` guard.

#### 2. Visualizer only rendering one wall per estimate (`public/dashboard.html`)
`fireVizIntent()` cached intent by `estimateId`. On the same estimate, speaking a second wall returned
the cached (old) intent instead of re-fetching. New voice/text input calls now pass `bypassCache = true`
so the scene re-renders fresh on every submission. Cache still applies when loading an existing estimate
from the list (avoids redundant Gemini calls on repeated project opens).

#### 3. Material yard scene — replaces bar chart (`public/dashboard.html`)
Stack Layer now renders a job-site material yard instead of abstract colored bars:
- **Ground plane** — dark dirt/earth plane with subtle warm grid (replaces purple grid)
- **Lumber/framing** → stacked boards with wood-sticker strips between layers
- **Concrete/masonry** → stacked 80lb bags in alternating row orientation
- **Paint/coating** → metal buckets with colored trade-color lids arranged in grid
- **Plumbing/HVAC** → pipes bundled in triangle stack pattern
- **Roofing** → flat shingle bundles stacked
- **Default** → wooden crates with edge lines
- Each pile sits on a wooden pallet
- Quantity-driven: pile height/count scales with item quantities, not dollar values

**Roadmap context (decided this session):**
- **Mode 1** (voice-driven): material yard with quantities + future truck/trailer load visualizer
- **Mode 2** (blueprint upload): Gemini vision extracts all walls → multi-wall JSON schema → full floor plan render
- Mode 2 is the subscription-justifying flagship; Mode 1 is the daily-use habit builder

### Session: 2026-05-30 — Supervisor/Builder Phase 1 Scaffolding
**Gemini:** Brainstormed the Supervisor/Builder architecture direction and defined Phase 1 scope.
**Claude:** Implemented backend infrastructure. All changes confined to `src/server.js` + new docs.

#### 1. Unity WebGL Static Serving (`src/server.js` ~line 109)
Replaced bare `express.static(...)` with a version using the `setHeaders` callback. Sets correct
`Content-Type` and `Content-Encoding` headers for all Unity WebGL file variants:

| Pattern | Content-Type | Content-Encoding |
|---|---|---|
| `.wasm` | `application/wasm` | — |
| `.wasm.gz` / `.wasm.br` | `application/wasm` | `gzip` / `br` |
| `.data` | `application/octet-stream` | — |
| `.data.gz` / `.data.br` | `application/octet-stream` | `gzip` / `br` |
| `.framework.js.gz` / `.br` | `application/javascript` | `gzip` / `br` |

**Why it matters:** Without `Content-Type: application/wasm`, Chrome/Firefox refuse to compile the module.
The Unity build will drop files into `public/` — server was already ready to serve them correctly.

#### 2. `POST /api/estimate/voice-to-json` (`src/server.js` ~line 2795)
New Supervisor endpoint — the AI layer of the Supervisor/Builder contract.

- Accepts `{ transcript: string }` in request body
- Gated by `requireAuth` (Google ID Token — same as all other protected routes)
- Calls Gemini via `config.systemInstruction` (proper system channel, not appended to user message)
- System prompt: "Construction Intent Translator" — strict extraction rules for all 5 Phase 1 fields
- Returns `{ success: true, intent: { ...phase1Schema } }`
- Zero modifications to any existing route (`/api/process`, `/api/process-text`, `/api/webhook`, etc.)

#### 3. "Seed for Thought" Analysis — Missing Parameter Strategy
Before writing the sanitizer, Claude analyzed the architectural tradeoff:
> *Should missing voice params be handled by Express hardcoded defaults, or Gemini prompt defaults?*

**Recommendation (accepted):** Both layers — defense in depth.
- Gemini prompt defaults handle the **intelligent** case (context-aware inference, e.g. "slab" → `treatedSolePlate: true`)
- Express sanitizer handles the **deterministic guarantee** (Unity gets valid types regardless of AI variance)

This mirrors the existing `assignUnitPrice()` pattern: Gemini provides `estimated_unit_cost`, Express
falls back to `|| 0` as the hard floor. Consistent with the codebase's established tiered approach.

#### 4. `sanitizePhase1Intent()` helper (`src/server.js` ~line 2718)
Pure synchronous function that reconstructs the full Phase 1 object from scratch:

- `studSpacingInches` — snaps to exactly `16` or `24` (no other value can reach Unity)
- `lengthFt` / `heightFt` — validated as finite positive numbers; defaults `20` / `9`
- `treatedSolePlate` — strict boolean check; defaults `false`
- `doorOpenings` — non-negative integer; floats are floored; defaults `0`
- `schemaVersion` and `projectType` — always hard-pinned in Express, never from AI response
- Replaced the weaker top-level key presence guard entirely

#### 5. This Handoff System (`docs/GEMINI_HANDOFF.md`)
Created this live context document to bridge Gemini brainstorming sessions and Claude Code
implementation sessions. Also initialized Claude's persistent memory with:
- Project context (architecture, stack, current phase)
- Workflow pattern (Gemini → user → Claude pipeline)
- Pointer to this file as the authoritative context source

**Usage:** Paste `docs/GEMINI_HANDOFF.md` at the start of a Gemini session to restore full context.
Claude Code sessions load project memory automatically and will reference this file.

### Session: 2026-05-30 (end of day) — Full Day Summary
**What got done today (in order):**

1. **Supervisor/Builder Phase 1 backend** — `POST /api/estimate/voice-to-json` live on Cloud Run. Gemini translates voice transcripts to deterministic Phase 1 JSON packets. `sanitizePhase1Intent()` guarantees Unity never receives null/wrong-type values.

2. **Phase 1 schema expanded** — Added `structural.wallType`, `features.windowOpenings`, `features.cornerCount` to both the Express sanitizer and Gemini system prompt.

3. **C# Unity contract scripts written** — `ConstructionPayload.cs` (serializable data classes) and `ConstructionManager.cs` (MonoBehaviour with `BuildWallFromJSON()`). `SupervisorResponse` wrapper added to handle the `{ success, intent }` API envelope correctly. **Verified compile-clean against Unity 6 with no changes needed.**

4. **GCP workstation provisioned** — `lone-ranger-unity-desktop` (n1-standard-4, no GPU, Windows Server 2022, us-central1-a). GPU skipped — GCP quota is 0; request pending. Cost: ~$0.32/hr running, ~$0.05/hr stopped.

5. **Automation scripts** — `scripts/fast-launch.sh` (start → poll TCP 3389 → auto-open RDP), `scripts/gcp-workstation.sh` (start/stop/status/password/provision), `unity/tools/setup-workstation.ps1` (headless provisioner). Shell aliases set up locally: `dev-box-launch`, `dev-box-stop`, etc.

6. **Repo migrated to StudCast** — `github.com/iPolluxx/StudCast`. Fresh single-commit history, zero secrets, zero PII. Old `Voice-To-Estimate` repo can be archived/deleted.

7. **Security cleanup** — Hardcoded phone/email replaced with env vars, `Reports/` removed from tracking, all API keys confirmed never committed to history.

8. **Unity 6 installed in VM** — Installed manually via Unity Hub GUI (automated script had encoding/execution issues on Windows Server). Unity 6 chosen over planned 2021.3.44f1 — better WebGL support.

9. **Claude Code running in VM** — Installed via npm at `C:\Projects\StudCast`. Claude Code in the VM generated `CLAUDE.md` and pushed it to StudCast. This gives both local and VM Claude sessions full project context automatically.

**Current state right now:**
- VM: **STOPPED** (~$0.05/hr) — no longer needed for 3D pipeline; only start if doing standalone Unity work
- StudCast repo: `github.com/iPolluxx/StudCast` — commit `9f62962`, local matches remote
- Backend: deployed on Cloud Run at `https://lone-ranger-app-879716207624.us-central1.run.app` (revision `lone-ranger-app-00035-jth`)
- Dashboard Build Layer: window framing added, security fixes applied — **committed but not yet deployed**
- Local dev server: runs with `npm start` on port 8080

**Immediate next session tasks:**
1. Deploy: `gcloud builds submit --tag gcr.io/mightdoit/lone-ranger-app && gcloud run deploy lone-ranger-app --image gcr.io/mightdoit/lone-ranger-app --region us-central1 --platform managed`
2. Test Build Layer with voice: try "frame a 20 foot wall with 2 windows and 1 door" — verify all openings render
3. Mode 1 polish: truck + trailer load visualizer (next big UX differentiator)
4. Mode 2 planning: blueprint upload → Gemini vision → multi-wall JSON schema → full floor plan render

### Session: 2026-05-30 (session 5) — VM Setup, Repo Migration, Unity 6
**Gemini:** n/a (ops session)
**Claude:** Completed VM setup manually after automated script issues; migrated repo to StudCast.

#### Repo migration: Voice-To-Estimate → StudCast
- Old repo had PII (phone, email) in git history and a security audit report in tracked files
- Created fresh `github.com/iPolluxx/StudCast` with single clean commit — zero history, zero secrets
- Local remote updated to point to StudCast
- `patch.py` / `patch2.py` dropped (old one-time migration scripts, no longer needed)

#### VM setup (manual — automated script had issues)
- `setup-workstation.ps1` failed due to: (1) Unicode box-drawing chars corrupting on Edge download, (2) `#Requires -RunAsAdministrator` failing under GCE startup agent as SYSTEM, (3) Unity Hub CLI requiring account sign-in before headless install
- **Resolved by:** downloading repo as ZIP from GitHub, installing Unity 6 via Unity Hub GUI, installing Claude Code via npm
- **Unity version change:** Unity 6 installed instead of planned 2021.3.44f1 LTS — Unity 6 has better WebGL support and our C# scripts use only basic APIs (MonoBehaviour, JsonUtility, Debug.Log) so full compatibility expected
- **Current VM state:** Unity 6 installed, `C:\Projects\StudCast` populated via ZIP download, Claude Code running

#### Security cleanup before going public
- Replaced hardcoded `+15346262235` / `someonewhocan00@gmail.com` in `server.js` seed block with `process.env.SEED_PHONE` / `process.env.SEED_EMAIL`
- Removed `Reports/` from git tracking (contained security vulnerability audit)
- Scrubbed VM IPs from handoff doc
- Full git history scan confirmed no real API keys/secrets were ever committed

### Session: 2026-05-30 (session 4) — Automated Launch & Headless VM Provisioner
**Gemini:** Directed full automation of onboarding pipeline to minimize billed idle time.
**Claude:** Created `scripts/fast-launch.sh`, updated `gcp-workstation.sh` alias block, created `unity/tools/setup-workstation.ps1`.

#### `scripts/fast-launch.sh`
Single-command cold-start controller. Execution flow:
1. Prints billing warning (~$0.68/hr) with `dev-box-stop` reminder
2. Issues `gcloud compute instances start` with `--quiet`
3. Polls for public IP every 3 seconds (times out at 60s)
4. Loop-probes TCP 3389 every 5 seconds using pure-bash `/dev/tcp` (no `nc` dependency)
5. Auto-detects and fires RDP client in priority order: WSL `mstsc.exe` → `xfreerdp` → `rdesktop` → manual fallback with copy-paste connect string
6. Times out gracefully at 300 seconds with a helpful error message

#### `scripts/gcp-workstation.sh` — alias block update
Added `dev-box-launch` as the top alias pointing to `fast-launch.sh` with an absolute path. Also updated the description list to mark it as the primary entry point.

#### `unity/tools/setup-workstation.ps1`
Headless Windows provisioner (run once as Administrator after first RDP login). Steps:
1. **Git** — detects if already installed; otherwise downloads Git `2.46.0` installer and runs `/VERYSILENT /NORESTART` with component flags
2. **Unity Hub** — downloads from Unity CDN, installs via `/S` (NSIS silent flag); validates executable exists post-install
3. **Unity 2021.3.44f1 + WebGL** — calls Unity Hub CLI headless: `"Unity Hub.exe" -- --headless install --version 2021.3.44f1 --changeset <hash> --module webgl`; guards on `$UNITY_CHANGESET` placeholder so the script fails-fast with instructions rather than silently misfiring
4. **Repo clone** — clones `github.com/iPolluxx/Voice-To-Estimate` to `C:\Projects\Voice-To-Estimate`; does `git pull` if already cloned
5. Prints a formatted summary with next-step instructions for opening the Unity project

**One required manual step before running:** set `$UNITY_CHANGESET` in the script by looking up the hash at `unity.com/releases/editor/archive`.

### Session: 2026-05-30 (session 3) — Phase 1 Schema Expansion + C# Builder Contract
**Gemini:** Directed expansion of Phase 1 schema with 3 new fields; directed generation of C# Unity scripts.
**Claude:** Modified `src/server.js` (sanitizer + system prompt); created `unity/Assets/Scripts/`.

#### 1. Phase 1 Schema Expansion (`src/server.js`)
Three new fields added to `sanitizePhase1Intent()` and `VOICE_TO_JSON_SYSTEM_PROMPT`:

- **`structural.wallType`** — `"interior"` | `"exterior"` (default: `"exterior"`). Snapped server-side: any value that isn't exactly `"interior"` becomes `"exterior"`. Affects lumber sizing and header spec in Unity.
- **`features.windowOpenings`** — non-negative integer (default: `0`). Floored server-side. Drives window rough-opening framing in Unity.
- **`features.cornerCount`** — non-negative integer (default: `4` — a standard rectangular room). Floored server-side. Drives corner assembly instantiation in Unity.

Gemini extraction rules updated to match: `wallType` infers from "exterior/interior/partition/outside wall/load-bearing"; `windowOpenings` counts explicit mentions; `cornerCount` infers from "L-shaped", "U-shaped", room descriptions, or explicit counts.

#### 2. `unity/Assets/Scripts/ConstructionPayload.cs`
`[Serializable]` C# contract classes under the `LoneRanger.Construction` namespace, matching the expanded Phase 1 schema field-for-field. `JsonUtility.FromJson<ConstructionPayload>()` will deserialize the Supervisor's JSON directly into these classes. Includes XML doc comments on every field.

#### 3. `unity/Assets/Scripts/ConstructionManager.cs`
MonoBehaviour Builder entry point. `BuildWallFromJSON(string jsonPayloadString)`:
- Deserializes payload via `JsonUtility.FromJson<ConstructionPayload>()`
- Logs all parsed values (dimensions, spacing, plates, wall type, openings, corners)
- Derives framing geometry: stud height (wall minus 2 plates), opening linear deductions, field stud count, king stud count, total stud count
- Logs full material takeoff to Console (ready for BOM callback to Supervisor)
- Contains 4 stub private methods (`InstantiatePlates`, `InstantiateFieldStuds`, `InstantiateOpenings`, `InstantiateCorners`) with `TODO` comments — Phase 2 fills these with `Instantiate()` calls
- Inspector-serialized prefab fields (`studPrefab`, `platePrefab`, `kingStudPrefab`, `headerPrefab`, `cornerPrefab`) ready to assign in Editor

### Session: 2026-05-30 (session 2) — GCP Unity Workstation Infrastructure
**Gemini:** Finalized strategy to offload Unity Editor + WebGL compilation to a GCP cloud workstation
due to local hardware constraints (8 GB RAM, exhausted swap, integrated GPU only).
**Claude:** Created `scripts/gcp-workstation.sh`.

#### `scripts/gcp-workstation.sh`
Production-grade bash CLI controller for the GCP Unity workstation. Key design choices:
- **`set -euo pipefail`** — fails loudly on any error; no silent partial-runs
- **Config block at top** — all GCP values (project, zone, instance, machine type, GPU) as `readonly` vars; one place to update if anything changes
- **`provision`** — runs the exact `gcloud compute instances create` command with `--maintenance-policy=TERMINATE`, `--no-restart-on-failure`, T4 GPU attachment, and a sysprep metadata script that auto-installs the NVIDIA GPU driver on first Windows boot via `googet`
- **`start`** — starts the VM then immediately prints a boxed billing warning (~$0.68/hr) with the `stop` command reminder
- **`stop`** — stops the VM; confirms disk-only cost (~$0.05/hr)
- **`status`** — colour-coded status badge (RUNNING/STOPPED/STARTING), shows public IP and ready-to-paste `mstsc` RDP command
- **`password`** — wraps `gcloud compute reset-windows-password` for user `builder`
- **`aliases`** — prints a ready-to-paste shell alias block for `dev-box-start`, `dev-box-stop`, `dev-box-status`, `dev-box-password`, `dev-box-provision` with absolute paths so aliases work from any directory

---

## Infrastructure: GCP Unity Workstation

Local hardware (i5-6200U, 8 GB RAM, integrated GPU) cannot run Unity Editor or compile WebGL builds.
All Unity development happens on a dedicated GCP cloud workstation.

**Instance:** `lone-ranger-unity-desktop`
**Spec:** n1-standard-4 (4 vCPUs, 15 GB RAM) + 100 GB pd-balanced SSD — **no GPU (pending quota)**
**OS:** Windows Server 2022 Datacenter with Desktop Experience
**Zone:** `us-central1-a` / Project: `mightdoit`
**Status:** RUNNING (provisioned 2026-05-30) — check current IP with `dev-box-status`
**Cost:** ~$0.32/hr running | ~$0.05/hr stopped (disk only)
**GPU plan:** T4/L4 quota request pending — once approved, stop VM → `gcloud compute instances set-machine-type` + add accelerator → start
**Controller:** `scripts/gcp-workstation.sh` — CLI controller with `provision`, `start`, `stop`, `status`, `password`, `aliases` commands
**Fast launch:** `scripts/fast-launch.sh` — single-command cold start: starts VM → polls TCP 3389 → fires mstsc/xfreerdp the moment RDP answers
**Aliases:** Run `./scripts/gcp-workstation.sh aliases` for one-paste shell setup — includes `dev-box-launch` (fast-launch.sh), `dev-box-start/stop/status/password/provision`
**Connect:** RDP to public IP on port 3389, user `builder` (reset password with `password` command)
**Provisioner:** `unity/tools/setup-workstation.ps1` — originally intended for headless install; had encoding/execution issues on Windows Server. Setup was completed manually (see session 5 log).
**Claude Code in VM:** Installed and running at `C:\Projects\StudCast` — use this for all future Unity-side development tasks.

---

## Open Items / Next Steps

- [x] ~~**Jest test suite**~~ — 56 tests across `sanitize.js` and `pricingEngine.js`; offline, $0 API cost, 1s runtime
- [x] ~~**GitHub Actions CI**~~ — `.github/workflows/ci.yml` runs on every push + PR to `main`; no secrets required
- [x] ~~**Service layer extraction**~~ — `src/lib/sanitize.js` (pure functions) + `src/lib/pricingEngine.js` (DI factory); `server.js` now requires from lib
- [x] ~~**Deterministic 3D Builder**~~ — Three.js Build Layer live; wall framing with doors + windows renders from voice input
- [x] ~~**Phase 1 Schema**~~ — `windowOpenings`, `cornerCount`, `wallType`, `doorOpenings` all wired end-to-end
- [x] ~~**Security audit**~~ — 6 vulnerabilities patched (XSS, PII exposure, weak randomness)
- [x] ~~**Mode 1 material yard visualizer**~~ — All 5 phases shipped; viz polish complete (Build Layer removed, discrete tooltips, loose board separation)
- [x] ~~**Deploy latest**~~ — All commits through current session live on Cloud Run rev 00037
- [x] ~~**Email OTP fallback**~~ — Parallel transport: Twilio SMS → Gmail fallback → console log; frontend shows correct copy per channel
- [x] ~~**Stripe checkout loop bug**~~ — Fixed: `POST /api/billing/verify-session` activates subscription directly via Stripe API; no webhook dependency
- [x] ~~**Mode 1 material ID tuning**~~ — `_identifyMaterial()` improved: bottom/sole/sill plates → PT by default (code-required), top plates → SPF, OSB detects sheathing/plywood
- [ ] **Stripe webhook secret** — Add `STRIPE_WEBHOOK_SECRET` to Cloud Run env vars for production subscription lifecycle (cancel, payment_failed events). Get from Stripe Dashboard → Webhooks.
- [ ] **Remove OTP log line** — `console.warn('[register] OTP...')` in server.js once Twilio 10DLC campaign approved
- [ ] **Flip SMS_LIVE flag** — `gcloud run services update … --update-env-vars SMS_LIVE=true` once A2P 10DLC campaign is approved
- [ ] **Rotate Twilio auth token** — Token was shared in plaintext during a session; rotate in Twilio Console, update local `.env` + add new Secret Manager version
- [x] ~~**Wire React demo simulations to real routes**~~ — Done: voice orb (real mic), change order modal (real generate/send), approval portal all wired.
- [x] ~~**Finish type-scale migration**~~ — All components migrated (SettingsModal, EstimateList, ThreeVisualizer done in Phase 1 housekeeping; full audit pass completed 2026-06-11).
- [x] ~~**PIPELINE_V2 wired into SMS webhook**~~ — `/api/webhook` now forks on `PIPELINE_V2=true` (same pattern as `process-text`); legacy monolith path kept as fallback.
- [x] ~~**Menards market pricing tier**~~ — `market` tier (priority 2.5) live; 70 verified SKUs, Oxylabs weekly scrape, Cloud Scheduler job `menards-price-sync` (Monday 6AM CT), Firestore global cache `market_prices/menards/items/`. Green "Menards · Xh" badge in LedgerTable.
- [ ] **Remove legacy monolith** — Delete the `// LEGACY` branch in both `POST /api/process-text` and `/api/webhook` + `mergeIntoLedger` once `PIPELINE_V2` is validated clean in prod.
- [ ] **Change Order Step 2 (Puppeteer PDF archiving)** — On approval, generate a "Certificate of Electronic Signature" PDF with typed name, IP, timestamp, SHA-256 hash; upload to `gs://lone-ranger-change-orders`; save `pdf_archive_url` to Firestore change order doc.
- [ ] **Change Order Step 3 (View Signed Contract button)** — In contractor dashboard, show "View Signed Contract" button on approved change orders that have a `pdf_archive_url`.
- [ ] **`typed_signature` persistence** — `POST /api/change-orders/approve` receives `typed_signature` from the consent UI but does not yet save it to Firestore or include it in the audit trail. Wire it in when implementing Step 2 PDF archiving.
- [ ] **Mode 2: blueprint upload** — Gemini vision reads blueprint image → extracts all walls → multi-wall JSON → full floor plan render in Three.js
- [ ] **Multi-wall schema** — Extend Phase 1 JSON to support `walls[]` array with position + rotation per wall
- [ ] **Phase 2 schema** — Define `floor_frame`, `roof_truss` project types
- [x] ~~**Unity WebGL pipeline**~~ — Abandoned; Three.js is the builder; `unity/` folder retained in repo only

---

## For Gemini: Quick Orientation

If you're reading this to catch up on what's been built:

- The **estimating core** (voice → items → price → PDF) is complete and in production
- The **billing/onboarding** (Stripe + Google OAuth + Twilio OTP) is complete
- The **change order system** is fully production-grade: generate → email approval link (white-labeled, optional job-site photo) → client consent UI (ESIGN Act checkbox + typed signature) → approval writes IP + timestamp + SHA-256 document hash to `approval_record` in Firestore → contractor notification email with audit trail. GCS bucket `lone-ranger-change-orders` holds uploaded job-site photos (`roles/storage.objectAdmin` granted to the Cloud Run SA). PDF archiving on approval (Step 2) and "View Signed Contract" dashboard button (Step 3) are tracked as open items.
- The **3D visualizer** (Stack Layer — material yard) is live in the React dashboard; WebXR AR mode available when device supports it
- The **PIPELINE_V2** 3-stage estimation pipeline (Estimator → Pricer → Reviewer) is implemented, flag-gated, and verified end-to-end; ready to flip in prod
- The **design system** is codified — `PRODUCT.md` / `DESIGN.md` at repo root, tokens in `ui/src/index.css @theme`, machine-readable sidecar at `.impeccable/design.json`
- All **public marketing/auth pages** (index, dashboard-legacy auth gate, privacy, terms) are now on the cosmic-glass system
- The **SMS opt-in** is now visible to A2P reviewers without authentication (surfaced on the loginGate card); sms-optin.html redirects to the real form
- The **GCP workstation** (`lone-ranger-unity-desktop`) is STOPPED; no longer needed — Three.js replaced Unity WebGL
- The **Menards market pricing tier** is live — 70 verified SKUs scraped weekly via Oxylabs, stored in `market_prices/menards/items/` (global, not per-tenant). The pricing waterfall is now 4-tier: `override → database → market → ai`. Cloud Scheduler job fires every Monday 6AM CT. Green "Menards · Xh" badge appears in the ledger for market-priced items.
- The **master price sheet** is live — Settings → "Price Sheet" tab shows the merged view of the contractor's saved prices vs. Menards market, with inline edit, per-item and bulk sync, and delete. Fixes the stale-price-book problem: contractors can one-tap sync all matched prices from the live Menards cache instead of updating hundreds of entries manually.
- The **voice orb is now live** — tapping it records real audio (`getUserMedia` → `MediaRecorder`) and posts to `/api/process` for Gemini extraction. No longer a scripted demo. (Older docs that call it a "scripted demo" are stale.)
- **Change orders are fully real** — `ChangeOrderModal` (editable ledger + client picker) calls `POST /api/change-orders/generate` and `POST /api/change-orders/send` (Twilio, gated by `SMS_LIVE`); contractor edits persist via `PUT /api/change-orders/:id` (regenerates the PDF). The old client-side approval simulation is gone. Client details (name/phone/address) are captured in the PDF preview's recipient strip and saved before the PDF renders.
- The **frontend has had a full design pass** (impeccable critique/audit/polish, audit 19/20): type on tokens, modal focus traps + dialog semantics, contrast floored, 44px targets, mobile-editable change-order table, `--color-stale-amber` token, global reduced-motion guard, AR controls on `soft-violet`. `ThreeVisualizer` is lazy-loaded — initial JS bundle is 294 kB (was 852 kB).
- The **repo** is `github.com/iPolluxx/StudCast` — latest deployed revision: see the most recent Work Session Log entry. Product name is now **Lone Ranger Estimator** (StudCast retired as a brand name)
- The **next milestone** is Mode 2: contractor uploads a blueprint photo → Gemini vision extracts all walls → multi-wall JSON schema → Three.js renders the full floor plan
- See `docs/app-features.md` for the full user-facing feature catalog
- See `docs/user-journey.md` for the end-to-end contractor flow
- See `src/server.js` for the complete backend (single file, ~2800 lines)
