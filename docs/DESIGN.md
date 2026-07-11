# Design System — Source of Truth

Two live references, in priority order:

1. **https://getdesign.md/theverge/design-md** — canonical token reference.
   The MD text describes the dark homepage, but the **Live Preview has an
   official Light theme** — its CSS custom properties are THE token set for
   this site. Open in Chrome to peek values; do NOT rely on stale local exports.
2. **Saved The Verge light-theme snapshot** (`~/Downloads/The Verge.html` + CSS)
   — reference for the real site's header/nav layout only (the getdesign
   preview nav is getdesign's own brand, not The Verge's).

The old root-level `DESIGN.md` export is deprecated and deleted.

## Light-theme tokens (extracted live from getdesign preview, Light mode)

Variable names below are kept IDENTICAL to the official preview:

```
--canvas:              #ffffff
--canvas-inverted:     #131313
--surface-slate:       #f2f2f2
--surface-slate-2:     #e6e6e6
--image-frame:         #d4d4d4
--hazard-white:        #ffffff
--absolute-black:      #000000
--jelly-mint:          #3cffd0
--verge-ultraviolet:   #5200ff
--console-mint-border: #309875
--deep-link-blue:      #3860be
--focus-cyan:          #1eaedb
--purple-rule:         #3d00bf
--dim-gray:            #8c8c8c
--primary-text:        #131313
--secondary-text:      #6a6a6a
--muted-text:          #8c8c8c
--inverted-text:       #ffffff
```

The preview itself uses the same free font substitutes we do
(Anton / Space Grotesk / Space Mono / Newsreader) — no drift.

## Fonts (proprietary → free substitutes)

| Role    | Real                | Substitute    | Adjustment                       |
|---------|---------------------|---------------|----------------------------------|
| Display | Manuka 900          | Anton         | line-height 0.80 → 0.95          |
| Sans/UI | PolySans 300/500/700| Space Grotesk | none                             |
| Mono    | PolySans Mono       | Space Mono    | none; ALWAYS uppercase           |
| Serif   | FK Roman Standard   | Newsreader    | none; body/editorial only, no UI |

## Type scale (key rows from getdesign)

- Display: Manuka 107/90/60px, 900, lh 0.80 (→0.95 for Anton), ls 1.07px
- Large headline: sans 34px/700/1.00 · Medium: 24px/700/1.00 · Small: 20px/700/1.00
- Light capitalized eyebrow: sans 19px/300/1.20, ls 1.9px — signature "whisper"
- Nav links (from light snapshot): sans 19px/300/120%, ls 0, no transform
- Body relaxed: sans 16px/500/1.60 · compact 13px/400/1.60
- Mono labels: 11–12px/500–600, UPPERCASE, ls 1.1–1.8px
- Serif body: 16px/400/1.30, ls -0.16px

## Header / navigation (light snapshot, exact)

- Nav top-right; `/` separators via `::after` (font-size 110%, abs-positioned),
  column-gap 26px; row has 1px bottom border in ink, padding-bottom 2px.
- Link hover: `opacity: .5`. Active: `box-shadow: inset 0 -1px 0 0 #309875`.
- Wordmark: huge display block top-left, shares the top band with nav.

## Buttons (getdesign, exact)

- Primary: mint fill, black text, mono 12/600 UPPERCASE ls 1.5px, radius 24px,
  padding 10×24. Hover `rgba(255,255,255,.2)` + 1px `#c2c2c2` ring, 180ms.
  Active `rgba(140,140,140,.87)`, opacity .5.
- Secondary: `#2d2d2d` fill, `#e9e9e9` text, radius 24px; hover same as primary.
- Tertiary: transparent, 1px mint border, mint text, radius 40px; hover inverts.
- Outlined UV promo: 1px `#5200ff` border, radius 30px.
- Pill tag: accent fill, radius 20px, mono 11/600 UPPERCASE ls 1.8px, pad 4×10.

## Radii scale

2px inputs · 3–4px nested images · 20px tiles/tags · 24px feature tiles &
button pills · 30px promo buttons · 40px outlined CTA · 50% avatars.

## Depth & interaction

- No elevation shadows ever; 1px hairline borders + saturated fills carry depth.
- Hover changes color only (no lift/scale/zoom). Transitions 150–200ms ease.
- Link hover color: deep link blue `#3860be`.
- Active tab: 1px inset mint underline.
- Tile hover on this site: neutral tiles darken border + headline goes UV;
  accent tiles invert fully (mint tile → black bg / white text).

## Spacing & grid

Base 8px. Container max 1280px, outer padding 48px desktop / 24px mobile.
Section padding 32–64px vertical. Card interior 20–32px (feature 40–48px).
Timeline gaps 12–16px. Grid collapses 4→3→2→1 col; breakpoints 1300/1180/1024/
900/768/550/400.
