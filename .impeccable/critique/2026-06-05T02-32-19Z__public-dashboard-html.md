---
target: legacy auth gateway (public/dashboard.html)
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-06-05T02-32-19Z
slug: public-dashboard-html
---
# Critique — public/dashboard.html (legacy auth gateway)

Scope: reachable auth flow (login gate -> onboarding modal -> OTP modal -> subscription gate). Post-auth dashboard interior is dead (redirects to React app); interior-only findings flagged, not scored.

## Design Health Score: 24/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Button busy-states good; OTP no resend feedback |
| 2 | Match System / Real World | 3 | Clear titles; paywall claims nonexistent free trial |
| 3 | User Control and Freedom | 1 | OTP modal is a trap: no resend/back/close |
| 4 | Consistency and Standards | 2 | Phone/company/consent collected twice; focus differs |
| 5 | Error Prevention | 3 | OTP maxlength good; phone unvalidated free text |
| 6 | Recognition Rather Than Recall | 3 | Labeled; user must self-classify new/returning |
| 7 | Flexibility and Efficiency | 2 | Returning=1 click; new re-enters 3 fields; no autocomplete |
| 8 | Aesthetic and Minimalist | 3 | On-brand glass; login card dense |
| 9 | Error Recovery | 2 | Login errors shown; OTP unrecoverable if code missing |
| 10 | Help and Documentation | 2 | Privacy/Terms linked; no "didn't get a code?" help |

## Anti-Patterns Verdict
Product slop test: mostly trust, two pauses (OTP trap, false-trial paywall). No browser overlay (headless).
Detector (8 hits triaged): side-tab border-left x2 (interior only); broken-image empty src logo (interior, real bug); overused-font Inter x2 (non-issue, brand+permitted); layout-transition width (interior); em-dash x6 (minor, some in auth copy); dark-glow (brand-intentional, keep).

## Priority Issues
- [P1] Paywall (line 923) "Your free trial has ended" — brand-new just-verified user never had a trial. Bait-and-switch at payment. Fix: "Subscribe to Start Estimating / $49/mo, no contract, cancel anytime." Drop "free trial".
- [P1] OTP modal (886-907) is a dead end: no resend, no back, no close. SMS currently on email-fallback so missing/slow codes are likely. Fix: Resend (cooldown) + "Use a different number" back link + Esc close.
- [P2] All auth inputs use focus:outline-none with no replacement ring (229/233/861/865/898). Keyboard+SR users have no focus indicator; inconsistent (change-order uses ring-2). Fix: focus-visible cool-blue ring.
- [P2] SMS consent text 10px muted, duplicated (239 & 871). Below 11px floor; it's the compliance text reviewers/users read. Fix: 11px, more contrast, single source.
- [P2] New users enter Company/Phone/Consent twice (login card + onboarding modal). Reads as broken. Fix: collect once; modal only fills gaps.

## Persona Red Flags
- Jordan (First-Timer): unsure whether to fill fields or click Google; re-asked in modal; OTP trap if code slow.
- Sam (Keyboard/SR): no focus ring (outline-none); loginError not aria-live; OTP trap.
- Casey (Mobile): tel input no inputmode/autocomplete; 10px consent unreadable; OTP trap worse on mobile app-switch.

## Minor Observations
- "Multi-Project Voice Ledger" subtitle is internal jargon.
- No autocomplete (tel/organization/one-time-code for iOS SMS autofill).
- Em-dashes in "Subscribe Now — $49/month" + email OTP subtitle.
- Interior cleanup: empty-src logo img, 2x side-tab rows, transition:width all in dead half; deleting ~2000 dead lines removes most detector hits.

## Questions
- Keep ~2000 lines of dead dashboard interior at all? Deleting removes most findings free.
- Intended recovery when OTP never arrives? Currently none.
- Should post-verify be a hard paywall, or show one real estimate first (demo access)?
