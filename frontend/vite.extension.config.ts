import { defineConfig } from 'vite'

// A second, separate Vite build — NOT part of the main React app's
// `vite.config.ts` — because the Chrome extension's content script is a
// completely different deployable artifact with different constraints: it
// must be one self-contained classic script (no ES module imports Chrome
// has to resolve at runtime), it never touches React, and it ships to a
// different directory (../extension) than the web app's own `dist/`.
// Reuses Vite's own library-build mode rather than adding a bundler
// dependency (esbuild/rollup directly, webpack, etc.) — Vite is already a
// devDependency of this project for the main app.
export default defineConfig({
  // Without this, Vite copies the main web app's frontend/public/ (room
  // art, favicon, ...) into whatever `build.outDir` this config uses too —
  // that directory has nothing to do with the extension.
  publicDir: false,
  build: {
    outDir: '../extension',
    // The extension/ directory also holds manifest.json, the hand-authored
    // README, and (in this repo) nothing else generated — but wiping the
    // whole directory on every build would be surprising the moment
    // anything else ever lives there, so only the files this build itself
    // produces are ever touched.
    emptyOutDir: false,
    lib: {
      entry: 'src/extension/contentScriptEntry.ts',
      // A Chrome MV3 `content_scripts.js` entry is loaded as a classic
      // (non-module) script by default — IIFE output means the whole
      // bundle (including companionMovement.ts/keyboardInput.ts/etc., all
      // pulled in via the entry's own imports) is self-contained in one
      // file with no `import`/`export` Chrome would otherwise need
      // "type": "module" content scripts to resolve.
      formats: ['iife'],
      name: 'OurSpaceCompanion', // required by Vite's iife format; unused since this script has no exports
      fileName: () => 'content-script.js',
    },
  },
})
