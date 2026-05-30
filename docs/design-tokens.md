# Lone Ranger Estimator — Design Tokens Reference

This document compiles all user interface design tokens, including color palettes, CSS variables, typography styles, spacing values, border configurations, and animation timings extracted from `public/index.html` and `public/dashboard.html`.

---

## 1. CSS Custom Properties (Color Variables)
The application is styled with a sleek, premium dark-mode aesthetic utilizing deep violet, lavender, and royal purple hues.

| CSS Variable | Hex Value | Color Description / Role |
| :--- | :--- | :--- |
| `--base-bg` | `#210936` | Rich, dark grape violet (page background) |
| `--card-bg` | `#2d0f47` | Deep amethyst purple (card backgrounds and panel containers) |
| `--header-bg` | `#1a0729` | Midnight black-purple (sticky navigation header background) |
| `--primary-accent` | `#521880` | Royal violet (borders, primary buttons, scrollbar thumbs) |
| `--accent-hover` | `#6d28d9` | Vivid indigo-purple (button hover states and glowing highlights) |
| `--text-primary` | `#e9d5ff` | Soft lavender-white (primary headings and readable body text) |
| `--text-muted` | `#9b59d0` | Medium violet-purple (captions, subheadings, labels, secondary info) |
| `--text-accent` | `#c084fc` | Electric lavender-violet (links, button text, highlight tags) |

---

## 2. Gradients & Backdrop Filters

### Background Gradients
* **Logo Box & Brand Badges (Landing & Login):**
  `linear-gradient(135deg, var(--accent-hover), var(--primary-accent))`
* **CSV Upload Progress Bar:**
  `linear-gradient(90deg, var(--primary-accent), var(--accent-hover))`
* **Change Order Badges & Action Buttons:**
  `linear-gradient(135deg, #7c3aed, #521880)` (Indigo to Royal Purple)
* **Change Order Result Panel & AI Generate Button:**
  `linear-gradient(135deg, #521880, #7c3aed)` (Royal Purple to Indigo)
* **Green Action Buttons (SMS Send & Approval):**
  `linear-gradient(135deg, #065f46, #059669)` (Dark Green to Emerald Green)
* **Glowing Decorative Orbs (Landing Page Background):**
  `radial-gradient(circle, rgba(109, 40, 217, 0.15) 0%, rgba(33, 9, 54, 0) 70%)`

### Backdrop Blur Settings
* **Unsaved Changes Interceptor (`dirtyConfirmModal`):**
  `bg-black/60` with `backdrop-blur-sm` (60% opaque black with 4px backdrop blur)
* **Settings Modal Overlay (`settingsModal`):**
  `rgba(26, 7, 41, 0.92)` with `backdrop-filter: blur(8px)`
* **Onboarding & Wizard Modals:**
  `rgba(26, 7, 41, 0.95)` with `backdrop-filter: blur(12px)`
* **Change Order Modal Overlay:**
  `rgba(26, 7, 41, 0.92)` with `backdrop-filter: blur(10px)`

---

## 3. Typography Styles

### Font Families
* **Heading Font (H1, H2, H3):** `'Outfit', sans-serif`
  * Linked Weights: `300` (Light), `400` (Regular), `500` (Medium), `600` (Semi-Bold), `700` (Bold), `800` (Extra-Bold), `900` (Black)
* **Interface & Body Font:** `'Inter', sans-serif`
  * Linked Weights: `300` (Light), `400` (Regular), `500` (Medium), `600` (Semi-Bold), `700` (Bold), `800` (Extra-Bold)
* **OTP Input Font:** `font-mono` (monospaced) for aligned verification code tracking.

### Specialized Text Styling
* **Hero Headline (Landing Page):**
  * Font-Size: `3.5rem` (responsive scale to `2.25rem` on mobile)
  * Font-Weight: `900`
  * Line-Height: `1.1`
  * Letter-Spacing: `-0.03em`
* **OTP Verification Code Input:**
  * Letter-Spacing: `tracking-[0.5em]` (adds wide spacing between numbers)
  * Font-Size: `text-lg`
* **Grand Total / Invoice Price Ticker:**
  * Font-Weight: `900` / `800`
  * Font-Size: `text-2xl`
  * CSS Rule: `font-variant-numeric: tabular-nums` (prevents character shifting during numbers counting up/down)
* **Decorative Status Labels / Badges:**
  * Font-Size: `0.75rem` (extra small)
  * Font-Weight: `700` (bold)
  * Text-Transform: `uppercase`
  * Letter-Spacing: `0.1em` (tracked out)

---

## 4. Spacing System & Grid Layouts

### Spacing Constants
* **Header Padding:** `1.25rem 2rem`
* **Hero Layout Margins:** `5rem 2rem 4rem` (top, side, bottom padding)
* **Card Element Padding:** `p-6` (`1.5rem`) for standard cards, `p-8` (`2rem`) for login and onboarding wizard layouts.
* **Footer Container Padding:** `2rem`
* **Form Field Padding:** `px-3 py-2` (horizontal/vertical) for standard forms, `px-4 py-3` for estimate scope textareas.

### Grid Layouts
* **Dashboard Two-Column Grid:**
  * CSS Rule: `display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;`
  * Responsive Override: `grid-template-columns: 1fr` (applied at <= 768px screens)
* **Modal Footer Flex Gap:** `gap-2.5`
* **Toast Container Stack Gap:** `gap-2`

---

## 5. Border Radii & Border Styles

### Border Radii (Corner Rounding)
* **Standard Card Containers:** `1.25rem` / `rounded-2xl`
* **Primary Call-To-Action (CTA) Buttons:** `1rem` / `rounded-xl`
* **Form Inputs & Textareas:** `rounded-xl` / `rounded-lg` (approximately `0.75rem` to `0.5rem`)
* **Navigation & Small Control Buttons:** `0.75rem` / `rounded-xl`
* **Interactive Table Cells (Inline Editable):** `4px`
* **Logo Box Branding:** `0.5rem` / `rounded-lg` (landing header) or `rounded-2xl` (login page)
* **Status Badges & Chips:** `2rem` / `rounded-full` (capsule style)
* **Control / Icon Buttons (e.g., Microphone, Close button):** `50%` (perfect circle)

### Border Weights & Colors
* **Primary Container Borders:** `1px solid var(--primary-accent)` (Royal Violet)
* **Standard Button Border:** `1px solid rgba(192, 132, 252, 0.3)`
* **Active Input / Field Focus Border:** `1.5px solid #7c3aed` (Vivid Purple) or `1px solid rgba(124, 58, 237, 0.4)`
* **Inline Table Cell Highlight:** `box-shadow: 0 0 0 2px rgba(192, 132, 252, 0.40)` (2px Lavender glow on focus)

---

## 6. CSS Transition & Animation Timings

### Micro-Transitions
* **Standard Hover States (Navigation & Secondary Buttons):**
  `transition: all 0.2s ease`
* **Landing Page CTA Hover Action:**
  `transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)`
* **Hero Play Button Hover Scaling:**
  `transition: all 0.3s ease`
* **Ledger Cells Inline Edit Focus:**
  `transition: background-color 0.15s, box-shadow 0.15s`
* **Price Source Badge (State change indicator):**
  `transition: background-color 0.3s ease`
* **CSV Upload Progress Bar Expansion:**
  `transition: width .15s linear`
* **Approve & Lock Invoice Button Transitions:**
  `transition: background .3s, opacity .2s, transform .15s`
* **Grand Total Color Ticker Shift:**
  `transition: color .2s`

### Keyframe Animations
* **`fadeIn` (Dashboard Panels & Cards Appear):**
  * Duration: `0.35s`
  * Bezier Curve: `ease-out`
  * Behavior: `from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); }`
* **`rowSlideIn` (Newly Appended Ledger Rows):**
  * Behavior: `from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); }`
* **`toastSlideIn` (Toast Notifications Arrival):**
  * Duration: `0.3s`
  * Bezier Curve: `cubic-bezier(.21, 1.02, .73, 1)`
  * Behavior: `from { opacity: 0; transform: translateX(60px) scale(.95); } to { opacity: 1; transform: translateX(0) scale(1); }`
* **`toastFadeOut` (Toast Notifications Exit):**
  * Duration: `0.3s`
  * Bezier Curve: `ease-in`
  * Behavior: `from { opacity: 1; transform: translateX(0) scale(1); } to { opacity: 0; transform: translateX(60px) scale(.95); }`
* **`micHalo` (Microphone Recording Active Pulsing Effect):**
  * Duration: `1.5s`
  * Bezier Curve: `ease-in-out`
  * Interiteration Delay: `infinite`
  * Behavior:
    * `0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,.70), 0 0 0 0 rgba(239,68,68,.35); }`
    * `50% { box-shadow: 0 0 0 14px rgba(239,68,68,.12), 0 0 0 28px rgba(239,68,68,0); }`

---

## 7. Custom Scrollbars
A custom scrollbar is defined for the dashboard interface to blend in with the dark violet theme:
* **Width:** `6px`
* **Track Background:** `transparent`
* **Thumb Background:** `var(--primary-accent)` (Royal Violet)
* **Thumb Border Radius:** `3px`

---

## 8. Theme Alert & Status Color Palettes
These colors represent specific semantic messaging styles applied to status elements.

### Success States (Approved Status, Success Toasts)
* **Text Color:** `#86efac` (Light Green) or `#065f46` (Dark Green on Client Page)
* **Background Color:** `#14532d` (Forest Green) or `#d1fae5` (Mint Green on Client Page)
* **Border Color:** `#22c55e` (Emerald Green) or `#10b981` (Client Page Border)

### Error / Alert States (Discard Changes, Error Toasts)
* **Text Color:** `#fca5a5` (Soft Red)
* **Background Color:** `#450a0a` (Deep Crimson)
* **Border Color:** `#ef4444` (Vivid Red)

### Info States (Processing updates, Info Toasts)
* **Text Color:** `#c4b5fd` (Soft Lavender)
* **Background Color:** `#2e1065` (Indigo-Violet)
* **Border Color:** `#7c3aed` (Bright Purple)
