# Our Space Companion — Chrome extension (dev build)

Manifest V3 extension that overlays your equipped Space Companion onto
youtube.com, synced from your Companion Profile on the Our Space web app.
There is no Chrome Web Store listing yet — this is a development/beta
install only. See the in-app **Companion setup page** (Couple Home →
hamburger menu → Space Companion) for the same instructions in context.

## Source of truth

- `manifest.json` — hand-authored, committed.
- `content-script.js` — **generated**, gitignored. The YouTube overlay,
  built from `frontend/src/extension/contentScriptEntry.ts` (see
  `frontend/vite.extension.config.ts`).
- `web-bridge.js` — **generated**, gitignored. The small script that runs
  on Our Space's OWN web app and caches your equipped Companion for
  `content-script.js` to read — built from
  `frontend/src/extension/webAppBridgeEntry.ts` (see
  `frontend/vite.extension.bridge.config.ts`).
- `assets/` — see `assets/README.md`; empty for this POC (every Companion
  is inline SVG in code, not an image file).

## Build

From `frontend/`:

```bash
npm run build:extension
```

This writes both `extension/content-script.js` and
`extension/web-bridge.js`. Re-run it after any change under
`frontend/src/extension/` or `frontend/src/companions/`.

## Load as an unpacked extension (development only)

1. Open `chrome://extensions` (copy/paste this into the address bar —
   Chrome does not allow linking to it directly from a web page).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this `extension/` directory.
5. Confirm "Our Space Companion (Dev Build)" is listed and enabled.
6. Open (or reload) any `https://www.youtube.com/*` page.

## What it does

- Adds your equipped Space Companion overlay to YouTube, isolated in its
  own Shadow DOM under `#our-space-extension-root` — it never modifies
  YouTube's own page.
- **WASD** always moves the companion (while not typing in a YouTube
  field).
- **Arrow keys** move the companion only after it's selected (click it) —
  Companion Control Mode, indicated by a glow ring. Press **Escape**, or
  click outside the companion, to release them back to YouTube.
- The small pill in the bottom-right corner toggles **Focus Mode**, which
  hides the companion (never YouTube's UI) and shrinks to a small dot as
  its own restore control.

## Companion sync (web app → extension)

Your **Companion Profile** on the Our Space web app (Save & Equip) is the
one authoritative source — stored in Django/PostgreSQL. This extension
never talks to the backend directly (a youtube.com content script has no
safe way to authenticate as you without either loosening the backend's
CORS/cookie posture or giving the extension its own separate credential —
both explicitly avoided). Instead:

1. The Companion Profile page (already running on Our Space's own,
   already-authenticated origin) broadcasts your equipped Companion via
   `window.postMessage` whenever you load the page or Save & Equip.
2. `web-bridge.js` — a second content script this extension also injects
   on Our Space's own web app origin — listens for that message and
   caches it in `chrome.storage.local`, a store shared by every content
   script this extension runs, regardless of which tab wrote it.
3. `content-script.js` (the YouTube overlay) reads that cache on load,
   and stays subscribed to `chrome.storage.onChanged` for as long as the
   YouTube tab is open.

**Sync is LIVE, not reload-based**: if you change Save & Equip while a
YouTube tab is already open, the overlay updates immediately, with no
extension reload and no need to refresh the YouTube tab.

**Known limitation**: `chrome.storage.local` is per-browser-profile, not
per-account across devices — a different browser or computer won't see
your equipped Companion until you visit the Companion Profile page there
too (which is expected: that visit is what populates the cache in that
browser).

## Companions

Five Companion types are available, each with its own curated color set —
see `frontend/src/companions/registry.ts`:

- **Cosmic Blob** — the original default; its own "Default" style is a
  two-tone gradient with blinking eyes, not a flat color.
- **Cosmic Flyer**
- **Mini UFO**
- **Star Wisp**
- **Nova Guardian** — a humanoid cosmic flyer. Its body/lead-arm/trail-arm
  rotate to face your movement direction in real time (see
  `frontend/src/companions/novaGuardianPose.ts`); its cape trails
  opposite that direction automatically (it's anchored on the figure's
  back, so no separate "opposite direction" math is needed — only the
  body's own rotation). A subtle streak/cape-flutter effect plays while
  moving — this is a visual-only effect; it does not change the
  companion's actual movement speed.

## Known limitations (proof-of-concept scope)

- No backend integration, accounts, or partner sync beyond the one-way
  Companion Profile → extension cache described above.
- YouTube is a single-page app — the content script runs once per real
  page load, not on every in-app navigation between videos. The companion
  and its state persist across those in-app navigations, which is the
  desired behavior for this slice.
- No production icon/branding.
- The web app bridge's `matches` pattern is the local dev server origin
  (`http://localhost:5173`) — add the real deployed frontend origin here
  once one exists.
