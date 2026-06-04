# Product

## Register

product

## Users

Independent, owner-operator construction contractors ("Lone Rangers"): one person who quotes, buys materials, swings the hammer, and invoices. Often estimating from a truck cab, a job site, or a kitchen table at the end of a long day, frequently on a phone, sometimes with dirty hands and no patience for forms. They are not back-office staff; their time is billable and the estimate is the thing standing between a conversation and a paid job. The job to be done: turn a spoken or typed description of a job into a credible, priced, client-ready estimate fast enough to send it before the lead goes cold.

## Product Purpose

StudCast (Lone Ranger Estimator) turns a contractor's voice into a finished estimate. The core loop: speak or type the job → Gemini extracts materials and labor → a 3-tier pricing waterfall (explicit price → per-tenant price book → AI fallback) prices it → the contractor reviews and edits an inline ledger → a rendered PDF estimate is emailed to the client. It is multi-tenant SaaS, one tenant per phone number, billed via Stripe. Success is a solo contractor producing an accurate, professional estimate in the time it used to take to find a pen, and trusting the number enough to put their name on it.

## Brand Personality

Confident, capable, on-your-side. Three words: **assured, precise, expansive.** The voice talks to a tradesperson as a peer, not a project manager: direct, plain, no jargon, no hand-holding. The "cosmic glass" aesthetic is deliberate identity, not decoration: the dark starfield and glass panels make a one-person operation feel like it has a command center behind it. The product should feel like a force multiplier that respects the user's craft and their time. Emotional goal: a solo contractor feels bigger than they are, trusted by their clients, and in control of the number.

## Anti-references

- **Clunky legacy contractor software** (QuickBooks/Buildertrend-era estimating tools): dense gray forms, nested menus, spreadsheet sprawl, enterprise complexity built for back offices, not for a person in a truck. StudCast must never feel like data entry.
- **Generic SaaS dashboard**: the interchangeable indigo-on-white, repeated-card-grid, hero-metric Linear/Stripe-clone look. The cosmic-glass identity exists precisely so this product is not mistaken for another seat-based B2B tool.

## Design Principles

1. **The estimate is the product.** Every screen serves the path from spoken job to sent PDF. Anything that doesn't move the contractor toward a credible, sendable number is noise.
2. **Make one person feel like a crew.** The interface should project capability and command, so a solo operator looks and feels established to their client and to themselves.
3. **Earn trust with the number.** Pricing, edits, and totals must read as legible and verifiable. The contractor is putting their name and money on this; the UI must never feel like a black box or a toy.
4. **Voice-first, hands-busy.** Designed for someone speaking, on a phone, possibly distracted or in the field. Low friction, large targets, forgiving input, fast feedback.
5. **Expressive identity, never at the cost of the work.** The cosmic-glass motion and 3D are real brand, but they sit around the ledger, not on top of it. Spectacle never blocks the task.

## Accessibility & Inclusion

Not a current priority; revisit later. Baseline only for now: keep existing reduced-motion support in mind given the expressive orb/barrel-roll/3D motion (provide non-motion fallbacks where cheap), and don't let the dark glassmorphism regress legibility of the ledger and totals (the numbers the contractor trusts must stay high-contrast). Formal WCAG targeting deferred.
