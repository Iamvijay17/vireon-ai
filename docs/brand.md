# Vireon AI brand assets

**The mark - "The Vireon Vortex".** A geometric V sheared into two blades; the right blade
sits higher, so the letter reads as turning. Each blade is a right triangle - together a
play triangle rotated onto its point and split in two. A four-point spark floats in the
V's open counter (generative AI). Flat, two-tone, no gradients, so it holds at 16px.

| Token | Value | Use |
| --- | --- | --- |
| Violet | `#7C3AED` | left blade, accent |
| Lavender | `#A78BFA` | right blade, "AI", i-dot |
| Ink | `#09090B` | dark background, light-variant symbol |

## Files

`frontend/public/brand/` (served at `/brand/...`, deliberately not under `/assets/`, which
nginx caches as immutable for a year):

| File | Use |
| --- | --- |
| `vireon-logo.svg` | primary: symbol + wordmark, for dark surfaces |
| `vireon-logo-light.svg` | same on white / documents (dark symbol) |
| `vireon-logo-mono.svg`, `vireon-logo-mono-white.svg` | single colour, ink / white |
| `vireon-logo-sidebar.svg` | compact lockup used by the app sidebar |
| `vireon-symbol.svg`, `vireon-symbol-light.svg` | symbol only, transparent |
| `vireon-app-icon.svg` | symbol on a rounded ink tile |

`frontend/public/`: `favicon.svg`, `favicon.ico` (16/32/48), `apple-touch-icon.png`,
`icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (referenced by `site.webmanifest`).

## In the app

`frontend/src/components/Logo` - `<LogoMark size tone />` and `<Logo variant="compact|primary" height tone />`,
inline SVG, `tone` = `dark` | `light` | `mono` (currentColor). Decorative (`aria-hidden`) unless you pass `title`.
Used in `layout/Sidebar.jsx`; `public/offline.html` carries its own inline copy because it must work without the app.

## Changing the logo

Edit `src/components/Logo/geometry.js` (the single source of truth), then from `frontend/`:

```bash
node scripts/build-brand-assets.mjs
```

That rewrites every SVG, PNG and the ICO. Bump `VERSION` in `public/sw.js` and the `?v=` on the
icon links in `index.html` so browsers refetch; update the inline mark in `public/offline.html` by hand.
