# Lone Ranger Estimator — Live Project Context
> **Purpose:** This document is the handoff bridge between Gemini brainstorming sessions and Claude Code
> implementation sessions. Update it after every meaningful work session.
> **Last updated:** 2026-05-30 (end of day — VM stopped, Unity 6 installed, C# scripts verified, ready for Phase 2)

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

This is the big architectural direction being built out now. Two fully separate layers:

### AI Supervisor (existing — `src/server.js`)
- Node.js / Express backend
- Receives voice/text input
- Calls Gemini to interpret contractor intent
- Emits deterministic JSON command packets
- Handles all business logic, auth, Stripe, PDF, Firestore

### Deterministic Builder (future — Unity WebGL)
- Unity WebGL export served from `public/`
- Receives JSON packets from the Supervisor
- Renders 3D framing scenes (walls, studs, openings)
- NO AI, NO inference — pure deterministic geometry
- Strict contract: if the JSON packet is malformed, the C# side crashes

**The key rule:** The Supervisor thinks. The Builder builds. They never swap roles.

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
| 3D Frontend | Unity WebGL (in progress — Phase 1 MVP) |
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
- VM: **STOPPED** (~$0.05/hr) — start with `dev-box-launch` when ready
- Unity 6: installed in VM, project not yet opened
- StudCast repo: `github.com/iPolluxx/StudCast` — CLAUDE.md committed by VM session
- Backend: deployed on Cloud Run at `https://lone-ranger-app-wzyjs4vwsq-uc.a.run.app`
- Local aliases: `dev-box-launch`, `dev-box-stop`, `dev-box-status` active in `~/.bashrc`

**Immediate next session tasks:**
1. Boot VM with `dev-box-launch`
2. Open Unity Hub → Open `C:\Projects\StudCast\unity` with Unity 6
3. Verify C# scripts compile (expect clean)
4. Create basic wall framing prefabs and assign to ConstructionManager Inspector fields
5. Uncomment the Phase 2 instantiation calls in `BuildWallFromJSON()`
6. Test `BuildWallFromJSON()` with a sample payload in Play mode
7. Export WebGL build → copy to `public/` → deploy → test in browser

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

- [x] ~~**Provision workstation**~~ — `lone-ranger-unity-desktop` live in `us-central1-a` (no GPU, ~$0.32/hr)
- [x] ~~**Unity installed**~~ — Unity 6 installed via Unity Hub GUI (upgraded from planned 2021.3.44f1 — Unity 6 has better WebGL support, C# scripts compatible)
- [x] ~~**Repo on VM**~~ — StudCast downloaded as ZIP to `C:\Projects\StudCast`
- [x] ~~**Claude Code in VM**~~ — Running at `C:\Projects\StudCast`
- [ ] **Open Unity project** — Open `C:\Projects\StudCast\unity` in Unity Hub with Unity 6; verify C# scripts compile
- [ ] **Update C# namespace** — `ConstructionPayload.cs` uses `LoneRanger.Construction` namespace; rename to `StudCast.Construction` to match new project name
- [ ] **Assign prefabs** — Create framing prefabs in Unity Editor; assign to `ConstructionManager` Inspector fields
- [ ] **Unity WebGL Build** — Compile WebGL export; drop build files into `public/`; smoke-test MIME type headers with a real `.wasm` file
- [ ] **Request GCP GPU quota** — Go to console.cloud.google.com/iam-admin/quotas?project=mightdoit, request GPUS_ALL_REGIONS = 1
- [x] ~~**Phase 1 Schema expansion**~~ — `windowOpenings`, `cornerCount`, `wallType` added; C# contract classes generated
- [ ] **Implement prefab instantiation** — Fill in the 4 stub methods in `ConstructionManager.cs` with actual `Instantiate()` calls
- [ ] **Builder → Supervisor callback** — Define how Unity sends back computed stud count / material takeoffs to the Supervisor for estimate merging
- [ ] **Phase 2 schema** — Define `floor_frame`, `roof_truss` project types for future Builder phases
- [ ] **BOM generation from Unity** — Unity Builder auto-calculates stud count from dimensions + spacing; this BOM should flow back into the existing estimate/pricing engine

---

## For Gemini: Quick Orientation

If you're reading this to catch up on what's been built:

- The **estimating core** (voice → items → price → PDF) is complete and in production
- The **billing/onboarding** (Stripe + Google OAuth + Twilio OTP) is complete
- The **change order system** (generate → SMS approval → sign off) is complete
- The **new work** is the Supervisor/Builder 3D architecture — backend is complete, Unity side is being set up
- The **GCP workstation** (`lone-ranger-unity-desktop`, us-central1-a) is live with Unity 6 + Claude Code installed
- The **repo is now StudCast** (`github.com/iPolluxx/StudCast`) — migrated from Voice-To-Estimate for a clean history
- The **next milestone** is opening the Unity project, verifying the C# scripts compile, and getting a WebGL build out
- See `docs/app-features.md` for the full user-facing feature catalog
- See `docs/user-journey.md` for the end-to-end contractor flow
- See `src/server.js` for the complete backend (single file, ~2800 lines)
