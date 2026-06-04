---
target: the LedgerTable
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-06-03T22-56-20Z
slug: ui-src-components-ledgertable-tsx
---
# Critique: LedgerTable (ui/src/components/LedgerTable.tsx) — re-run (keyboard nav)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Live totals, publish spinner, durable error bar, confirm, empty states. |
| 2 | Match System / Real World | 4 | Plain "Materials/Labor/Role/Total"; badges "Est./Yours/Saved" + tooltips. |
| 3 | User Control and Freedom | 3 | Delete + publish confirm/cancel; no true undo after a confirmed delete. |
| 4 | Consistency and Standards | 4 | Both sections cool-blue; semantic colors tokenized. |
| 5 | Error Prevention | 4 | Fractional-safe, negatives clamped, delete + publish confirm, disable-when-empty. |
| 6 | Recognition Rather Than Recall | 4 | Badge labels + tooltips; "Source"/"Delete" spelled out; keyboard tip shown. |
| 7 | Flexibility and Efficiency | 3 | Keyboard grid nav + Enter-to-add added; still no bulk/duplicate/customization. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, on-brand, tokenized; 8–9px type still dense. |
| 9 | Error Recovery | 4 | Specific inline error + Retry, preserves the estimate. |
| 10 | Help and Documentation | 3 | Scope placeholder, badge tooltips, keyboard tip; markup/tax still unexplained inline. |
| **Total** | | **36/40** | **Excellent (minor polish only) — up from 35, and 24 at baseline** |

## Anti-Patterns Verdict

**LLM assessment:** Not AI-generated. Distinctive, tokenized, accessible, and now keyboard-first for power use. Clean.

**Deterministic scan:** `detect.mjs` returned `[]` — zero hits, consistent across all three runs.

**Visual overlays:** Not available (no browser automation); review is source-based + deterministic scan.

## Overall Impression

The single change since the last run — spreadsheet-style keyboard navigation — was the right lever. It lifted the one heuristic (Flexibility) that had been stuck at 2 since baseline, and that one point tips the total from "Good" into the "Excellent" band. The ledger is now ship-quality: correct, safe, plain-spoken, accessible, tokenized, and fast to drive without a mouse. What remains is genuinely minor-polish and product-judgment territory, not defects.

## What's Working

1. **Keyboard-first editing.** Enter advances down the column and adds-and-focuses a new row at the bottom; Up/Down move between rows (with number-input increment suppressed so it doesn't fight nav). A contractor can enter a full takeoff without leaving the keyboard, and the desktop tip line makes it discoverable.
2. **Money-doc integrity** (carried from prior passes): fractional-safe numbers, negative clamping, two-step delete confirm, confirm-before-send, disable-when-empty.
3. **Accessibility + voice** (carried): AA contrast, visible focus ring, semantic headings, aria-labels, plain language, self-explaining price-source badges.

## Priority Issues

### [P3] No bulk or duplicate-row actions
- **Why it matters:** Keyboard nav covers fast sequential entry, but a contractor with ten near-identical line items still re-enters each. No multi-select delete or duplicate-row.
- **Fix:** Add a duplicate-row action and optional multi-select delete (both need a small parent handler).
- **Suggested command:** dedicated build pass / /impeccable harden (interaction)

### [P3] Sub-readable type floor
- **Why it matters:** 8–9px labels/badges remain under the 14px mobile floor; fine for sighted desktop use, taxing for low vision and bright-light field use.
- **Fix:** Lift the label/badge floor to ~10–11px system-wide.
- **Suggested command:** /impeccable typeset

### [P3] No true undo after a confirmed delete
- **Why it matters:** The two-step confirm prevents mis-taps, but once confirmed there's no recovery. Undo is the gold standard for a reversible money document.
- **Fix:** Optional undo toast after delete (would also let the confirm step relax to one-tap).
- **Suggested command:** dedicated build pass

## Persona Red Flags

**Alex (Power User):** Largely satisfied now — keyboard grid nav and Enter-to-add are the accelerators that were missing. Remaining wish: bulk/duplicate.

**Casey (Mobile contractor):** Delete targets 44px, confirm prevents loss; small add-links and 8–9px type in bright light are the lingering nits.

**Sam (Accessibility):** AA contrast, visible focus, headings, scope, aria-labels all in place. Only the very small type remains a low-vision concern.

## Minor Observations

- Markup % / tax % shown but not editable/explained inline (live in Settings).
- `allItems.findIndex(i => i === item)` is still O(n²) per render; negligible at typical sizes.
- Keyboard nav is desktop-only by design (mobile is touch-first); that's correct, not a gap.
- No PDF preview before send; the confirm summary covers the reassurance beat.

## Questions to Consider

- Is duplicate-row worth a parent handler now that sequential entry is fast, or is it premature?
- Could the confirm-before-delete relax to one-tap if an undo toast existed?
- Is 8px type a brand non-negotiable, or can the floor rise to 11px without losing the instrument feel?
