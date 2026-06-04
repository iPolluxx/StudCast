---
target: the LedgerTable
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-06-03T23-04-20Z
slug: ui-src-components-ledgertable-tsx
---
# Critique: LedgerTable (ui/src/components/LedgerTable.tsx) — re-run (typeset)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Live totals, publish spinner, durable error bar, confirm, empty states. |
| 2 | Match System / Real World | 4 | Plain "Materials/Labor/Role/Total"; badges "Est./Yours/Saved" + tooltips. |
| 3 | User Control and Freedom | 3 | Delete + publish confirm/cancel; no true undo after a confirmed delete. |
| 4 | Consistency and Standards | 4 | Cool-blue sections, tokenized colors, committed rem type scale. |
| 5 | Error Prevention | 4 | Fractional-safe, negatives clamped, delete + publish confirm, disable-when-empty. |
| 6 | Recognition Rather Than Recall | 4 | Badge labels + tooltips; "Source"/"Delete" spelled out; keyboard tip shown. |
| 7 | Flexibility and Efficiency | 3 | Keyboard grid nav + Enter-to-add; still no bulk/duplicate. |
| 8 | Aesthetic and Minimalist Design | 4 | Committed 11px-floor rem scale; clean micro→mini→base→xl hierarchy. |
| 9 | Error Recovery | 4 | Specific inline error + Retry, preserves the estimate. |
| 10 | Help and Documentation | 3 | Scope placeholder, tooltips, keyboard tip; markup/tax still unexplained inline. |
| **Total** | | **37/40** | **Excellent — up from 36 (baseline 24)** |

## Anti-Patterns Verdict

**LLM assessment:** Not AI-generated. Distinctive, tokenized, accessible, keyboard-first, and now on a disciplined type scale. Clean.

**Deterministic scan:** `detect.mjs` returned `[]` — zero hits, consistent across all four runs.

**Visual overlays:** Not available (no browser automation); review is source-based + deterministic scan.

## Overall Impression

The typeset pass did exactly one thing and did it cleanly: replaced 30 ad-hoc px sizes (floored at 8px) with a committed two-step rem scale (micro 11 / mini 13) sitting under the existing base/xl, raising the floor to 11px and making the whole surface zoom-respecting. That clears the last knock on Aesthetic — the sub-readable density — and nudges the total to 37. The three remaining points are all product-judgment calls (undo, bulk actions, inline markup/tax help), not defects.

## What's Working

1. **Disciplined type scale.** micro (11px) → mini (13px) → base (16px) → xl (20px), all rem, all named tokens. No arbitrary px, an 11px hard floor, and a clean stepped hierarchy that reads at a glance. Documented in DESIGN.md so it stays enforced.
2. **Keyboard-first editing** (carried): Enter advances/adds rows, Up/Down move between rows.
3. **Money-doc integrity + accessibility + plain voice** (carried): fractional-safe numbers, delete/publish confirms, AA contrast, focus ring, semantic headings, self-explaining badges.

## Priority Issues

### [P3] No bulk or duplicate-row actions
- **Why it matters:** Keyboard nav covers fast sequential entry, but ten near-identical lines still mean re-entering each. The one thing capping Flexibility at 3.
- **Fix:** Duplicate-row action + optional multi-select delete (small parent handler each).
- **Suggested command:** dedicated build pass / /impeccable harden (interaction)

### [P3] No true undo after a confirmed delete
- **Why it matters:** The two-step confirm prevents mis-taps, but a confirmed delete is unrecoverable. Caps User Control at 3.
- **Fix:** Undo toast after delete (would also let the confirm relax to one tap).
- **Suggested command:** dedicated build pass

### [P3] Markup / tax not explained or editable inline
- **Why it matters:** Both appear in the summary but live in Settings; a contractor mid-review can't see why the total includes them or adjust on the spot. Caps Help at 3.
- **Fix:** A tooltip or inline link to the markup/tax settings.
- **Suggested command:** /impeccable clarify

## Persona Red Flags

**Alex (Power User):** Keyboard nav satisfies fast entry; only bulk/duplicate remains.

**Casey (Mobile contractor):** Type now floors at 11px and scales with zoom — more readable in the field. Delete targets 44px, confirm prevents loss. Small add-links the lingering nit.

**Sam (Accessibility):** AA contrast, visible focus, headings, aria-labels, and now rem-based sizes that respect zoom and a 11px floor. Strong.

## Minor Observations

- The committed scale is defined globally but only the ledger consumes it so far; App.tsx chrome still carries 8–9px px sizes (documented follow-up).
- `allItems.findIndex(i => i === item)` still O(n²) per render; negligible at typical sizes.
- No PDF preview before send; the confirm summary covers the reassurance beat.

## Questions to Consider

- Roll the type scale across App.tsx now, or keep the dense 8–9px chrome as intentional brand contrast against the readable ledger?
- Is duplicate-row worth a parent handler, or is fast keyboard entry enough?
- Could confirm-before-delete relax to one tap if an undo toast existed?
