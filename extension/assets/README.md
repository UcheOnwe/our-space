# assets/

The default Space Companion for this proof-of-concept is drawn as an inline
SVG string directly in `frontend/src/extension/companionView.ts` — there is
no image file to put here yet.

This folder exists as the obvious future home for a real companion asset
(sprite sheet, PNG, etc.). When one exists, swap `companionView.ts`'s
`COMPANION_SVG` constant for an `<img>`/`<image>` pointing at a file placed
here, and add a `web_accessible_resources` entry to `../manifest.json` so
the page context is allowed to load it.
