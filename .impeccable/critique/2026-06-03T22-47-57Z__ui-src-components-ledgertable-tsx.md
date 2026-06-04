---
target: the LedgerTable
total_score: 35
p0_count: 0
p1_count: 0
timestamp: 2026-06-03T22-47-57Z
slug: ui-src-components-ledgertable-tsx
---
# Critique: LedgerTable (ui/src/components/LedgerTable.tsx) — re-run

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Live totals, publish spinner, durable error bar, confirm summary, empty states. |
| 2 | Match System / Real World | 4 | Plain "Materials/Labor/Role/Total"; badges now "Est./Yours/Saved" + tooltips. |
| 3 | User Control and Freedom | 3 | Delete + publish both have confirm/cancel; no true undo after a confirmed delete. |
| 4 | Consistency and Standards | 4 | Both sections cool-blue; semantic colors tokenized; mobile/desktop parity. |
| 5 | Error Prevention | 4 | Fractional-safe, negatives clamped, delete confirm, publish confirm, disable-when-empty. |
| 6 | Recognition Rather Than Recall | 4 | Badge labels + tooltips; "Source"/"Delete" spelled out. |
| 7 | Flexibility and Efficiency | 2 | Still no keyboard cell-nav, bulk, or duplicate; add inserts a fixed placeholder. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, on-brand, tokenized; 8–9px type still dense. |
| 9 | Error Recovery | 4 | Specific inline error + Retry, preserves the estimate. |
| 10 | Help and Documentation | 3 | Scope placeholder + badge tooltips explain; markup/tax still unexplained inline. |
| **Total** | | **35/40** | **Good (top of band) — up from 24** |

## Anti-Patterns Verdict

**LLM assessment:** Still does not look AI-generated, and now cleaner. Semantic colors flow through tokens, contrast meets AA, focus is keyboard-visible. The cosmic-glass identity reads as deliberate craft.

**Deterministic scan:** `detect.mjs` returned `[]` — zero anti-pattern hits, consistent with the first run.

**Visual overlays:** Not available (no browser automation); review is source-based + deterministic scan.

## Overall Impression

The five-command pass (harden → colorize → clarify → audit → polish) moved this from "acceptable, with three P1s" to "good, ship-adjacent." The document now behaves like a money document: you can't silently truncate a billable hour, can't fat-finger a line into oblivion, and can't fire a PDF without a beat of confirmation. The voice is a contractor's, not a spacecraft's. What's left is efficiency for heavy users and a brand-wide type-size decision — neither is blocking.

## What's Working

1. **Money-doc integrity.** `clampNum` kills the integer-truncation bug and negatives; the two-step delete confirm and the confirm-before-send turn destructive/high-stakes actions into deliberate ones.
2. **Plain voice + legible provenance.** "Materials / Labor / Role / Total" and "Est./Yours/Saved" (with hover tooltips) replaced the jargon; the price-source code is now self-explaining.
3. **Accessibility caught up.** AA contrast (muted text at /70), a keyboard `:focus-visible` ring, semantic `<h3>` headings, `scope="col"`, and aria-labels — the screen-reader/keyboard path is real now.

## Priority Issues

### [P2] No power-user efficiency for large takeoffs
- **Why it matters:** Editing a 40-line estimate is still click-each-cell. No tab-to-next-cell / enter-to-add-row, no bulk delete, no duplicate; "Add Material" inserts a fixed placeholder to fully overwrite. Alex abandons; even a diligent contractor on a big job feels the drag.
- **Fix:** Keyboard cell navigation (arrow/tab/enter), a duplicate-row action, optional multi-select delete.
- **Suggested command:** /impeccable harden (interaction model) or a dedicated build pass

### [P2] Sub-readable type floor
- **Why it matters:** 8–9px labels/badges sit well under the 14px mobile floor and are hard for low vision and bright-light field use, even now that contrast passes.
- **Fix:** Lift the label/badge floor to ~10–11px system-wide; reserve 8px for decoration.
- **Suggested command:** /impeccable typeset

### [P3] Small "Add Material / Add Labor" touch targets
- **Why it matters:** These 9px text links are still under 44px on mobile (the delete buttons were fixed; these weren't).
- **Fix:** Pad to a 44px hit area or render as small pills.
- **Suggested command:** /impeccable adapt

## Persona Red Flags

**Alex (Power User):** Still no keyboard accelerators, bulk actions, or duplicate-row. The single remaining real frustration.

**Casey (Mobile contractor):** Delete targets are 44px now and the confirm step prevents mis-tap loss, but add-links stay small and 8–9px type washes out in bright light.

**Sam (Accessibility):** Big improvement — AA contrast, visible focus ring, headings, scope, aria-labels. Remaining concern is only the very small type for low-vision users.

## Minor Observations

- No PDF preview before send; the confirm summary ("Email the PDF estimate for $X? N materials, M rows") now provides the reassurance beat, which largely closes the original gap.
- Markup % / tax % are shown but not editable or explained inline (they live in Settings).
- `allItems.findIndex(i => i === item)` is still O(n²) per render; negligible at typical sizes, worth an index map if takeoffs grow large.
- No true undo after a confirmed delete (confirm covers the mis-tap case; undo would be the gold standard).

## Questions to Consider

- Should the ledger become keyboard-first (spreadsheet-style tab/enter) for contractors doing large takeoffs, rather than click-per-cell?
- Is 8px type a brand non-negotiable, or can the floor rise to 11px without losing the dense "instrument" feel?
- Is confirm-before-delete the right model, or would an undo toast be less friction while still safe?
