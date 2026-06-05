---
target: legal doc pages (privacy.html + terms.html)
total_score: 33
p0_count: 0
p1_count: 0
timestamp: 2026-06-05T02-47-45Z
slug: public-privacy-html
---
# Critique — privacy.html + terms.html (legal doc pages)

## Design Health Score: 33/40 (Good)
Design is solid; gaps are in legal CONTENT, not layout. Detector: clean on both (zero antipatterns). Compliance box correctly full-bordered (no side-stripe). Visually verified legible over starfield.

| # | Heuristic | Score |
|---|-----------|-------|
| 1 Visibility | 3 | 2 Match real world | 3 | 3 Control/Freedom | 4 | 4 Consistency | 4 | 5 Error Prevention | 3 |
| 6 Recognition | 4 | 7 Flexibility | 3 | 8 Aesthetic | 4 | 9 Error Recovery | 3 | 10 Help/Docs | 2 |

## Priority Issues
- [P2] Legal content thin for a product taking payments (Stripe) + SMS (Twilio) + PII. Missing: governing law, data retention/deletion, user rights, subscription/cancellation/refund terms, third-party processor disclosure (Stripe/Twilio/Google/Gemini). "Limitation of Liability" = 1 sentence. Legal-content task, not design.
- [P2] Privacy contact unreachable: "contact us via your platform management portal" (privacy section 4). Circular; needs a real support email + LLC address.
- [P3] meta-date contrast: rgba(226,232,240,0.5) @ 0.75rem ~3.7:1, under 4.5:1. Bump to ~0.62.

## What's Working
- Readability over the hull (800px column, 1.75 line-height, blurred 65% card).
- SMS compliance callout: full emerald-bordered glass panel, mono tag, where Twilio reviewers look.
- Site-consistent shell (header/footer/tokens/back-nav).

## Persona Red Flags
- Riley: 1-sentence liability + no governing law/refund/deletion -> reads as placeholder on a paid product.
- Jordan: compliance box reassures, but "contact via portal" dead-ends.
- Sam: body/headings pass contrast; meta-date fails; links keyboard-focusable (default outline kept).

## Minor
- No text-wrap balance/pretty. Hand-wavy security language. No explicit focus-visible (default covers it).

## Questions
- Placeholder or real legal docs? If real, add missing clauses before taking money.
- Name Stripe/Twilio/Google/Gemini as sub-processors for compliance?
