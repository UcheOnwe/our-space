# Our Space Companion — Chrome extension (dev build)

Proof-of-concept Manifest V3 extension that overlays one Space Companion
onto youtube.com. There is no Chrome Web Store listing yet — this is a
development/beta install only. See the in-app **Companion setup page**
(Couple Home → hamburger menu → Space Companion) for the same instructions
in context.

## Source of truth

- `manifest.json` — hand-authored, committed.
- `content-script.js` — **generated**, gitignored. Built from
  `frontend/src/extension/` (see `frontend/vite.extension.config.ts`).
- `assets/` — see `assets/README.md`; empty for this POC (the default
  companion is an inline SVG in code, not an image file).

## Build

From `frontend/`:

```bash
npm run build:extension
```

This writes `extension/content-script.js`. Re-run it after any change
under `frontend/src/extension/`.

## Load as an unpacked extension (development only)

1. Open `chrome://extensions` (copy/paste this into the address bar —
   Chrome does not allow linking to it directly from a web page).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this `extension/` directory.
5. Confirm "Our Space Companion (Dev Build)" is listed and enabled.
6. Open (or reload) any `https://www.youtube.com/*` page.

## What it does

- Adds one default Space Companion overlay to YouTube, isolated in its own
  Shadow DOM under `#our-space-extension-root` — it never modifies
  YouTube's own page.
- **WASD** always moves the companion (while not typing in a YouTube
  field).
- **Arrow keys** move the companion only after it's selected (click it) —
  Companion Control Mode, indicated by a glow ring. This is deliberate:
  YouTube itself binds bare arrow keys to seek/volume, so arrows are only
  repurposed once the user has explicitly chosen to control the companion.
  Press **Escape**, or click outside the companion, to release them back
  to YouTube.
- The small pill in the bottom-right corner toggles **Focus Mode**, which
  hides the companion (never YouTube's UI) and shrinks to a small dot as
  its own restore control.

## Known limitations (proof-of-concept scope)

- No backend integration, accounts, or partner sync of any kind.
- YouTube is a single-page app — the content script runs once per real
  page load, not on every in-app navigation between videos. The companion
  and its state persist across those in-app navigations, which is the
  desired behavior for this slice.
- No production icon/branding.
