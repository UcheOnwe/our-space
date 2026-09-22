#!/usr/bin/env node
/**
 * Generates web-ready runtime copies of the LaurUch (the default/free
 * room's) new close-up stills under `public/lauruch/` from the untouched
 * originals in `art-source/LaurUch/`.
 *
 * These are CLOSE-UP destinations reached from the existing main room
 * (RoomCanvas.tsx, still PixiJS — NOT replaced by this slice), the same
 * category as After Hours' own close-ups (see
 * optimize-after-hours-assets.mjs's own doc comment for why full-frame
 * stills are re-encoded rather than resized: they can fill the room's
 * complete world size under zoom, so shrinking them the way a small
 * furniture sprite is shrunk would visibly soften them).
 *
 * Re-run this whenever art-source/LaurUch/ changes:
 * `node scripts/optimize-lauruch-assets.mjs`. It always reads from
 * art-source/ and never modifies it.
 */

import sharp from 'sharp'
import path from 'node:path'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const SOURCE_DIR = path.join(ROOT, 'art-source', 'LaurUch')
const RUNTIME_DIR = path.join(ROOT, 'frontend', 'public', 'lauruch')

const JPEG_QUALITY = 90

const ASSETS = [
  { runtime: 'tv-closeup.jpg', source: 'lAURUCHTVCLOSEUP_upscayl_2x_digital-art-4x.png' },
  { runtime: 'desktop-closeup.jpg', source: 'LauruchDesktoparea_upscayl_2x_digital-art-4x.png' },
  { runtime: 'kitchen-closeup.jpg', source: 'LaurUch Kitchen_upscayl_2x_digital-art-4x.png' },
  { runtime: 'door-closeup.jpg', source: 'LAURUCHDOORCLOSEUP_upscayl_2x_digital-art-4x.png' },
  // Visually confirmed to be a garage scene (two cars, "OurSpace"
  // branding) despite its source filename — see AfterHoursRoom-adjacent
  // report notes. Used as the LaurUch Garage destination, not the main
  // room.
  { runtime: 'garage.jpg', source: 'animatedLauruch_upscayl_2x_digital-art-4x.png' },
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
