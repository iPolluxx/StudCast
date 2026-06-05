---
target: landing page (public/index.html)
total_score: 29
p0_count: 0
p1_count: 2
timestamp: 2026-06-05T02-14-30Z
slug: public-index-html
---
# Critique — public/index.html (landing page)

## Design Health Score: 29/40 (Good)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Sticky header + hover fine; little dynamic state |
| 2 | Match System / Real World | 4 | Speaks contractor fluently |
| 3 | User Control and Freedom | 3 | Anchor nav, smooth scroll, mobile menu OK |
| 4 | Consistency and Standards | 3 | Tight system, but eyebrow-per-section + repeated grids |
| 5 | Error Prevention | 2 | "Start Free" CTA breaks against the paywall |
| 6 | Recognition Rather Than Recall | 3 | Labeled nav, clear sections |
| 7 | Flexibility and Efficiency | 3 | One clear sign-in path |
| 8 | Aesthetic and Minimalist | 3 | 14 glass panels + kicker per section = over-scaffolded |
| 9 | Error Recovery | 3 | N/A static page |
| 10 | Help and Documentation | 2 | No FAQ / objection handling |

## Anti-Patterns Verdict
Partly AI-looking. Brand glass = identity, not slop. Tells: eyebrow on every section (6), three identical card grids in a row, em-dash overuse.
Detector: em-dash-overuse (7, real); numbered-section-markers (01/02/03 — partial FP, real sequence, keep); dark-glow (brand-intentional FP, keep). No browser overlay (headless env).

## Priority Issues
- [P1] Fabricated testimonials (3 named, 5-star) on pre-launch product. FTC + credibility risk in small WI market. Fix: replace with honest trust (founder note / capability strip) until real quotes exist.
- [P1] "Start Free"/"Start Free Trial"/"Launch Free Workspace" promise a trial that doesn't exist (hard paywall). Bait-and-switch. Fix: make it true OR recopy to "Watch the 60-Second Demo" / "$49/mo, cancel anytime".
- [P2] Tracked-caps eyebrow above every section (6). AI grammar. Fix: keep 1-2, vary cadence elsewhere.
- [P2] Three identical-card-grid sections (3 steps / 6 features / 3 testimonials). Fix: promote 1-2 hero features to asymmetric treatment.
- [P3] Em-dash overuse (7). Swap for commas/periods.

## Persona Red Flags
- Jordan (First-Timer): clicks "Start Free Trial" -> login -> paywall, never sees the real product (PDF mockup is gray placeholder).
- Riley (Stress Tester): clocks fake testimonials + the free/paywall contradiction. Trust gone.
- Casey (Mobile): layout OK; verify hero-meta 0.45 opacity 11px mono contrast on bright nebula.

## Minor Observations
- No :focus-visible on buttons (keyboard a11y).
- Low-opacity mono labels (0.45-0.55) — verify 4.5:1 over glass-on-nebula.
- Two-Voice drift: cool-blue used for non-money category tags (Dispatch/Workspace/Ledger).

## Questions
- What does a visitor see of the product before the paywall? Currently nothing real.
- Remove 5 of 6 eyebrows — what's lost but the AI smell?
- Could features show the one thing QuickBooks can't, big, vs six equal boxes?
