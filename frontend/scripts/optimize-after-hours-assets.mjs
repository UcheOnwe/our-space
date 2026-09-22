#!/usr/bin/env node
/**
 * Generates web-ready runtime copies of the After Hours room stills under
 * `public/after-hours/` from the untouched originals in
 * `art-source/After-hours/`.
 *
 * Unlike optimize-room-assets.mjs's furniture/avatar sprites (each a small
 * fraction of the 1600x900 world, aggressively downscaled), these four
 * images ARE the room's full environment backplate for each of its
 * views — same category as optimize-room-assets.mjs's own (deliberately
 * untouched) `environment` entry, which notes a full-room backplate
 * renders at its complete world size and camera zoom can reach up to
 * 2.5x (camera.ts's MAX_ZOOM_FACTOR), so shrinking it the way a small
 * sprite is shrunk would visibly soften it under zoom.
 *
 * So these are re-encoded, not resized: lossless PNG (4-7MB each,
 * confirmed via the source files) to a high-quality JPEG, matching the
 * format already used for Cozy Loft's own full-frame stills
 * (main-room-poster.jpg, tv-closeup-poster.jpg). All four sources are
 * confirmed 3344x1882 (16:9), matching ROOM_WORLD_WIDTH/HEIGHT's own
 * 1600/900 ratio, so no cropping is needed either.
 *
 * Re-run this whenever art-source/After-hours/ changes:
 * `node scripts/optimize-after-hours-assets.mjs`. It always reads from
 * art-source/ and never modifies it.
 */

import sharp from 'sharp'
import path from 'node:path'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const SOURCE_DIR = path.join(ROOT, 'art-source', 'After-hours')
const RUNTIME_DIR = path.join(ROOT, 'frontend', 'public', 'after-hours')

const JPEG_QUALITY = 90

const ASSETS = [
  { runtime: 'main-room.jpg', source: 'collabcozy_upscayl_2x_digital-art-4x.png' },
  { runtime: 'gaming-closeup.jpg', source: 'ghameroomcollum_upscayl_2x_digital-art-4x.png' },
  { runtime: 'garage-closeup.jpg', source: 'NeonTunerGarageShowdown_upscayl_2x_digital-art-4x.png' },
  { runtime: 'hallway-closeup.jpg', source: 'NeonVaporwaveHallwaywithAlienDisplay_upscayl_2x_digital-art-4x.png' },
  // Added after the initial slice: the dedicated TV close-up (previously
  // missing — the TV hotspot reused main-room.jpg as a stand-in) and the
  // Kitchen close-up.
  { runtime: 'tv-closeup.jpg', source: 'tvcloseupCLLBH_upscayl_2x_digital-art-4x.png' },
  { runtime: 'kitchen-closeup.jpg', source: 'AfterHoursKitchen_upscayl_2x_digital-art-4x.png' },
]

async function run() {
  const rows = []
  for (const entry of ASSETS) {
    const sourcePath = path.join(SOURCE_DIR, entry.source)
    const runtimePath = path.join(RUNTIME_DIR, entry.runtime)
    const image = sharp(sourcePath)
    const meta = await image.metadata()

    await image.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(runtimePath)

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
      dimensions: r.dimensions,
      'before MB': r.beforeMB.toFixed(2),
      'after MB': r.afterMB.toFixed(2),
    })),
  )
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
