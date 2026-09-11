#!/usr/bin/env node
/**
 * Generates right-sized runtime copies of the production room/avatar art
 * under `public/room/` from the untouched originals in `art-source/`.
 *
 * WHY THIS EXISTS (mobile Safari crash investigation, Slice 2D):
 * every PNG under `public/room/` was the raw AI-upscaled export — several
 * thousand pixels per side — used DIRECTLY as a runtime PixiJS texture.
 * Decoded (uncompressed) GPU/CPU texture memory is `width * height * 4`
 * bytes, completely independent of the PNG's compressed file size. Loading
 * all ~20 textures Couple Home needs at startup added up to roughly 870MB
 * of decoded RGBA data — comfortably past the texture-memory budget iOS
 * Safari enforces per page, which is what produced the repeated
 * reload/crash loop ("A problem repeatedly occurred on this webpage").
 *
 * None of these pieces render anywhere near their source resolution — the
 * whole room is a fixed 1600x900 world (constants.ts), and every piece is
 * placed at a small fraction of that. This script re-derives a sensible
 * runtime resolution per piece instead of shipping the untouched master
 * resolution:
 *
 *   target px = source px * (rendered-world-size factor * RESOLUTION_HEADROOM)
 *
 * The "rendered-world-size factor" per piece is explained in each section
 * below (furniture/lighting still key off their historical `scale` value;
 * avatars key off the rig's own baseScale math) — the shared idea is
 * always `source px * that factor` = how many WORLD UNITS that piece
 * actually renders at. RESOLUTION_HEADROOM then converts world units to a
 * safe max device-pixel budget: it covers the camera's own zoom-in
 * ceiling (computeCameraFrame has no upper clamp — a large high-DPI
 * desktop monitor can drive the camera scale above 1x, see camera.ts)
 * together with a standard Retina/iPhone devicePixelRatio, WITHOUT
 * assuming both hit their absolute worst case simultaneously (that
 * combination — a ~2560-logical-pixel-wide desktop window on a 2x-DPR
 * display — is the realistic ceiling this covers; further zoom beyond
 * that is a rare edge case not worth 10x the memory for).
 *
 * IMPORTANT — runtime texture resolution and in-world visual size are two
 * INDEPENDENT concerns (a real regression this comment exists to prevent
 * a repeat of): furniture/lighting placements in roomAssets.ts store an
 * explicit world-unit `width`/`height`, NOT a `scale` multiplier of
 * whatever pixel size this script happens to output — so changing
 * RESOLUTION_HEADROOM (or re-running this after a source-art update)
 * changes memory footprint and on-screen sharpness only, never how big
 * anything looks in the room. Avatars get the same independence for free,
 * a different way — see the "Avatars" section below.
 *
 * Re-run this whenever art-source/ changes: `node scripts/optimize-room-assets.mjs`.
 * It always reads from art-source/ and never modifies it.
 */

import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const SOURCE_DIR = path.join(ROOT, 'art-source')
const RUNTIME_DIR = path.join(ROOT, 'frontend', 'public', 'room')

// Camera-zoom ceiling (see camera.ts's computeCameraFrame — no upper clamp)
// combined with a standard high-DPI display, as explained above.
const RESOLUTION_HEADROOM = 3.5

// For reference only (not used in the math below): the room's own fixed
// coordinate space is 1600x900 world units (constants.ts). Every
// furniture/avatar piece's own placement `scale` already bakes in its
// world-unit footprint; only the environment backplate is sized directly
// in world units instead, which is exactly why it's handled separately
// below instead of through this file's per-piece `factor` math.

/**
 * One entry per runtime file. `factor` is the source-px -> runtime-px
 * multiplier (see the module doc comment); `source` is its untouched
 * master under art-source/. Grouped and commented by category because
 * environment/furniture/avatar/interaction pieces each render at a very
 * different fraction of the world — a single flat resolution for all of
 * them would either blur the small pieces or waste memory on top of the
 * big one (the explicit thing this task asked NOT to do).
 */

// --- Furniture ---------------------------------------------------------
// factor = the piece's HISTORICAL placement `scale` (the multiplier
// roomAssets.ts used against the original, pre-optimization texture,
// before this task converted furniture placements to explicit world-unit
// `width`/`height`) * RESOLUTION_HEADROOM. `source px * that scale` is
// exactly the world-unit size the room was already approved at — using it
// here (rather than, say, `roomAssets.ts`'s new `width`/`height` divided
// by original px) just avoids re-deriving the same number two ways.
const SHARED_CANVAS_FURNITURE_SCALE = 0.11 // roomAssets.ts's pre-optimization value
// Source filenames matched against the current runtime files by exact
// (pixel dimensions + byte size) pair — every match below was unique, no
// two art-source files share both, so this mapping isn't a guess. Two
// art-source files are intentionally unmapped: `scaleguideRoom_*` (a
// calibration reference, never a runtime asset) and
// `YoungAdultOurspaceChibi_*` (an unused early concept — nothing under
// public/room matches its dimensions+size).
const furniture = [
  { runtime: 'furniture/furniture_couch_base.png', source: 'COUCHASSET_upscayl_2x_digital-art-4x.png', factor: SHARED_CANVAS_FURNITURE_SCALE * RESOLUTION_HEADROOM },
  { runtime: 'furniture/furniture_couch_blanket.png', source: 'blanketASSET_upscayl_3x_digital-art-4x.png', factor: 0.046 * RESOLUTION_HEADROOM },
  { runtime: 'furniture/furniture_tv.png', source: 'tVsETUPaSSETS_upscayl_2x_digital-art-4x.png', factor: SHARED_CANVAS_FURNITURE_SCALE * RESOLUTION_HEADROOM },
  { runtime: 'furniture/furniture_bed.png', source: 'CozyBedourspaceAsset_upscayl_2x_digital-art-4x.png', factor: 0.096 * RESOLUTION_HEADROOM },
  { runtime: 'furniture/furniture_desk.png', source: 'DESKASSETRIGOURSPACE_upscayl_2x_digital-art-4x.png', factor: SHARED_CANVAS_FURNITURE_SCALE * RESOLUTION_HEADROOM },
  { runtime: 'furniture/furniture_chair.png', source: 'rIGaSSETSCHAIR_upscayl_2x_digital-art-4x.png', factor: 0.075 * RESOLUTION_HEADROOM },
  { runtime: 'furniture/furniture_coffee_table.png', source: 'furnitureAssetcoffeTable_upscayl_2x_digital-art-4x.png', factor: SHARED_CANVAS_FURNITURE_SCALE * RESOLUTION_HEADROOM },
]

// --- Lighting ------------------------------------------------------------
const lighting = [
  { runtime: 'lighting/lighting_lamp_base.png', source: 'Lampcouchsideasset_upscayl_3x_digital-art-4x.png', factor: 0.03 * RESOLUTION_HEADROOM },
  { runtime: 'lighting/lighting_lamp_glow.png', source: 'RIGASSETLAMPGLOW_upscayl_3x_digital-art-4x.png', factor: 0.043 * RESOLUTION_HEADROOM },
]

// --- Avatars ---------------------------------------------------------------
// factor = BASE_SCALE * RESOLUTION_HEADROOM — deliberately the SAME
// number for both genders, with NO relativeScale (1.15 for male) baked in
// here. That's not an oversight: AvatarRig's baseScale is recomputed at
// RUNTIME from whatever the female body texture's CURRENT pixel height
// happens to be (`TARGET_BODY_HEIGHT_WORLD_UNITS / femaleTextures.bodyBase
// .height`, see RoomCanvas.tsx) and relativeScale is applied ONCE, after
// that, to size the whole assembled rig — see AvatarRig.ts's constructor.
// That runtime recompute is already fully texture-resolution-independent
// by design (any uniform resize of female's textures cancels out
// automatically). The one thing that recompute CANNOT correct for is the
// two genders' textures being resized by two DIFFERENT factors relative
// to their own originals — which is exactly the regression a first pass
// of this script introduced by baking MALE_RELATIVE_SCALE into
// `maleFactor` alone: female's textures shrank by one ratio, male's by a
// ~15% larger one, and since baseScale only re-normalizes against
// female's own texture, that mismatch reappeared as a wrong, inflated
// male:female size ratio in the room, not the approved ~1.15.
// The fix is this file only using ONE shared factor for every avatar
// texture regardless of gender — relativeScale stays a purely RUNTIME rig
// concern (avatarConfigs.ts), never a texture-resizing one.
//
// BASE_SCALE = TARGET_BODY_HEIGHT_WORLD_UNITS(80) / female body texture's
// ORIGINAL pre-optimization height (3690px) = 0.021680... — the same
// single shared constant RoomCanvas.tsx computes at runtime (using
// whatever the CURRENT texture's height is), reproduced here as a literal
// against the ORIGINAL art-source height so this script has no
// import-time dependency on the app bundle.
const FEMALE_BODY_BASE_ORIGINAL_HEIGHT_PX = 3690
const BASE_SCALE = 80 / FEMALE_BODY_BASE_ORIGINAL_HEIGHT_PX
const avatarFactor = BASE_SCALE * RESOLUTION_HEADROOM
const maleFactor = avatarFactor
const femaleFactor = avatarFactor

const avatars = [
  { runtime: 'avatars/male/male_body_base.png', source: 'maleclotjhbodyAsset_upscayl_3x_digital-art-4x.png', factor: maleFactor },
  { runtime: 'avatars/male/male_head_idle.png', source: 'youngadultheadasset_upscayl_3x_digital-art-4x.png', factor: maleFactor },
  { runtime: 'avatars/male/male_arm.png', source: 'maleHandpng_upscayl_3x_digital-art-4x.png', factor: maleFactor },
  { runtime: 'avatars/male/male_leg.png', source: 'maleLegpng_upscayl_3x_digital-art-4x.png', factor: maleFactor },
  { runtime: 'avatars/female/female_body_base.png', source: 'FEMALEBODYAssets_upscayl_3x_digital-art-4x.png', factor: femaleFactor },
  { runtime: 'avatars/female/female_head_idle.png', source: 'Femaleassetyoriginal_upscayl_3x_digital-art-4x.png', factor: femaleFactor },
  { runtime: 'avatars/female/female_arm.png', source: 'femaleHandASSETS_upscayl_3x_digital-art-4x.png', factor: femaleFactor },
  { runtime: 'avatars/female/female_leg.png', source: 'femalelegasset_upscayl_3x_digital-art-4x.png', factor: femaleFactor },

  // --- Not eagerly loaded today (see createAvatarRig.ts / avatarConfigs.ts
  // — nothing currently imports these paths at all), but still right-sized
  // now against the SAME rendered-scale assumption as their sibling pose,
  // so wiring them into a future sitting/lying slice can't silently
  // reintroduce the same multi-hundred-MB problem this task just fixed.
  // headSad specifically IS loaded eagerly today (createAvatarRig.ts) —
  // see the "ALSO IMPROVE LOADING" change in AvatarRig.ts/createAvatarRig.ts
  // that makes it load lazily instead, on the first actual expression
  // change, rather than unconditionally at startup.
  { runtime: 'avatars/male/male_head_sad.png', source: 'maleSadface_upscayl_3x_digital-art-4x.png', factor: maleFactor },
  { runtime: 'avatars/female/female_head_sad.png', source: 'FEMALSADASSET_upscayl_3x_digital-art-4x.png', factor: femaleFactor },
  { runtime: 'avatars/male/male_body_sitting.png', source: 'malesittingassetv1_upscayl_3x_digital-art-4x.png', factor: maleFactor },
  { runtime: 'avatars/female/female_body_sitting.png', source: 'FEMALESITTING_upscayl_3x_digital-art-4x.png', factor: femaleFactor },
  { runtime: 'avatars/male/male_body_lying.png', source: 'maleLayingAsset_upscayl_2x_digital-art-4x.png', factor: maleFactor },
  { runtime: 'avatars/female/female_body_lying.png', source: 'GIRLLAYINGDOWNASSET_upscayl_2x_digital-art-4x.png', factor: femaleFactor },
]

// --- Interactions ----------------------------------------------------------
// Not wired into any placement yet (no hug-scene calibration exists), so
// there's no real `scale` to derive a factor from the way every other
// category above can. Sized as a generous placeholder — roughly a whole
// avatar's own factor, since a two-person hug sprite is not going to
// render any larger than a couple of single-body heights — clearly
// documented here so whoever wires up the real Hug interaction can tighten
// it once an actual placement scale exists, the same way every other entry
// above already has one.
const interactions = [
  { runtime: 'interactions/interaction_hug_couple.png', source: 'characterHugASSET_upscayl_3x_digital-art-4x.png', factor: femaleFactor * 1.6 },
]

// --- Environment -------------------------------------------------------
// Deliberately NOT shrunk. Unlike every piece above, the backplate always
// renders at the room's full 1600x900 world size (RoomCanvas.tsx sets
// sprite.width/height directly, not a small `scale` fraction) — the same
// zoom/DPI headroom math that shrinks a couch by ~90% would actually ask
// to slightly grow this one. Its decoded footprint (~24MB) was never part
// of the problem; it's already close to right-sized for what it covers.
const environment = []

const ALL = [...environment, ...furniture, ...lighting, ...avatars, ...interactions]

async function run() {
  const rows = []
  for (const entry of ALL) {
    const sourcePath = path.join(SOURCE_DIR, entry.source)
    const runtimePath = path.join(RUNTIME_DIR, entry.runtime)
    const image = sharp(sourcePath)
    const meta = await image.metadata()
    const targetWidth = Math.max(1, Math.round(meta.width * entry.factor))
    const targetHeight = Math.max(1, Math.round(meta.height * entry.factor))

    await image
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(runtimePath)

    rows.push({
      runtime: entry.runtime,
      before: `${meta.width}x${meta.height}`,
      after: `${targetWidth}x${targetHeight}`,
      beforeDecodedMB: (meta.width * meta.height * 4) / 1024 / 1024,
      afterDecodedMB: (targetWidth * targetHeight * 4) / 1024 / 1024,
    })
  }

  console.table(
    rows.map((r) => ({
      asset: r.runtime,
      before: r.before,
      after: r.after,
      'before MB': r.beforeDecodedMB.toFixed(2),
      'after MB': r.afterDecodedMB.toFixed(2),
    })),
  )
  const totalBefore = rows.reduce((sum, r) => sum + r.beforeDecodedMB, 0)
  const totalAfter = rows.reduce((sum, r) => sum + r.afterDecodedMB, 0)
  console.log(`Total decoded (optimized files only): ${totalBefore.toFixed(1)}MB -> ${totalAfter.toFixed(1)}MB`)
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
