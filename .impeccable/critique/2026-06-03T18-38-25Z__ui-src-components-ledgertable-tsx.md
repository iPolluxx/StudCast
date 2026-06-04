---
target: the LedgerTable
total_score: 24
p0_count: 0
p1_count: 3
timestamp: 2026-06-03T18-38-25Z
slug: ui-src-components-ledgertable-tsx
---
# Critique: LedgerTable (ui/src/components/LedgerTable.tsx)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Total recalcs live; publish shows spinner. No per-row "saved" cue. |
| 2 | Match System / Real World | 2 | Robotic jargon: "Extracted Labor Allocation Sheets", "Role Designation", "Grand Valuation". |
| 3 | User Control and Freedom | 2 | Row delete is instant — no confirm, no undo. |
| 4 | Consistency and Standards | 3 | Solid mobile/desktop parity; violet vs blue accent logic is inconsistent. |
| 5 | Error Prevention | 2 | Qty/hours truncate to int; negatives allowed; no delete guard. |
| 6 | Recognition Rather Than Recall | 3 | Price-source color code is great; "override"/"src" unexplained. |
| 7 | Flexibility and Efficiency | 2 | No keyboard cell-nav, no duplicate/bulk, add inserts a fixed placeholder. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, focused, strong total hierarchy. On-brand. |
| 9 | Error Recovery | 2 | Publish failure = transient 5s flash; easy to miss. |
| 10 | Help and Documentation | 2 | Good scope placeholder; no tooltips on badges, markup, tax. |
| **Total** | | **24/40** | **Acceptable — significant improvements before contractors are happy** |

## Anti-Patterns Verdict

**LLM assessment:** Does NOT look AI-generated. This is genuinely on-brand — cosmic-glass surface, tracked mono labels, the three-color price-source code. No generic SaaS card grid, no gradient text, no side-stripes, no hero-metric template. The slop risk here is the opposite of usual: it's *over*-styled in voice (jargon) rather than under-designed.

**Deterministic scan:** `detect.mjs` returned `[]` — zero anti-pattern hits on the file. Clean.

**Visual overlays:** Not available. No browser automation in this environment, so no live overlay was injected. Review is source-based plus the deterministic scan.

## Overall Impression

The bones are right: inline-editable ledger, live totals, a smart price-source color code, real mobile/desktop variants. It looks like the product it's supposed to be. The single biggest opportunity is **voice** — the copy talks like aerospace telemetry ("Allocation Sheets", "Role Designation", "Grand Valuation"), which directly fights PRODUCT.md's "talk to a tradesperson as a peer, plain, no jargon." Right behind it: this is a money document, and it's missing the guardrails a money document needs (fractional hours, delete confirmation, no negatives).

## What's Working

1. **The price-source color code.** `ai`=violet, `override`=blue, `database`=emerald tint-on-tint badges let a contractor see at a glance where every price came from. This is the trust-through-legibility principle made concrete.
2. **Honest responsive split.** Real mobile cards (stacked, labeled fields) and a real desktop table, not one cramped layout forced to do both. The mobile cards even use wrapping `<label>` elements.
3. **The total hierarchy.** Grand total is cool-blue, large, mono, and still — it obeys the One Blue Number Rule and is unmistakably the most important thing on screen.

## Priority Issues

### [P1] Robotic jargon copy fights the brand voice
- **Why it matters:** PRODUCT.md says talk to a tradesperson as a peer — plain, no jargon. "Extracted Labor Allocation Sheets", "Role Designation", "Grand Valuation", "valuation" read like a spacecraft manifest. A solo contractor doesn't think in "allocation sheets"; they think "Labor" and "Total". The space *theme* is the brand; the space *vocabulary* is alienating.
- **Fix:** "Extracted Material Line Items" → "Materials". "Extracted Labor Allocation Sheets" → "Labor". "Role Designation" → "Role". "Grand Valuation" / "valuation" → "Total". Keep the cosmic look; drop the cosmic words.
- **Suggested command:** /impeccable clarify

### [P1] Quantity and hours silently truncate to integers
- **Why it matters:** Both qty and hours use `parseInt`, so a contractor can't enter 1.5 hours, 2.5 sheets, or 12.5 sq ft — the decimal is silently dropped. Fractional hours are routine in labor billing. This produces a wrong number on a document the contractor stakes their name on.
- **Fix:** Use `parseFloat` for qty and hours (unit_price/rate already do). Add `min="0"` and a sensible `step`.
- **Suggested command:** /impeccable harden

### [P1] Destructive delete with no confirmation or undo
- **Why it matters:** The trash button removes a line item instantly. On a money document, a mis-tap deletes a priced line with no recovery path — and the mobile tap target (`p-1.5`, ~28px) makes mis-taps likely. Riley (stress tester) and Casey (mobile) both hit this.
- **Fix:** Add an inline confirm (or an undo toast). At minimum, enlarge the touch target to ≥44px.
- **Suggested command:** /impeccable harden

### [P2] Two-Voice Rule violation — violet used decoratively
- **Why it matters:** Your just-locked DESIGN.md rule says violet = intelligence (AI moments) and blue = trust. Here the "Labor" and "Scope of Work" headers and the "Add Labor Row" link are soft-violet, but labor and scope aren't AI moments. The accent is decorative, which is exactly what the rule prohibits. It also makes the blue/violet split look arbitrary next to the (correct) price-source badges.
- **Fix:** Make non-AI section headers and add-row links cool-blue (or neutral starlight). Reserve violet for genuinely AI-driven affordances.
- **Suggested command:** /impeccable colorize

### [P2] Accessibility gaps on a keyboard/screen-reader pass
- **Why it matters:** Sam (screen reader) hits an icon-only delete button with no `aria-label` (announced as just "button"); desktop table inputs have no associated labels; the editable-cell affordance is a transparent border that only appears on focus, so it's invisible that a cell is editable; muted text at `/45`–`/30` opacity likely fails 4.5:1 contrast.
- **Fix:** Add `aria-label="Delete row"`; associate `<th>`/labels with inputs; give cells a faint resting underline; bump muted text contrast.
- **Suggested command:** /impeccable audit

## Persona Red Flags

**Alex (Power User):** No tab-to-next-cell or enter-to-add-row flow for editing a large takeoff. No duplicate-row or bulk delete. "Add Material" inserts a hardcoded placeholder ("2x4 SPF SPF Stud standard" — note the doubled "SPF" typo) he must fully overwrite. Editing a 40-line estimate is a click-heavy slog.

**Casey (Mobile contractor, one-handed, field):** Every numeric field requires manual typing — no steppers — on a phone, possibly with gloves. Delete tap target ~28px, under the 44px floor. Muted starlight text washes out in bright outdoor light. Publish button is reachable and the mobile cards are genuinely good, which saves it.

**Sam (Accessibility):** Icon-only delete with no label; unlabeled table inputs; focus-only cell borders; low-contrast muted text. Color is not the *sole* carrier on price-source (text is present), which is a point in its favor.

## Minor Observations

- Placeholder material has a typo: "2x4 SPF **SPF** Stud standard" (in `handleAddFieldItem`, App.tsx).
- "Src" column header and the `override`/`ai`/`database` badge values are unexplained — a first-timer (Jordan) won't know what "override" means. A one-line legend or tooltip would close it.
- Markup % and tax % are shown but not explained or editable here (they live in Settings); a contractor mid-review may not connect them.
- No PDF preview before "Publish & Send" — a high-stakes action with only a transient flash for reassurance.
- `allItems.findIndex(i => i === item)` maps edits back by reference identity; fragile if two line items are ever truly identical objects.

## Questions to Consider

- The space theme is the brand, but does the *vocabulary* need to be space-themed too? What if the labels were dead-plain ("Materials", "Labor", "Total") and the cosmos lived purely in the visuals?
- This is the document a contractor stakes their reputation on. What would the *confident, careful* version of deleting a line or sending a PDF look like — versus the current instant, frictionless one?
- Should editing a 40-row takeoff feel like a spreadsheet (keyboard-first, tab/enter) rather than a click-each-cell form?
