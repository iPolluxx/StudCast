# Lone Ranger Estimator — Design Tokens Reference

> **Scope:** This documents the **current React app (`ui/`)** "Command Bridge" cosmic-glass design system —
> the live product surface. Tokens are defined in **`ui/src/index.css`** (`@theme`, Tailwind v4). The full
> visual spec (philosophy, named rules, component behavior) lives in **`DESIGN.md`** at the repo root, with a
> machine-readable sidecar at `.impeccable/design.json`.
>
> **Deprecated:** the purple/violet theme (`--base-bg: #210936`, `--primary-accent: #521880`, …) that this file
> previously documented belongs to the legacy `public/index.html` + `public/dashboard.html` pages. Those pages
> are still served (landing + `/dashboard-legacy` onboarding) but are **not** the product's design language.

---

## 1. Color tokens (`ui/src/index.css` `@theme`)

A dark, luminous palette: a near-black space ground, a cool-blue → soft-violet brand gradient, and a small set of semantic signals.

| Token (Tailwind utility) | Hex | Role |
| :--- | :--- | :--- |
| `void-black` | `#050810` | Body background / hull; also text **on** bright gradient surfaces (dark-on-bright) |
| `deep-navy` | `#0a0f1e` | Glass-panel base (used ~65% opacity + blur), top rail |
| `cool-blue` | `#6eb5ff` | **Trust:** money, totals, prices, primary actions, focus glow |
| `soft-violet` | `#a78bfa` | **Intelligence:** AI moments only (extraction, change orders, `ai` price badge) |
| `starlight` | `#e2e8f0` | Default text; reduced opacity (`/70`, `/60`) for secondary/muted |
| `live-emerald` | `#34d399` | Status / "from the source": LIVE badge, `database` (saved price-book) badge, `market` (Menards live) badge |
| `alert-rose` | `#fb7185` | Destructive / error **only** (delete, publish error, exclusions) |
| `stale-amber` | `#fbbf24` | Price-drift / staleness warning (Price Sheet diff ≥ 10% from Menards) |
| `navy-deep` / `navy-violet` | `#20346a` / `#2e1d52` | Secondary-CTA ("Publish & Send PDF") resting gradient |

**Named color rules** (enforced in `DESIGN.md`): **Two-Voice** (blue=trust, violet=AI, never blurred), **One Blue Number** (totals are cool-blue and never animated), **Dark-On-Bright** (`void-black` text on gradients, never white).

---

## 2. Typography

**Fonts** (Google Fonts import in `index.css`): **Inter** (`--font-sans`, body), **Outfit** (display alt), **JetBrains Mono** (`--font-mono`, all labels/data).

**Type scale** — fixed `rem`, ~1.18 ratio, **11px floor**, named tokens (no ad-hoc `text-[Npx]`):

| Token | Size | Role |
| :--- | :--- | :--- |
| `text-micro` | `0.6875rem` (11px), lh 1.3 | Labels, eyebrows, badges, table headers, metadata |
| `text-mini` | `0.8125rem` (13px), lh 1.45 | Data cells, secondary body |
| `text-base` | `1rem` (16px) | Line-item titles, per-row totals |
| `text-lg` / `text-xl` | 18 / 20px | Subheads / grand total |

> Migrated in `LedgerTable.tsx` + `App.tsx`. `SettingsModal.tsx`, `EstimateList.tsx`, `ThreeVisualizer.tsx` still carry raw `text-[Npx]` — pending migration.

The signature voice is uppercase, tracked (`0.15em`) JetBrains Mono for any label ≤4 words.

---

## 3. Surfaces, glass & elevation

Depth is **glow, not shadow** — colored glows + `backdrop-filter` blur over the starfield, no hard drop shadows.

* **`.glass-panel`** — `background: rgba(10,15,30,0.65)`, `backdrop-filter: blur(16px)`, `1px solid rgba(255,255,255,0.12)`; hover brightens border to `rgba(110,181,255,0.25)`.
* **`.glass-panel-glow`** (resting ambient) — `box-shadow: 0 8px 32px -4px rgba(110,181,255,0.08), 0 4px 16px -4px rgba(167,139,250,0.06)`.
* **`.frosted-input`** — pill (`border-radius: 9999px`), `rgba(255,255,255,0.03)` bg; focus → `box-shadow: 0 0 14px rgba(110,181,255,0.3)` cool-blue glow.
* **Ledger keyboard focus** — `#estimate-ledger-section :is(input,textarea):focus-visible` → `box-shadow: 0 0 0 2px rgba(110,181,255,0.5)` (WCAG 2.4.7).
* **Background** — real Milky Way photo (`ui/src/assets/starfield.jpg`) with mouse-parallax + violet/blue aurora-pool gradients + edge vignette (`App.tsx` `Starfield`).

---

## 4. Border radii

| Use | Radius |
| :--- | :--- |
| Pills / badges / orb / icon buttons | `rounded-full` (9999px) |
| Panels, modals | `rounded-2xl` (16px) |
| Cards, inputs, instrument rows | `rounded-xl` (12px) |
| Inline editable cell underline | `border-b` (1px) |

---

## 5. Motion (keyframes in `index.css`)

| Animation | Purpose |
| :--- | :--- |
| `orb-pulse` (2s ∞) | Resting voice-orb breathing glow |
| `ring-expand` 1/2/3 | Listening orb's expanding concentric rings (staggered) |
| `wave-jump` | Listening waveform bars |
| `barrel-roll-left` (1.9s) | Orb's two-rotation flight into theater mode |
| `orb-land` (0.65s, overshoot) | Orb "here I am" landing on the left rail |
| `fade-in` / `slide-in` / `fade-in-from-right` | Panel/row entrances |

Easings used: `cubic-bezier(0.4,0,0.2,1)` (standard), `cubic-bezier(0.16,1,0.3,1)` (ease-out-expo reveals), `cubic-bezier(0.34,1.56,0.64,1)` (orb-land overshoot). No bounce/elastic on UI controls.

---

## 6. Custom scrollbars

`6px` wide; track `rgba(0,0,0,0.15)`; thumb `rgba(255,255,255,0.1)` → `rgba(110,181,255,0.3)` on hover; `border-radius: 4px`.

---

## 7. Semantic status colors

| State | Token / value |
| :--- | :--- |
| Success / live / from-source | `live-emerald` `#34d399` (tint-on-tint: `bg-live-emerald/20 text-live-emerald`) |
| Error / destructive | `alert-rose` `#fb7185` (`border-alert-rose/40 bg-alert-rose/10`) |
| AI-generated | `soft-violet` `#a78bfa` (`bg-soft-violet/20 text-soft-violet`) |
| Override / trusted value | `cool-blue` `#6eb5ff` (`bg-cool-blue/20 text-cool-blue`) |
| Stale / drift warning | `stale-amber` `#fbbf24` — the price-drift flag in PriceSheetPanel (diff ≥ 10% from Menards). Now a named `@theme` token (`--color-stale-amber`) alongside `live-emerald`/`alert-rose` |

**Price-source badge pattern** (LedgerTable + PriceSheetPanel):

| Source | Badge label | Color |
| :--- | :--- | :--- |
| Manual override | **Yours** | `cool-blue` |
| Saved price book | **Saved** | `live-emerald` |
| Menards market | **Menards · Xh** (age in hours) | `live-emerald` |
| AI fallback | **Est.** | `soft-violet` |
