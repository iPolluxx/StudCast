---
name: StudCast (Lone Ranger Estimator)
description: A solo contractor's command bridge — speak a job, watch it become a priced, sendable estimate.
colors:
  void-black: "#050810"
  deep-navy: "#0a0f1e"
  cool-blue: "#6eb5ff"
  soft-violet: "#a78bfa"
  starlight: "#e2e8f0"
  live-emerald: "#34d399"
  alert-rose: "#fb7185"
typography:
  display:
    fontFamily: "Outfit, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.125rem, 3vw, 1.5rem)"
    fontWeight: 900
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, Outfit, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.6875rem"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "0.15em"
  data:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  "2xl": "16px"
  full: "9999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.cool-blue}"
    textColor: "{colors.void-black}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.soft-violet}"
    textColor: "{colors.void-black}"
  button-secondary:
    backgroundColor: "{colors.deep-navy}"
    textColor: "{colors.starlight}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "12px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.cool-blue}"
    textColor: "{colors.void-black}"
  input-frosted:
    backgroundColor: "{colors.void-black}"
    textColor: "{colors.starlight}"
    typography: "{typography.data}"
    rounded: "{rounded.full}"
    padding: "6px 16px"
  badge-ai:
    backgroundColor: "{colors.soft-violet}"
    textColor: "{colors.soft-violet}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  badge-override:
    backgroundColor: "{colors.cool-blue}"
    textColor: "{colors.cool-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  badge-database:
    backgroundColor: "{colors.live-emerald}"
    textColor: "{colors.live-emerald}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  panel-glass:
    backgroundColor: "{colors.deep-navy}"
    textColor: "{colors.starlight}"
    rounded: "{rounded.2xl}"
    padding: "20px"
---

# Design System: StudCast (Lone Ranger Estimator)

## 1. Overview

**Creative North Star: "The Command Bridge"**

StudCast is the control deck of a one-person operation. The screen is a void-black hull; the work floats on glass instrument panels lit from within by cool-blue and violet readouts. A solo contractor sits at the helm of something that looks and feels far bigger than one person, which is the entire emotional job: a Lone Ranger should look established to their client and to themselves. The voice orb is the console you talk to; the ledger is the manifest; the 3D material yard is the viewport. Everything the contractor needs to turn a spoken job into a sent PDF is within arm's reach and glowing softly in the dark.

The system is confident and energetic, not quiet. Gradients run blue into violet, controls scale and brighten on contact, and the orb literally barrel-rolls across the bridge when it moves into theater mode. Density is high and instrument-like: information is packed into compact glass panels with tiny tracked monospace labels, the way a cockpit packs readouts. But spectacle never sits on top of the work. The motion and 3D orbit the ledger; the number the contractor is putting their name on stays still, legible, and trustworthy at the center.

This system explicitly rejects two things. It is **not clunky legacy contractor software** (the dense gray QuickBooks/Buildertrend-era estimating tool full of nested menus and spreadsheet sprawl built for a back office); StudCast must never feel like data entry. And it is **not a generic SaaS dashboard** (the interchangeable indigo-on-white, repeated-card-grid, hero-metric Linear/Stripe clone). The cosmic-glass identity exists precisely so this product is never mistaken for another seat-based B2B tool.

**Key Characteristics:**
- Void-black space hull as the canvas; a real Milky Way photo, never a flat dark gray.
- Glass instrument panels with backdrop blur, glowing rather than shadowed.
- A two-voice accent system: cool-blue is trust (money, primary actions), soft-violet is intelligence (AI moments); together they form the brand gradient.
- Monospace, tracked, uppercase micro-labels as the dominant typographic voice.
- Expressive, confident motion (orb pulse, barrel-roll, listening rings) that orbits the work without blocking it.
- The trusted number is always cool-blue, always still, always readable.

## 2. Colors

A luminous palette built on a two-voice accent system: a near-black space ground, cool-blue for trust and violet for intelligence, and a tiny set of semantic signals for life, edits, and danger.

### Primary
- **Cool Blue** (`#6eb5ff`): The voice of trust. Carries totals, prices, primary calls to action, focus glows, and active states. When a contractor reads the number they're staking their name on, it is this blue. The most-used accent on any screen.
- **Soft Violet** (`#a78bfa`): The voice of intelligence. Marks every AI-driven moment: section eyebrows, the change-order engine, the "ai" price-source badge, the sparkle flourishes, the AR launch. When the machine is thinking or proposing, it speaks in violet. The two accents pair into the brand gradient (buttons, orb, subscribe CTA), but their meanings stay distinct: blue is what you can trust, violet is what the machine did.

### Neutral
- **Void Black** (`#050810`): The body background and the hull. Also the text color that sits *on top of* the bright cool-blue→violet gradient buttons (dark-on-bright, never white-on-bright).
- **Deep Navy** (`#0a0f1e`): The glass-panel base (used at ~65% opacity with blur) and the top rail. The translucent surface that floats over the starfield.
- **Starlight** (`#e2e8f0`): Default body and UI text. Used at full strength for primary text, and at reduced opacity (`/70`, `/45`, `/30`) for secondary labels, hints, and placeholders.

### Tertiary (semantic signals)
- **Live Emerald** (`#34d399`): Status of life and "from the source." The pulsing LIVE ESTIMATE dot and the "database" price-source badge (a price that came from the contractor's own price book).
- **Alert Rose** (`#fb7185`): Destructive and error only. Delete hovers, exclusions, failed-upload flashes. Never decorative.

### Named Rules
**The Two-Voice Rule.** Cool-blue means *trust* (money, totals, prices, primary actions, focus); soft-violet means *intelligence* (anything the AI did or proposes: extraction, change orders, the `ai` price source, sparkle flourishes). They combine into the brand gradient, but their meanings never blur. A violet total or a blue "ai" badge is wrong; the color is telling the contractor where the value came from.

**The Dark-On-Bright Rule.** Text on any cool-blue/violet gradient surface is `void-black` (`#050810`), never white. The gradient is the light source; the label is the silhouette on it. White-on-gradient is forbidden; it muddies the brand color and drops contrast.

**The One Blue Number Rule.** The figure the contractor trusts (grand total, line amounts, prices) is always `cool-blue` and never wrapped in motion. Money does not animate, does not gradient-fill, does not glow-pulse. Its stillness is what makes it trustworthy.

**The No Flat Black Rule.** The background is the starfield photo over `void-black`, never a flat `#050810` fill on a content screen. Depth comes from the nebula, the aurora pools, and the vignette. A flat dark-gray panel grid is the legacy-software tell and is prohibited.

## 3. Typography

**Display Font:** Outfit (with Inter, system-ui fallback)
**Body Font:** Inter (with system-ui fallback)
**Label / Data Font:** JetBrains Mono (with ui-monospace fallback)

**Character:** A geometric-humanist sans (Inter/Outfit) for the human-readable layer, paired against a mechanical monospace (JetBrains Mono) for everything instrument-like. The contrast axis is human vs. machine: prose and titles in the sans, every label, status, badge, and dollar figure in the mono. The mono is the dominant voice and the thing that makes the UI read as a console rather than a form.

### Hierarchy
- **Display** (900, `clamp(1.125rem–1.5rem)`, line-height 1.05): The marquee total / valuation number and modal titles. This is a dense product UI, so "display" tops out around 1.5rem; there is no hero type. Letter-spacing slightly negative (-0.02em).
- **Headline** (900, `1.125rem`, tracking -0.01em): Modal headings ("Unlock Lone Ranger", "Project Amendment Order"). Sans, tight.
- **Body** (400, `0.6875rem`, line-height 1.5): Descriptive paragraphs and panel help text, in Inter. Frequently at reduced starlight opacity; hints are italic. Keep prose to 65–75ch even though panels are narrow.
- **Label** (800–900, `0.6875rem` / 11px, tracking 0.15em, UPPERCASE): JetBrains Mono. The signature element: section eyebrows, status pills, badges, instrument titles, button text. Reserved for ≤4-word labels. (`text-micro` token.)
- **Data** (700, `0.8125rem` / 13px): JetBrains Mono for all numeric content: dollar figures, quantities, rates, table cells. Right-aligned for currency. (`text-mini` token.)

### Type scale (fixed rem, ~1.18 ratio, 11px floor)
A committed scale, not ad-hoc sizes. Dense "instrument" tier lives below Tailwind's `text-sm`; all sizes are `rem` so they respect user zoom. **The 11px floor is a hard minimum — never go below `text-micro`.**
- **`text-micro`** 0.6875rem / 11px — labels, eyebrows, badges, table headers, metadata.
- **`text-mini`** 0.8125rem / 13px — data cells, secondary body.
- **`text-base`** 1rem / 16px — line-item titles, per-row totals.
- **`text-xl`** 1.25rem / 20px — the grand total.

### Named Rules
**The Mono Label Rule.** Every label, status, badge, and number is JetBrains Mono, uppercase, tracked `0.1em–0.15em`. Sans-serif is for sentences a human reads; mono is for everything the bridge reports. Mixing them up flattens the whole instrument metaphor.

**The Tracked-Caps Are Labels, Not Eyebrows Rule.** Uppercase tracked mono is a pervasive, deliberate brand system here (it is the console voice), so the usual "no eyebrow on every section" ban is satisfied by intent, not by suppression. But caps are still capped at ~4 words. Never set a sentence or a paragraph in tracked caps.

## 4. Elevation

Depth is light, not shadow. This system is **glow-as-depth**: surfaces lift by glowing, by backdrop-blurring the starfield behind them, and by stacking translucent navy layers, never by casting a hard drop shadow. The starfield ground has three painted depth cues baked in (a violet aurora pool upper-left, a blue aurora pool lower-right, and an edge vignette pulling the corners to void-black). Glass panels sit above that on a blur. Accent elements (the orb, primary buttons, focus states) emit a soft colored halo in their own hue. Where a `box-shadow` exists it is large, soft, and tinted toward cool-blue, read as ambient glow, not as a cast shadow.

### Shadow Vocabulary
- **Glass hover glow** (`box-shadow: 0 8px 32px 0 rgba(110,181,255,0.08), 0 0 1px 1px rgba(110,181,255,0.15) inset`): The lift a glass panel gets on hover, a faint blue bloom plus an inner rim light.
- **Panel ambient** (`box-shadow: 0 8px 32px -4px rgba(110,181,255,0.08), 0 4px 16px -4px rgba(167,139,250,0.06)`): The resting glow under floating instrument panels (the `glass-panel-glow` class). Dual-hue, blue over violet.
- **Focus glow** (`box-shadow: 0 0 14px rgba(110,181,255,0.3)`): The cool-blue halo a frosted input emits when focused, replacing a hard focus ring.
- **Orb halo** (`shadow-xl shadow-cool-blue/10`): The diffuse blue aura under the resting voice orb; intensifies to layered expanding rings while listening.

### Named Rules
**The No Hard Shadow Rule.** Drop shadows that read as a panel "lifting off a page" are forbidden; that is the 2014-app / legacy-tool tell. If a surface needs to feel raised, it glows or it blurs the background. Audit test: if the shadow is dark, tight, and gray, it's wrong; the right one is large, soft, and blue.

## 5. Components

### Buttons
- **Shape:** Fully pill-shaped (`rounded-full`, 9999px) for actions; instrument toggles use `rounded-xl` (12px). No square buttons.
- **Primary (gradient CTA):** Linear gradient `cool-blue → soft-violet`, `void-black` text, uppercase mono label, tracked. Used for the headline actions: Subscribe, Dispatch Authorization, the mobile tools FAB. Confident and energetic by design.
- **Secondary (Publish & Send):** Dark navy gradient (`#20346a → #2e1d52`) with a `cool-blue/30` border and starlight text at rest; on hover it *fills* with the cool-blue→violet gradient and flips text to `void-black`. The signature "charge up on hover" move.
- **Hover / Focus:** Buttons brighten and many `scale-105`. Transitions ~200–300ms. Disabled drops to ~40–50% opacity. A spinning `RefreshCw` replaces the icon during async work.
- **Ghost / icon:** Circular, `bg-white/5`, `border-white/10`, cool-blue icon; hover raises background opacity. Used for the settings gear, viz-size controls, AR pills.

### Chips / Badges
- **Price-source badges:** Tiny uppercase mono pills (`rounded`, 4px) using the tint-on-tint pattern: background is the hue at ~20% opacity, text is the same hue at full. `ai` → soft-violet, `override` → cool-blue, `database` → live-emerald. This three-way color code is how the contractor sees at a glance where every price came from (trust through legibility).
- **Status pill:** LIVE ESTIMATE — emerald pulsing dot + emerald tracked-caps mono label.
- **Status flash:** A cool-blue/15 pill with sparkle icon that bounces in on a successful action ("3 ITEMS IN ESTIMATE", "PDF SENT TO…").

### Cards / Containers (Glass Panels)
- **Corner Style:** `rounded-2xl` (16px) for panels and modals; `rounded-xl` (12px) for inner cards and instrument rows.
- **Background:** `rgba(10,15,30,0.65)` deep-navy at 65% over `backdrop-filter: blur(16px)`. The `.glass-panel` class.
- **Border:** `1px solid rgba(255,255,255,0.12)`; brightens to `rgba(110,181,255,0.25)` on hover.
- **Shadow Strategy:** Glow only; see Elevation. Resting panels use the dual-hue ambient glow; hover adds the blue bloom + inner rim.
- **Internal Padding:** 20px (`p-5`) for panels, 12px (`p-3`) for inner cards.
- **Never nest cards.** Inner rows use `bg-void-black/40` flat tinted strips, not nested glass.

### Inputs / Fields
- **Style:** Frosted pill. `bg-white/3`, `border-white/8`, starlight text, `rounded-full` for the conversational inputs (the orb's "describe your job" field). Textareas and editable cells use `rounded-xl` over `bg-void-black/60`.
- **Focus:** No hard ring. Background lifts to `white/6`, border shifts to `cool-blue`, and a `0 0 14px rgba(110,181,255,0.3)` glow blooms. Inline ledger cells use a `border-b` underline that lights cool-blue on focus.
- **Placeholder:** Starlight at 30–40% opacity.

### Navigation
- **Top rail:** Fixed 48px, `deep-navy/80` + blur, `border-white/8`. Left: project-switcher dropdown trigger (mono tracked-caps name + ▼). Center: LIVE ESTIMATE pill. Right: circular settings gear.
- **Instrument sidebar (desktop):** A floating vertical glass dock on the left holding icon toggles (pricing, change orders, layers). Active toggle fills with the cool-blue→violet gradient + void-black icon + a cool-blue tab nub; inactive is `void-black/40` with a hover lift. Micro tooltips fly out in tracked-caps mono.
- **Mobile:** Sidebar collapses to a single gradient FAB (wrench) bottom-left; instrument panels become bottom-sheet modals over a blurred backdrop.

### Voice Orb (signature component)
- The console you talk to. A 56px (`h-14 w-14`) circular button, gradient `#121829 → #3a2254` with a `#614582` border and a cool-blue mic icon at rest; pulses with a layered glow (`animate-orb-glow`). While listening it flips to a rose→violet gradient and emits expanding concentric rings (`ring-expand` 1/2/3) plus a jumping waveform bar row. While processing it shows a spinning loader. Entering theater mode on desktop it performs a two-rotation barrel-roll across the bridge and "lands" on the left rail with an overshoot bounce. This is the most expressive object in the system and the clearest expression of the energetic register.

### Material Yard (signature component)
- A Three.js 3D viewport with three states: a draggable mini PIP (150–240px rounded-2xl glass tile), a theater banner (40–45vh, top-docked, with a gradient bleed into the content below), and fullscreen. Size controls are circular ghost buttons; an AR pill (violet gradient) launches WebXR. The "viewport" of the bridge metaphor.

## 6. Do's and Don'ts

### Do:
- **Do** split the accents by meaning: `cool-blue` for trust (money, prices, primary actions), `soft-violet` for intelligence (AI moments). They share the gradient, not their meanings (The Two-Voice Rule).
- **Do** keep the trusted number `cool-blue` (`#6eb5ff`) and motionless. Money is still; stillness is trust (The One Blue Number Rule).
- **Do** put `void-black` text on every cool-blue/violet gradient surface, never white (The Dark-On-Bright Rule).
- **Do** set every label, status, badge, and dollar figure in uppercase tracked JetBrains Mono; reserve Inter for sentences (The Mono Label Rule).
- **Do** convey depth with glows, backdrop-blur, and the aurora/vignette starfield, never hard drop shadows (The No Hard Shadow Rule).
- **Do** use the three-color price-source code (violet `ai` / blue `override` / emerald `database`) so the contractor always sees where a price came from.
- **Do** let the orb and 3D be expressive and energetic, but keep them orbiting the ledger, never on top of the number.
- **Do** honor `prefers-reduced-motion`: the barrel-roll, orb pulse, listening rings, and bounce flashes all need a crossfade-or-instant fallback.

### Don't:
- **Don't** let it feel like **clunky legacy contractor software**: no dense gray spreadsheet sprawl, no nested menus, no "data entry" screens. If a panel looks like a 2012 estimating tool, it's wrong.
- **Don't** let it become a **generic SaaS dashboard**: no indigo-on-white, no repeated identical card grids, no hero-metric template, no Linear/Stripe-clone look. The cosmic-glass identity is the whole point.
- **Don't** use a flat `#050810` fill as a full-screen content background; the starfield and aurora carry the depth (The No Flat Black Rule).
- **Don't** nest glass panels inside glass panels; inner rows are flat `void-black/40` tinted strips.
- **Don't** cast hard, dark, tight drop shadows; if it's not large, soft, and tinted blue, it doesn't belong.
- **Don't** set sentences or paragraphs in tracked uppercase; caps are for ≤4-word labels only.
- **Don't** use `alert-rose` decoratively; it means destructive or error, nothing else.
