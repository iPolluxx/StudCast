---
target: change order dispatch flow (ChangeOrderModal + PDF recipient strip)
total_score: 25
p0_count: 0
p1_count: 2
timestamp: 2026-06-07T23-10-59Z
slug: ui-src-components-changeordermodal-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | 5–20s dispatch shows only a static "Dispatching…"; PDF preview doesn't reflect typed-but-unsent client details |
| 2 | Match System / Real World | 2 | "Formulate Change Addendum", "Dispatch Authorization", "Constructed Addendum" — defense-contractor jargon, not how a solo framer talks |
| 3 | User Control and Freedom | 2 | No Esc-to-close, no backdrop-click dismiss; exclusions are read-only with no way to remove a wrong one |
| 4 | Consistency and Standards | 3 | Modal architecture + edit pattern are consistent, but sub-floor 9–10px type diverges from the token-migrated LedgerTable; native select breaks control vocabulary |
| 5 | Error Prevention | 2 | A $0 / empty change order is dispatchable; no plain confirmation that a real client's phone is about to be texted |
| 6 | Recognition Rather Than Recall | 3 | Client picker derived from real estimates with dedup is a genuine win; pre-fill helps |
| 7 | Flexibility and Efficiency | 3 | Inline edits + dropdown good; no keyboard dismiss, no Enter-to-dispatch |
| 8 | Aesthetic and Minimalist Design | 3 | Coherent glass surface, but sub-11px dense mono pushes toward the legacy "data-entry" feel the brand explicitly rejects |
| 9 | Error Recovery | 3 | dispatchError shown with icon + plain text, modal state preserved on failure (edits not wiped) |
| 10 | Help and Documentation | 1 | Zero explanation of what dispatch does (texts a real client a legal amendment); high-stakes action with no guidance |
| **Total** | | **25/40** | **Acceptable — real issues to fix before this is trustworthy** |

## Anti-Patterns Verdict

**LLM assessment:** This does **not** read as generic AI slop. It inherits the cosmic-glass system correctly — shared modal architecture (header / scroll-body / footer), the Two-Voice color rule (cool-blue totals, soft-violet CO id, alert-rose for errors and exclusions, emerald not misused), the click-value-to-edit pattern mirrored from the main ledger. The failure mode here is the *product* failure mode, not the brand one: "strangeness without purpose" in a few components — a raw native `<select>` whose open option list renders OS-default white against the void-black glass, and financial figures set below the system's own 11px floor. A category-fluent user wouldn't say "a robot made this," but they would pause at the cramped 9–10px dollar amounts and the un-branded dropdown.

**Deterministic scan:** `detect.mjs` ran on `ChangeOrderModal.tsx` and `PDFPreviewModal.tsx` → **exit 0, zero findings.** The detector caught nothing because its slop signatures (gradient text, side-stripe borders, eyebrow scaffolding, hero-metric template) aren't what's wrong here. The issues are design-system-fidelity violations specific to this project's own DESIGN.md (the 11px floor, the ad-hoc `text-[Npx]` ban), which a generic detector can't know.

**Visual overlays:** No browser automation was available in this environment (no running dev server, no injection capability). No user-visible overlay was produced; this assessment is source-read + CLI detector only.

## Overall Impression

The flow *works* and it's on-brand at the structural level — but the single most important number on the screen, the change-order total the client is being asked to approve, is rendered at 13px while line items sit at 10px and labels at 9px. The brand's own third principle is "Earn trust with the number," and the type here quietly undercuts it. Biggest opportunity: lift everything to the 11px floor, make the CO total the dominant figure, and rewrite the cockpit-cosplay button labels into plain contractor English. Those three moves take this from "acceptable" to "trustworthy" without touching the architecture.

## What's Working

- **Client picker from real data.** Deriving the dropdown from saved estimates (deduplicated by phone, alphabetized) is recognition-over-recall done right — the contractor picks a known client instead of retyping a number, and the manual-entry fallback covers the cold-start case. This is the strongest single decision in the build.
- **Consistent modal vocabulary.** `ChangeOrderModal` and `PDFPreviewModal` share the same header/scroll-body/footer skeleton, the same pill buttons, the same glass treatment. Screen-to-screen consistency is exactly what the product register asks for.
- **Failure preserves work.** A dispatch error renders inline (AlertTriangle + plain text) and leaves the edited ledger and selected client intact rather than wiping the modal. Good error-recovery instinct.

## Priority Issues

- **[P1] Financial figures below the 11px floor**
  - **Why it matters:** DESIGN.md sets a hard 11px floor (`text-micro`) and reserves `text-mini` (13px) for dollar figures and `text-xl` (20px) for the grand total, and CLAUDE.md bans ad-hoc `text-[Npx]`. `ChangeOrderModal` renders line totals, the totals breakdown, table cells, and edit inputs at `text-[10px]`, and headers/labels at `text-[9px]`; `PDFPreviewModal`'s recipient strip does the same. These are the numbers a contractor stakes their name on, read in a truck cab with glasses off. Sub-floor mono digits regress legibility and pull the surface toward the legacy "data-entry" anti-reference.
  - **Fix:** Replace every `text-[9px]`/`text-[10px]` with `text-micro` (labels) / `text-mini` (data, dollar figures). Match the token-migrated `LedgerTable` exactly.
  - **Suggested command:** `/impeccable typeset`

- **[P1] Cockpit-cosplay copy contradicts the brand voice**
  - **Why it matters:** PRODUCT.md is explicit: "talks to a tradesperson as a peer, not a project manager: direct, plain, no jargon." "Formulate Change Addendum," "Dispatch Authorization," and "Constructed Addendum" are the opposite — they sound like a missile-launch console, not a tool for a solo framer. A first-timer can't tell that "Dispatch Authorization" means "this texts my customer right now."
  - **Fix:** Plain verb-object labels: "Create change order," "Text to client," "Change order ready." Keep the cosmic *visual* identity; drop the cosmic *vocabulary*.
  - **Suggested command:** `/impeccable clarify`

- **[P2] Change-order total is under-emphasized**
  - **Why it matters:** This total is the entire point of the modal — it's the figure the client approves. It's set at `text-mini` (13px), barely larger than the 10px line items, so the eye has no anchor. The One Blue Number rule wants the trusted figure to dominate.
  - **Fix:** Promote the CO total to `text-xl` (20px) cool-blue, give it clear separation from the breakdown rows above it.
  - **Suggested command:** `/impeccable layout`

- **[P2] Missing standard modal affordances**
  - **Why it matters:** Neither modal closes on Esc or backdrop click, and there's no focus trap or `role="dialog"`/`aria-modal`. Alex (power user) expects Esc; Sam (screen reader) gets no dialog semantics and can tab out of the modal into the page behind it.
  - **Fix:** Add Esc-to-close, backdrop-click dismiss, `role="dialog" aria-modal="true"` with an `aria-label`, and focus containment. Consider the native `<dialog>` element, which gives Esc + focus trap for free.
  - **Suggested command:** `/impeccable harden`

- **[P2] Native `<select>` breaks the glass aesthetic**
  - **Why it matters:** The closed control is styled, but the *open* option list is browser-native (white background, OS font) and lands as a jarring un-branded panel over the void-black glass — the "mismatched form control" product-slop tell. (Caveat: native select is the most screen-reader-friendly option, so don't replace it carelessly.)
  - **Fix:** Either lean in and accept the native list as a deliberate accessibility choice, or build a glass listbox (`role="listbox"`) that keeps keyboard semantics. Don't ship a half-styled select.
  - **Suggested command:** `/impeccable polish`

- **[P3] No guardrail on an empty or unconfirmed send**
  - **Why it matters:** A change order Gemini extracted nothing from is a $0.00 modal that can still be dispatched; and "Dispatch Authorization" fires a real SMS to a real client with no "Text change order to +1 715…?" confirmation. Riley breaks this; Marco hesitates.
  - **Fix:** Disable dispatch when total is $0 / no line items; surface the destination number in plain text at the point of send.
  - **Suggested command:** `/impeccable harden`

## Persona Red Flags

**Casey (Distracted Mobile — the contractor's actual context):** The 9–10px mono dollar figures are unreadable one-handed in daylight; this persona *is* the target user, in a truck, on a phone. Inline-edit targets are small text buttons well under the 44×44pt minimum, hard to hit precisely with a thumb. The generated change order lives only in React memory — if Casey is interrupted mid-review and the tab reloads, the modal can't reopen to it (the CO is in Firestore, but the UI has no path back).

**Sam (Accessibility-Dependent):** No `role="dialog"`/`aria-modal`, no focus trap — tabbing escapes the modal into the page behind. Inline-edit value buttons and the icon-only sync/delete controls carry no accessible names. Sub-11px financial text fails low-vision needs on the exact content that matters most. (Credit where due: the native `<select>` is the *right* call for this persona; keep its semantics if you restyle it.)

**Marco (project persona — owner-operator framer, dirty hands, estimating from the cab):** "Formulate Change Addendum" makes Marco hesitate — is this billing the customer? sending something legal? He needs the button to say what it does. And he can't read a 10px total with his readers in the glovebox. He wants one glance: big number, who it's going to, send.

## Minor Observations

- Both modals appear with **no entrance transition** — they pop in instantly while the rest of the system is deliberately, confidently animated. A 150–200ms fade/scale-in (with a reduced-motion fallback) would match both the product register's "motion conveys state" and the brand's energy.
- The **PDF preview iframe doesn't re-render** after editing the recipient fields, so the previewed client name can differ from the one actually sent. Either regenerate the preview on blur or label the strip "Applied on send."
- The **dirty-flag** optimization is good, but reverting an edit to its original value still leaves `dirty = true` and triggers a redundant PDF regen on dispatch. Negligible, but a value-compare would be cleaner than a boolean.

## Questions to Consider

- Should the change-order review even be a **modal**? The product register's stance is "modal as first thought is usually laziness," and you yourself floated "could just work in the side panel." A review-before-send step is a defensible modal, but an inline panel in the same space the estimate ledger uses would be more consistent with how the rest of the app works.
- What would a **confident** version of the dispatch moment look like — one big cool-blue total, the destination phone in plain text, one button that says exactly what it does?
- If the contractor edits a change order's prices, should those edits also **flow back into the parent estimate's price book** the way the main ledger's edits do, or is a change order intentionally a one-off?
