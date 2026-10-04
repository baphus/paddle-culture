---
name: CK Grounds
colors:
  surface: '#fff8f6'
  surface-dim: '#f0d4cf'
  surface-bright: '#070302ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff0ee'
  surface-container: '#ffe9e5'
  surface-container-high: '#ffe2dd'
  surface-container-highest: '#f9dcd7'
  on-surface: '#271815'
  on-surface-variant: '#584239'
  inverse-surface: '#3e2c29'
  inverse-on-surface: '#ffedea'
  outline: '#8c7167'
  outline-variant: '#e0c0b4'
  surface-tint: '#a73a00'
  primary: '#a33900'
  on-primary: '#ffffff'
  primary-container: '#c74d13'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb599'
  secondary: '#48654b'
  on-secondary: '#ffffff'
  secondary-container: '#c7e8c7'
  on-secondary-container: '#4c6a4f'
  tertiary: '#495e71'
  on-tertiary: '#ffffff'
  tertiary-container: '#62778b'
  on-tertiary-container: '#fdfcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbce'
  primary-fixed-dim: '#ffb599'
  on-primary-fixed: '#370e00'
  on-primary-fixed-variant: '#7f2a00'
  secondary-fixed: '#caebc9'
  secondary-fixed-dim: '#aecfae'
  on-secondary-fixed: '#05210c'
  on-secondary-fixed-variant: '#314d34'
  tertiary-fixed: '#cfe5fc'
  tertiary-fixed-dim: '#b3c9df'
  on-tertiary-fixed: '#061d2e'
  on-tertiary-fixed-variant: '#34495b'
  background: '#fff8f6'
  on-background: '#271815'
  surface-variant: '#f9dcd7'
  surface-cream: '#FFF8EF'
  surface-card: '#FFF3D4'
  surface-card-default: '#FDF4E7'
  surface-dark: '#1D3421'
  primary-light: '#FFF0E6'
  primary-hover: '#D85820'
  border-muted: '#E8DDC8'
  border-warm: '#E5D9BB'
  badge-live-bg: '#EAF5EC'
  badge-live-dot: '#2E7D32'
  text-primary: '#3C3835'
  text-muted: '#7A7268'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 56px
    fontWeight: '800'
    lineHeight: 64px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 42px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.06em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

# Design System: CK Grounds (Rally & Dink / Court Booking)

## 1. Brand Identity & Vision
CK Grounds is a premier community pickleball club and court reservation platform located in Tabuelan, Cebu. The brand reflects an energetic, warm, modern athletic aesthetic rooted in specialty coffee tones and championship court hues. It balances sporty vitality with welcoming warmth, emphasizing effortless reservations, transparent pricing, and instant QR check-ins.

- **Brand Tone:** Warm, approachable, athletic, modern, minimal, reliable.
- **Core Visual Contrast:** Deep organic court greens paired with warm burnt orange espresso accents and rich oat milk cream surfaces.

---

## 2. Color Palette & Semantic Tokens

### Primary & Accent Colors
- **Flame / Burnt Orange (`#EA662C` / `#EA672D`):** Primary action color, active badges, key CTAs, emphasis highlights.
  - Light container: `#FFF0E6`
  - Hover state: `#D85820`
- **Dark Roast / Cal Poly Green (`#26422A`):** Secondary brand tone, dark highlight containers, athletic grounding, header badges.
  - Container: `#26422A`
  - High container / card background: `#1D3421`
  - Text on dark container: `#EAEFEA`
- **Cocoa Bean / Bistre (`#42302D` / `#5D372A`):** Deep earthy neutral for high-contrast typography and subtle dividers.
- **Columbia Blue (`#D2E8FF`):** Soft secondary accent for information badges and interactive utility tags.

### Surface & Background Tokens
- **Oat Milk Foam / Vanilla Base (`#FFF8EF` / `#EFE3C4` / `#FFEEBC`):**
  - Main Page Background: `#FFF8EF`
  - Surface Card (Low): `#FFF3D4`
  - Surface Card (Default): `#FDF4E7`
  - Surface Card (Elevated/Selected): `#FFFFFF`
  - Surface Muted / Inactive Border: `#E8DDC8`

### Typography Colors
- **Text Headings / Display:** `#26422A` (Cal Poly Green) or `#42302D` (Cocoa Bean)
- **Text Body / Primary:** `#3C3835`
- **Text Muted / Subtitle:** `#7A7268`
- **Text on Dark Green Cards:** `#FFFFFF` or `#F4F8F4`
- **Text on Burnt Orange Buttons:** `#FFFFFF`

---

## 3. Typography Hierarchy

- **Font Family:** `Plus Jakarta Sans`, sans-serif (Athletic, geometric, legible)
- **Hierarchy:**
  - **Display / Hero H1:** `text-4xl` to `text-6xl`, font-extrabold (`font-black` / `font-extrabold`), tight tracking (`tracking-tight`), leading-tight.
  - **Section Headings (H2):** `text-3xl`, `font-black`, color: `#26422A` or `#42302D`.
  - **Subheadings / Card Titles (H3):** `text-xl` to `text-2xl`, `font-bold`.
  - **Body Text:** `text-base` (16px), regular / medium (`font-normal` / `font-medium`), leading-relaxed, color: `#4A453E`.
  - **Captions / Microcopy:** `text-xs` to `text-sm`, `font-semibold`, uppercase tracking where used as pill badges (`tracking-wider`).

---

## 4. Spacing, Radii & Shadows

- **Base Spacing Grid:** 8px rhythm (Tailwind scale: `gap-4`, `gap-6`, `p-6`, `p-8`, `py-16`, `py-20`).
- **Border Radius:**
  - Cards & Containers: `rounded-2xl` (16px) or `rounded-3xl` (24px) for prominent feature sections.
  - Buttons & Inputs: `rounded-xl` (12px) to `rounded-full` for chips and pill badges.
  - Badges & Pills: `rounded-full`.
- **Borders & Dividers:** `border border-[#E8DDC8]/60` or `border-[#E5D9BB]`.
- **Elevation / Shadows:**
  - Subtle cards: `shadow-sm` with warm amber tint `shadow-[#42302D]/5`.
  - Floating CTA / Active cards: `shadow-md` or `shadow-lg` (`shadow-[#EA662C]/20`).

---

## 5. Component Patterns

### Primary Button
- Background: `#EA662C` (Burnt Orange)
- Text: White, `font-bold`, `text-sm` or `text-base`
- Padding: `px-6 py-3.5`
- Radius: `rounded-xl`
- Hover: `bg-[#D85820]`, subtle upward translate `hover:-translate-y-0.5 transition-all`

### Secondary / Ghost Button
- Background: Transparent or `#FFF3D4`
- Border: `border border-[#26422A]/20` or `#EA662C`
- Text: `#26422A` or `#EA662C`, `font-semibold`

### Status Badges & Pills
- Green Live Badge: Background `#EAF5EC`, Text `#26422A`, Border `#26422A`/15, Dot `#2E7D32`
- Orange Pricing Pill: Background `#FFF0E6`, Text `#EA662C`, `font-black`
- Step Indicator: Round pill badge `#FFF0E6` with step number in bold orange

### Cards & Modular Grids
- **Rental / Court Cards:** Warm oat surface `#FFF3D4`/60 with subtle 1px border `#E8DDC8`, generous internal padding (`p-6` to `p-8`), rounded corners (`rounded-2xl`), clear visual price badge.
- **Dark Feature Section (Booking/Tracking):** Deep green container `#26422A`, white typography, integrated input field with instant action button.
- **Step Cards (How It Works):** 5-column responsive layout, minimalist card containers, step count pill, short 1–2 sentence scannable copy.

### Forms & Tracking Input
- Background: `#FFF8EF` or `#FFFFFF`
- Border: `border-2 border-[#E5D9BB]` focusing to `border-[#EA662C]`
- Text: Monospace or uppercase tracking for booking reference code (`PC-2026-XXXX`).

---

## 6. Content & Copy Principles
- **Concise & Direct:** Avoid lengthy paragraphs; keep descriptions to single, scannable sentences.
- **Rule Clarity:** Explicitly feature key policies (e.g. "Starts tomorrow", "10-minute hold", "No account needed").
- **Consistent Pricing:**
  - Day Court Rate: ₱150/hr (6 AM - 6 PM)
  - Night Court Rate: ₱200/hr (6 PM - 3 AM)
  - Paddle Rental: ₱25/hr
  - Ball Rental: ₱15 flat / booking
