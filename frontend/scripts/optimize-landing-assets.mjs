#!/usr/bin/env node
/**
 * Generates web-ready runtime copies of the landing page's still imagery
 * under `public/landing/` from the untouched originals in
 * `art-source/Landing/`.
 *
 * Unlike the room/close-up optimize scripts (optimize-lauruch-assets.mjs,
 * optimize-after-hours-assets.mjs), these stills are never pinch-zoomed
 * inside a pannable world — they're shown inline at whatever width their
 * section composes them at, so this ALSO downsizes to a sane max width
 * (unlike those scripts, which deliberately don't resize) rather than
 * only re-encoding at full resolution.
 *
 * The landing page's real videos (CoupleHug.mp4, Companion-youtube.mp4,
 * Roomselection.mp4, gameplay.mp4, after-hours-explore-hallway-game-room-
 * garage(1).mp4, after-hours-room-navigation-tv.mp4) are copied as-is by
 * hand, not by this script — there's no video transcoding tool on this
 * machine (the same constraint frontend/public/cozy-loft/'s own videos
 * already carry). The three UUID-named files in art-source/Landing/ are
 * NOT videos at all (confirmed: each is a 1-byte placeholder) and are
 * never referenced anywhere.
 *
 * Re-run this whenever art-source/Landing/ changes:
 * `node scripts/optimize-landing-assets.mjs`. It always reads from
 * art-source/ and never modifies it.
 */

import sharp from 'sharp'
import path from 'node:path'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const SOURCE_DIR = path.join(ROOT, 'art-source', 'Landing')
const RUNTIME_DIR = path.join(ROOT, 'frontend', 'public', 'landing')

const JPEG_QUALITY = 82
const MAX_WIDTH = 2560

const ASSETS = [
  // Room Reveal — an actual in-app screenshot (After Hours main room,
  // real nav chrome included), not a mockup.
  { runtime: 'room-reveal.jpg', source: 'OurSpaceHero_upscayl_3x_digital-art-4x.png' },
  // Explore Your Space — LaurUch's door close-up mid-navigation
  // ("Where to? -> Garage").
  { runtime: 'explore-door.jpg', source: 'DoorOurspace_upscayl_3x_digital-art-4x.png' },
  // Make It Yours — the LaurUch kitchen fridge, including the existing
  // "Happy Birthday Best Girlfriend" note (used as AN EXAMPLE, not a
  // universal default — see PersonalizeSection.tsx's own doc comment).
  { runtime: 'personalize-fridge.jpg', source: 'KitcheMakeitYours_upscayl_3x_digital-art-4x.png' },
  // Play Together — confirmed by direct visual inspection to be an
  // 8-Ball Pool game screenshot inside the LaurUch gaming close-up
  // (GamePlayer's own environment mode UI is visible), NOT a swimming
  // pool despite the source filename.
  { runtime: 'play-together.jpg', source: 'poolOurspace_upscayl_3x_digital-art-4x.png' },
  // Watch Together — a personalized TV-area example still.
  { runtime: 'watch-together.jpg', source: 'tvareayourgirlfriendcustom_upscayl_3x_digital-art-4x.png' },
]

async function run() {
  const rows = []
  for (const entry of ASSETS) {
    const sourcePath = path.join(SOURCE_DIR, entry.source)
    const runtimePath = path.join(RUNTIME_DIR, entry.runtime)
    const image = sharp(sourcePath).rotate()
    const meta = await image.metadata()

    await image
      .resize({ width: Math.min(MAX_WIDTH, meta.width ?? MAX_WIDTH), withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(runtimePath)

    const { size: sourceBytes } = await stat(sourcePath)
    const { size: runtimeBytes } = await stat(runtimePath)

    rows.push({
      runtime: entry.runtime,
      dimensions: `${meta.width}x${meta.height}`,
      beforeMB: sourceBytes / 1024 / 1024,
      afterMB: runtimeBytes / 1024 / 1024,
    })
  }

  console.table(
    rows.map((r) => ({
      asset: r.runtime,
      'source dimensions': r.dimensions,
      'before MB': r.beforeMB.toFixed(2),
      'after MB': r.afterMB.toFixed(2),
    })),
  )
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
