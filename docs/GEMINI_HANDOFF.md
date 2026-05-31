# Lone Ranger Estimator — Live Project Context
> **Purpose:** This document is the handoff bridge between Gemini brainstorming sessions and Claude Code
> implementation sessions. Update it after every meaningful work session.
> **Last updated:** 2026-05-31 — Stripe checkout fixed; email OTP fallback; viz polish; deployed rev 00037

---

## What This App Is

**Lone Ranger Estimator** — a multi-tenant SaaS platform for independent contractors. The core loop:

1. Contractor speaks or types a job scope (voice, text, or SMS)
2. Gemini AI extracts structured materials + labor from the transcript
3. Items are priced via a 3-tier waterfall (user price_book → AI estimate → $0 fallback)
4. Contractor reviews/edits an interactive ledger
5. Clicks "Generate PDF" → Puppeteer renders a professional estimate, emails it to the contractor
6. Stripe handles subscriptions; Firestore is the database

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
| 3D Frontend | Three.js r128 (browser-native, live) |
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

users/{phone}/price_book/{itemId}     ← per-user custom pricing catalog
  .name, .price

ledgers/{phone}                       ← legacy collection (pre-estimates migration)
registrations/{phone}                 ← OTP verification staging
approvals/{changeOrderId}             ← lookup map for token-gated approval page
```

---

## Pricing Engine (3-Tier Waterfall)

Priority order inside `assignUnitPrice()` (never short-circuits without reason):

1. **Explicit user price** — contractor stated a price in the transcript → `item.explicit_user_price`
2. **Per-user price_book** — Firestore subcollection `users/{phone}/price_book/{sanitizedId}`
3. **AI estimate fallback** — `item.estimated_unit_cost` embedded by Gemini in the extraction prompt

Labor uses the same 3-tier logic via `assignLaborRate()`, with `default_labor_rate` from settings as tier 2.

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
| POST | `/api/change-orders/send` | requireAuth + sub | Send Twilio SMS with approval link |
| GET | `/approve` | Token-gated (public) | Client-facing approval page |
| POST | `/api/change-orders/approve` | Token-gated (public) | Record client approval |

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
- `index.html` — public marketing storefront at `/`
- `dashboard.html` — contractor app at `/dashboard`
- `privacy.html`, `terms.html` — legal pages
- `3d_estimator.html`, `3d_framing_visualizer.html` — early 3D UI prototypes
- *(future)* Unity WebGL build files — `.wasm`, `.data`, `.framework.js`, `.loader.js`

---

## Work Session Log

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
- [ ] **Mode 2: blueprint upload** — Gemini vision reads blueprint image → extracts all walls → multi-wall JSON → full floor plan render in Three.js
- [ ] **Multi-wall schema** — Extend Phase 1 JSON to support `walls[]` array with position + rotation per wall
- [ ] **Phase 2 schema** — Define `floor_frame`, `roof_truss` project types
- [x] ~~**Unity WebGL pipeline**~~ — Abandoned; Three.js is the builder; `unity/` folder retained in repo only

---

## For Gemini: Quick Orientation

If you're reading this to catch up on what's been built:

- The **estimating core** (voice → items → price → PDF) is complete and in production
- The **billing/onboarding** (Stripe + Google OAuth + Twilio OTP) is complete
- The **change order system** (generate → SMS approval → sign off) is complete
- The **new work** is the Supervisor/Builder 3D architecture — backend + Three.js builder are both live in production
- The **3D visualizer** has two modes in the same panel: Stack Layer (material yard) and Build Layer (wall framing), both driven by voice input
- The **GCP workstation** (`lone-ranger-unity-desktop`) is STOPPED; no longer needed — Three.js replaced Unity WebGL
- The **repo is StudCast** (`github.com/iPolluxx/StudCast`) — all commits through `8be25b7` are on Cloud Run
- The **next milestone** is Mode 2: contractor uploads a blueprint photo → Gemini vision extracts all walls → multi-wall JSON schema → Three.js renders the full floor plan
- See `docs/app-features.md` for the full user-facing feature catalog
- See `docs/user-journey.md` for the end-to-end contractor flow
- See `src/server.js` for the complete backend (single file, ~2800 lines)
