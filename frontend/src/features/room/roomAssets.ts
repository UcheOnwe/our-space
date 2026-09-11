/**
 * Production room composition — the real backplate/furniture/lighting art
 * under `public/room/`, replacing Slice 1's placeholder colored rectangles.
 *
 * Every position below is in WORLD units (the same fixed 1600x900 space
 * everything else in this feature uses — see constants.ts), following the
 * same convention RoomCanvas.tsx already used for AVATAR_POSITIONS: plain
 * numbers, not normalized fractions — furniture placement is a one-time
 * manual calibration against the real art, not something that needs to
 * resample against an unknown texture size the way the avatar rig's
 * per-texture attachment fractions do.
 */

export const ENVIRONMENT_TEXTURE_PATH = '/room/environment/room_environment_base.png'

/**
 * `bed`, `coffee_table`, `couch_base`, `desk`, and `tv` were all exported
 * from the same 3072x2048 canvas — a strong signal they share one
 * consistent real-world scale (the artist's camera/output settings for
 * that whole batch), confirmed by comparing their alpha-trimmed visible
 * content against each other. It's kept here purely as that provenance
 * note now — see `width`/`height` below for why it's no longer what
 * actually drives sprite sizing.
 */
export const SHARED_CANVAS_FURNITURE_SCALE = 0.11

export interface FurniturePlacement {
  key: string
  texturePath: string
  /** Bottom-center world position — same floor-anchor convention as the
   * avatar rig's BODY_ANCHOR, since every piece here stands on the floor. */
  position: { x: number; y: number }
  /**
   * Explicit WORLD-UNIT render size (RoomCanvas.tsx sets `sprite.width`/
   * `sprite.height` directly from these, the same pattern the environment
   * backplate already used) — deliberately NOT a `scale` multiplier of
   * whatever the runtime PNG's own pixel dimensions happen to be.
   *
   * That distinction is the fix for a real regression: the mobile-memory
   * optimization pass (Slice 2D) shrank every runtime texture's pixel
   * dimensions, but `scale` here was still being multiplied against
   * `texture.width`/`texture.height` — so every piece silently shrank in
   * WORLD SPACE too, proportionally to how aggressively its own texture
   * got compressed. Runtime texture resolution and in-world visual size
   * are two independent concerns; `width`/`height` below make the actual
   * world-space contract explicit so a future re-optimization of
   * `public/room/` (different pixel dimensions, same or a different
   * headroom multiplier) can never again change how large anything
   * appears in the room.
   *
   * Values below are each piece's ORIGINAL pre-optimization rendered
   * size — native pre-optimization texture pixels * its old `scale`
   * (SHARED_CANVAS_FURNITURE_SCALE for the shared-canvas five, or its own
   * calibrated value for chair/couch-blanket) — i.e. exactly the
   * previously-approved room composition, just expressed directly instead
   * of implicitly through a texture-relative multiplier.
   */
  width: number
  height: number
  /** Which side of the avatars this piece renders on — see layers.ts.
   * Every piece here sits behind the avatars for this slice; `front` is
   * available for a later slice without a scene-graph change. */
  layer: 'back' | 'front'
}

/**
 * Positions below are calibrated against `art-source/upscaledROOMourspace_*`
 * — the approved MASTER composition with every piece already painted in
 * place — not improvised. That file shares the exact same 3344x1882 canvas
 * as the production `room_environment_base.png` backplate, so its pixel
 * positions convert to world units via the same simple factor
 * (`world = masterPixel * 1600/3344`, equivalently `* 900/1882` for Y) as
 * everything else in this room. Each piece's world position below is that
 * master's own bottom-center floor-contact point for the piece, read off a
 * gridded, cropped render of the master (not eyeballed at full-image scale)
 * and then confirmed by compositing the real backplate + cutouts together.
 *
 * The master's own room layout, reconstructed here:
 * - TV + media console: against the LEFT wall, beside the bookshelf.
 * - Desk + chair: along the back wall, between the window and the
 *   photo/corkboard wall — a distinct spot from the TV, not beside it.
 * - Couch + blanket, coffee table, lamp+side-table: the living-room
 *   grouping in the middle of the room, couch facing the TV.
 * - Bed: NOT on the main floor — it's in the separate bedroom alcove
 *   through the doorway on the right (nightstand/lamp/mirror/clothes rack
 *   there are fixed backplate decor, not separate cutouts; only the bed
 *   itself was held out). Missing this the first time around was the
 *   single biggest placement error — the alcove reads as an empty
 *   photo-wall nook in the clean backplate specifically because its one
 *   piece of held-out furniture is missing.
 *
 * The room has a dimetric/isometric LOOK, but these stay plain flat X/Y
 * world coordinates, per the approved constraint (no true isometric
 * coordinate remapping) — matching the master as closely as a flat
 * placement can, not simulating its perspective.
 */
// Array order IS z-order within a layer — RoomCanvas.tsx's loadFurniture
// adds each piece's sprite to furnitureBack/furnitureFront in this exact
// sequence, so a later entry always renders in front of an earlier one
// wherever their sprites overlap. `coffee-table` deliberately comes AFTER
// `desk`/`chair` for that reason: the desk/chair grouping sits further
// back along the wall, and the coffee table (in front of the couch, nearer
// the viewer) needs to render on top of the chair where their sprites
// happen to overlap — otherwise the chair reads as standing in front of/on
// the living-room table instead of at the desk it belongs to. This is a
// pure render-order fix — none of the four positions/scales below changed
// to produce it, only where each entry sits in this list.
export const FURNITURE_PLACEMENTS: FurniturePlacement[] = [
  {
    key: 'couch-base',
    texturePath: '/room/furniture/furniture_couch_base.png',
    position: { x: 744, y: 645 },
    width: 337.92,
    height: 225.28,
    layer: 'back',
  },
  {
    key: 'couch-blanket',
    texturePath: '/room/furniture/furniture_couch_blanket.png',
    position: { x: 828, y: 610 },
    width: 177.33,
    height: 168.91,
    layer: 'back',
  },
  {
    key: 'tv',
    texturePath: '/room/furniture/furniture_tv.png',
    // x nudged right from its originally-calibrated 232 — at that x the
    // console's left edge overlapped the backplate's own fixed potted
    // plant immediately to its left. Y/width/height/anchor all untouched;
    // this is a small horizontal-only correction, not a recalibration.
    position: { x: 262, y: 538 },
    width: 337.92,
    height: 225.28,
    layer: 'back',
  },
  {
    key: 'bed',
    texturePath: '/room/furniture/furniture_bed.png',
    // Not the shared-canvas size — measuring the master against the
    // bedroom alcove's own doorway-frame edges (a clean architectural
    // reference, unlike the open-plan main room) showed the bed reading
    // noticeably smaller there than the shared-canvas assumption predicts,
    // which is exactly why it was protruding past the alcove's walls at
    // that size. The alcove reads as set slightly further back in the
    // room's own isometric depth, which flat X/Y placement can't
    // reproduce by repositioning alone — only a smaller size, calibrated
    // against the master's own doorway width, actually keeps the bed
    // inside it.
    position: { x: 1092, y: 398 },
    width: 294.91,
    height: 196.61,
    layer: 'back',
  },
  {
    key: 'desk',
    texturePath: '/room/furniture/furniture_desk.png',
    position: { x: 734, y: 396 },
    width: 337.92,
    height: 225.28,
    layer: 'back',
  },
  {
    key: 'chair',
    texturePath: '/room/furniture/furniture_chair.png',
    position: { x: 664, y: 410 },
    width: 179.55,
    height: 197.1,
    layer: 'back',
  },
  {
    key: 'coffee-table',
    texturePath: '/room/furniture/furniture_coffee_table.png',
    // Moved right and down from its first placement, closer to and more
    // horizontally centered with the couch (744, 645) — it was reading as
    // belonging to the TV/window side of the room rather than the couch
    // it's meant to sit in front of. Then nudged back (smaller x/y) by a
    // small amount from that — close enough overlapped the couch sprite
    // itself; this keeps it on the rug, still centered with the couch,
    // with a believable gap instead of touching/overlapping it.
    position: { x: 560, y: 560 },
    width: 337.92,
    height: 225.28,
    layer: 'back',
  },
]

export interface LampPlacement {
  texturePath: string
  position: { x: number; y: number }
  /** Explicit world-unit render size — see FurniturePlacement's `width`/
   * `height` doc comment for why this replaced a texture-relative `scale`
   * multiplier. Values are each piece's original pre-optimization
   * rendered size. */
  width: number
  height: number
}

/**
 * Deterministic development state for this slice: the lamp renders ON
 * (base already painted lit, plus the separate glow overlay) — see
 * RoomCanvas.tsx for where that choice is applied. Interaction/
 * persistence/day-night swapping are explicitly out of scope here.
 *
 * `lighting_lamp_base.png` is a standalone lamp (shade, round base, plug
 * cord) — checked at full resolution and against its pixel-identical
 * art-source original, neither contains a side table or basket. The small
 * wooden side table + basket visible next to the couch in the master
 * composition never got exported as a separate cutout (confirmed against
 * the clean backplate too: that spot is bare floor, not baked-in table
 * decor) — there's no production asset this config could point at for
 * that. Sized here as a small floor-standing accent lamp on its own,
 * which is what the actual file contains; see the room report for the
 * missing table/basket piece rather than a workaround here.
 */
export const LAMP_BASE: LampPlacement = {
  texturePath: '/room/lighting/lighting_lamp_base.png',
  position: { x: 520, y: 747 },
  width: 108.63,
  height: 117.27,
}

/** Glow anchors at CENTER, not bottom-center — it's a radial light bleed
 * meant to surround the lamp's shade, not stand on the floor like the
 * base does. Positioned around where the base's lit shade actually is —
 * scaled/offset down to match LAMP_BASE's reduced size, same proportions. */
export const LAMP_GLOW: LampPlacement = {
  texturePath: '/room/lighting/lighting_lamp_glow.png',
  position: { x: 520, y: 688 },
  width: 161.77,
  height: 161.77,
}
