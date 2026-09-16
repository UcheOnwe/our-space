import { defineConfig } from 'vite'

// The web-app-side half of Companion sync (see
// src/extension/webAppBridgeEntry.ts's own doc comment) — a SECOND,
// separate content script from contentScriptEntry.ts/content-script.js,
// matching Our Space's own web app origin instead of youtube.com (see
// ../extension/manifest.json's second `content_scripts` entry). Kept as
// its own tiny Vite config/output file, mirroring
// vite.extension.config.ts, rather than trying to make one IIFE bundle
// serve two completely different injection targets — Vite's `lib.entry`
// only supports one output per `formats: ['iife']` config, and splitting
// these is also just clearer: one file, one job, one injection target.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: '../extension',
    emptyOutDir: false,
    lib: {
      entry: 'src/extension/webAppBridgeEntry.ts',
      formats: ['iife'],
      name: 'OurSpaceCompanionBridge', // required by Vite's iife format; unused since this script has no exports
      fileName: () => 'web-bridge.js',
    },
  },
})
