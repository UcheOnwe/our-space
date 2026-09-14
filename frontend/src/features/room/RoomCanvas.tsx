import { Application, Assets, Container, Graphics, Sprite } from 'pixi.js'
import type { Ticker } from 'pixi.js'
import { useEffect, useRef } from 'react'
import { AvatarAutonomyDirector } from './avatars/AvatarAutonomyDirector'
import { AvatarMotionController } from './avatars/AvatarMotionController'
import { AvatarRig } from './avatars/AvatarRig'
import { CoupleHugCoordinator } from './avatars/CoupleHugCoordinator'
import { loadAvatarTextures } from './avatars/createAvatarRig'
import { FEMALE_AVATAR_CONFIG, MALE_AVATAR_CONFIG, TARGET_BODY_HEIGHT_WORLD_UNITS } from './avatars/avatarConfigs'
import { HUG_INTERACTION_POINT, HUG_SPRITE_TEXTURE_PATH, HUG_SPRITE_WORLD_SIZE } from './avatars/avatarActivities'
import { clampPan, computeCameraFrame } from './camera'
import { ROOM_WORLD_HEIGHT, ROOM_WORLD_WIDTH } from './constants'
import { createRoomLayers } from './layers'
import { ENVIRONMENT_TEXTURE_PATH, FURNITURE_PLACEMENTS, LAMP_BASE, LAMP_GLOW } from './roomAssets'
import { computeAvatarDepthKey, syncFloorDepth } from './roomDepth'
import type { RoomLayers } from './layers'
import styles from './RoomCanvas.module.css'

// Open rug/floor spot in front of the coffee table and couch (see
// roomAssets.ts for the master-composition-calibrated furniture layout
// this sits between), clear of every placed furniture piece and of the DOM
// "Start Watching" fallback (which lives entirely outside this canvas).
// Each avatar's SPAWN point — where it stands until its own
// AvatarAutonomyDirector chooses its first activity (see the avatar-
// loading block below).
const AVATAR_POSITIONS = {
  male: { x: 580, y: 745 },
  female: { x: 690, y: 745 },
}

/**
 * Loads and places every production furniture piece into the given room
 * layers. Each piece is a plain floor-anchored Sprite (bottom-center, same
 * convention as the avatar rig's BODY_ANCHOR) at its calibrated world
 * position/scale from roomAssets.ts — no per-piece special-casing beyond
 * which of furnitureBack/furnitureFront it belongs on.
 *
 * Loading and placing are deliberately two separate passes. `Assets.load`
 * for each piece resolves independently — if `addChild` happened straight
 * inside the `Promise.all` map callback (as this used to), a piece would
 * join its layer the instant ITS OWN texture finished loading, so z-order
 * would depend on whichever textures happened to decode fastest that page
 * load (network/cache timing), not on FURNITURE_PLACEMENTS' own order.
 * That's exactly the kind of intermittent "chair renders behind the desk"
 * bug a coordinate tweak can't fix — only awaiting every texture first,
 * THEN adding children in the array's own fixed order, makes stacking
 * (e.g. the chair in front of the desk) deterministic every load.
 */
async function loadFurniture(layers: RoomLayers): Promise<Sprite[]> {
  const textures = await Promise.all(FURNITURE_PLACEMENTS.map((placement) => Assets.load(placement.texturePath)))

  return FURNITURE_PLACEMENTS.map((placement, index) => {
    const sprite = new Sprite(textures[index])
    sprite.label = placement.key
    sprite.anchor.set(0.5, 1)
    sprite.position.set(placement.position.x, placement.position.y)
    // Explicit world-unit size, NOT a scale multiplier of the runtime
    // texture's own pixel dimensions — see FurniturePlacement's doc
    // comment in roomAssets.ts for why: this is what keeps the room's
    // visual composition stable regardless of what pixel resolution
    // public/room/'s optimized PNGs happen to ship at.
    sprite.width = placement.width
    sprite.height = placement.height
    ;(placement.layer === 'front' ? layers.furnitureFront : layers.furnitureBack).addChild(sprite)
    return sprite
  })
}

/**
 * Loads and places the lamp's two pieces, grouped into one Container so
 * they always move/depth-sort together. Both the physical base and its
 * light-bleed glow now live in the SAME Y-sorted `avatars` layer the two
 * Room Avatars do (see layers.ts/roomDepth.ts) — a standing/walking avatar
 * needs to be able to render in front of OR behind the lamp depending on
 * where its feet are relative to the lamp's own floor position, which a
 * fixed furniture-layer/lighting-layer split can't express (that's exactly
 * the depth-ordering bug this fixes: the glow used to always render above
 * every avatar, and the base always below, regardless of who was actually
 * standing in front of whom). The glow keeps its own CENTER anchor
 * (rather than bottom-center) and additive blend inside the group — only
 * the group's own zIndex (see roomDepth.ts) participates in sorting, so
 * the glow can never independently float above/below an avatar on its
 * own; it moves exactly with its base. This slice deliberately hardcodes
 * the lamp ON — no interaction, persistence, or day/night state yet.
 */
/** On-brightness the lamp glow renders at while ON — reused by
 * setupLampInteraction below as the "on" end of its fade, so the
 * hardcoded-ON value this slice's predecessor shipped with becomes the
 * toggle's own steady state rather than two separate numbers to keep in
 * sync. */
const LAMP_GLOW_ON_ALPHA = 0.85

async function loadLamp(layers: RoomLayers): Promise<{ base: Sprite; glow: Sprite }> {
  const [baseTexture, glowTexture] = await Promise.all([
    Assets.load(LAMP_BASE.texturePath),
    Assets.load(LAMP_GLOW.texturePath),
  ])

  const group = new Container({ label: 'lamp-group' })

  const base = new Sprite(baseTexture)
  base.label = 'lamp-base'
  base.anchor.set(0.5, 1)
  base.position.set(LAMP_BASE.position.x, LAMP_BASE.position.y)
  // Explicit world-unit size — see LampPlacement's doc comment.
  base.width = LAMP_BASE.width
  base.height = LAMP_BASE.height

  const glow = new Sprite(glowTexture)
  glow.label = 'lamp-glow'
  glow.anchor.set(0.5, 0.5)
  glow.position.set(LAMP_GLOW.position.x, LAMP_GLOW.position.y)
  glow.width = LAMP_GLOW.width
  glow.height = LAMP_GLOW.height
  glow.blendMode = 'add'
  glow.alpha = LAMP_GLOW_ON_ALPHA

  group.addChild(base, glow)
  // The lamp never moves, so its depth key is set once here rather than
  // every tick the way each avatar's is (see tickAvatars below) — its
  // floor/contact point is the base's own position, the same Y every
  // other piece of furniture already places itself at.
  syncFloorDepth({ container: group }, LAMP_BASE.position.y)
  layers.avatars.addChild(group)

  return { base, glow }
}

// How quickly the hover glow eases toward its target alpha each tick —
// applied as `alpha += (target - alpha) * EASE`, the same lightweight
// smoothing approach PresenceOverlay.tsx already uses for the partner
// Mouse Spirit's position. High enough to feel responsive on hover,
// low enough to read as a fade rather than a snap.
const TV_GLOW_EASE = 0.18
// Restrained on purpose — a first pass at a single flat rounded rect (no
// falloff, alpha 0.4) read as a harsh rectangular highlight wash. A second
// pass with the ring alphas below at full strength (this constant at 0.4,
// innermost ring alpha 1) went the opposite direction — the nearly-opaque
// core, additively blended, blew out to a solid white wash over the TV
// rather than a glow. This lower value, combined with the reduced ring
// alphas in buildTvGlow, is what actually reads as tasteful. See
// buildTvGlow's doc comment for why the falloff is built from geometry
// rather than a blur filter.
const TV_GLOW_HOVER_ALPHA = 0.22

/**
 * Builds the TV hover glow as several concentric rounded rects, each one
 * larger and fainter than the last, drawn outermost-first so the
 * strongest ring ends up on top — a cheap, standard "fake soft edge"
 * technique.
 *
 * A `BlurFilter` was tried first to soften a single flat rect instead, but
 * it turned out to combine badly with `blendMode: 'add'` on this engine
 * version: with the filter attached the glow rendered as fully invisible
 * (alpha 0) regardless of blur strength or the object's own alpha — verified
 * directly by forcing alpha to 1 and confirming nothing painted, while the
 * identical shape with no filter at all rendered correctly. Rather than
 * depend on that filter/blend-mode interaction, the falloff here is real
 * geometry, which composites the same way the already-working flat-rect
 * version did.
 */
function buildTvGlow(tvSprite: Sprite): Graphics {
  const renderedWidth = tvSprite.texture.width * tvSprite.scale.x
  const renderedHeight = tvSprite.texture.height * tvSprite.scale.y
  const centerX = tvSprite.position.x - (tvSprite.anchor.x - 0.5) * renderedWidth
  const centerY = tvSprite.position.y - (tvSprite.anchor.y - 0.5) * renderedHeight

  const glow = new Graphics()
  // [padding beyond the TV's own rendered bounds, this ring's own alpha]
  // outermost/faintest ring first, innermost/strongest ring last (on top).
  const rings: Array<[number, number]> = [
    [40, 0.08],
    [26, 0.14],
    [14, 0.24],
    [4, 0.4],
  ]
  for (const [padding, ringAlpha] of rings) {
    glow
      .roundRect(
        centerX - renderedWidth / 2 - padding,
        centerY - renderedHeight / 2 - padding,
        renderedWidth + padding * 2,
        renderedHeight + padding * 2,
        20 + padding * 0.4,
      )
      .fill({ color: 0xfff3c4, alpha: ringAlpha })
  }
  glow.label = 'tv-hover-glow'
  glow.blendMode = 'add'
  glow.alpha = 0
  // Purely decorative light effect — never itself a click/hover target,
  // so it can't shadow the TV sprite's own interaction underneath it.
  glow.eventMode = 'none'
  return glow
}

/**
 * Makes the TV/media console the room's first real interactive furniture
 * piece: a soft additive glow that eases in on hover/touch and back out on
 * leave, an appropriate pointer cursor, and a click/tap that opens Watch
 * Together through the exact same `onOpenWatch` callback the accessible
 * "Start Watching" button uses (see CoupleHomePage.tsx) — not a second,
 * separate navigation path.
 *
 * The glow (see buildTvGlow above) lives in the same `lighting` layer and
 * uses the same additive-blend "light effect" pattern the lamp's own glow
 * already established, not a new visual language. `eventMode: 'static'`
 * on the TV sprite alone — no custom hitArea — is deliberate: the
 * sprite's full rectangular texture bounds (including its own transparent
 * canvas padding) already make a generously-sized, non-pixel-perfect
 * target for both desktop hover precision and mobile tap forgiveness, per
 * the approved scope, without hand-tuning a separate hit rectangle.
 *
 * Returns a cleanup function that removes every listener and the ticker
 * callback this installs.
 */
function setupTvInteraction(
  tvSprite: Sprite,
  layers: RoomLayers,
  application: Application,
  getOnOpenWatch: () => () => void,
): () => void {
  const glow = buildTvGlow(tvSprite)
  layers.lighting.addChild(glow)

  let targetAlpha = 0
  function tickGlow() {
    const diff = targetAlpha - glow.alpha
    glow.alpha = Math.abs(diff) < 0.004 ? targetAlpha : glow.alpha + diff * TV_GLOW_EASE
  }
  application.ticker.add(tickGlow)

  tvSprite.eventMode = 'static'
  tvSprite.cursor = 'pointer'
  function handleOver() {
    targetAlpha = TV_GLOW_HOVER_ALPHA
  }
  function handleOut() {
    targetAlpha = 0
  }
  function handleTap() {
    getOnOpenWatch()()
  }
  tvSprite.on('pointerover', handleOver)
  tvSprite.on('pointerout', handleOut)
  tvSprite.on('pointertap', handleTap)

  return () => {
    application.ticker.remove(tickGlow)
    tvSprite.off('pointerover', handleOver)
    tvSprite.off('pointerout', handleOut)
    tvSprite.off('pointertap', handleTap)
    glow.destroy()
  }
}

// --- Lamp interaction + ON/OFF room ambience -------------------------------
// Same easing rate as the TV's hover glow (TV_GLOW_EASE) — one shared feel
// for "a light effect fading in/out," not a second tuned value.
const LAMP_GLOW_EASE = 0.18
// How dark the room reads with the lamp off — a MULTIPLY blend at this
// alpha darkens everything toward the tint color proportionally (bright
// areas stay relatively bright, dark areas get darker), which is what
// keeps the room "clearly visible... not nearly black" while still
// reading as a real ambience change. Nudged darker than this feature's
// first pass (0.42) after manual review asked for "slightly darker than
// the current OFF state" — the device/window glows added below are what
// keep the room feeling alive at this slightly deeper dim, rather than
// just flatly darker. Tuned by live visual comparison, not computed.
const ROOM_AMBIENCE_OFF_ALPHA = 0.5
// Muted deep plum/navy — the room's own window already shows a dusk/
// night skyline in this same family of tones, so dimming toward it (with
// the lamp itself the one thing NOT reflecting that tint, since it's
// tucked in its own group unaffected by an effects-layer overlay drawn on
// top of everything) reads as "this room at night," not an arbitrary
// gray dim.
const ROOM_AMBIENCE_COLOR = 0x2b2044

/** The lamp's own hover highlight — same concentric-rings "fake soft
 * edge" technique buildTvGlow uses (a BlurFilter combined with
 * blendMode:'add' rendered fully invisible on this engine version — see
 * buildTvGlow's doc comment), just re-sized for the lamp's much smaller
 * footprint; kept as its own small function rather than generalizing
 * buildTvGlow into a shared helper, so tuning one can never accidentally
 * shift the other's already-approved look. */
function buildLampHoverGlow(lampBaseSprite: Sprite): Graphics {
  const renderedWidth = lampBaseSprite.texture.width * lampBaseSprite.scale.x
  const renderedHeight = lampBaseSprite.texture.height * lampBaseSprite.scale.y
  const centerX = lampBaseSprite.position.x - (lampBaseSprite.anchor.x - 0.5) * renderedWidth
  const centerY = lampBaseSprite.position.y - (lampBaseSprite.anchor.y - 0.5) * renderedHeight

  const glow = new Graphics()
  const rings: Array<[number, number]> = [
    [18, 0.1],
    [11, 0.16],
    [5, 0.26],
    [2, 0.4],
  ]
  for (const [padding, ringAlpha] of rings) {
    glow
      .roundRect(
        centerX - renderedWidth / 2 - padding,
        centerY - renderedHeight / 2 - padding,
        renderedWidth + padding * 2,
        renderedHeight + padding * 2,
        14 + padding * 0.4,
      )
      .fill({ color: 0xfff3c4, alpha: ringAlpha })
  }
  glow.label = 'lamp-hover-glow'
  glow.blendMode = 'add'
  glow.alpha = 0
  glow.eventMode = 'none'
  return glow
}

/**
 * A soft rounded-rect "fake glow" — the same concentric-rings technique
 * buildTvGlow/buildLampHoverGlow already use (a real BlurFilter combined
 * with blendMode:'add' rendered fully invisible on this engine version —
 * see buildTvGlow's own doc comment for the direct A/B confirmation),
 * generalized here since the night-ambience glows below are the same
 * shape repeated at different positions/sizes/colors rather than each
 * needing its own bespoke ring math. NOT used for the lamp's own two
 * existing glows above — those were already approved individually and
 * are left exactly as they were built, per the "don't rework unless a
 * real issue" direction.
 */
function buildNightEmissiveGlow(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  color: number,
  label: string,
): Graphics {
  const glow = new Graphics()
  // Padding as a smaller fraction of the region's own size than the
  // TV-hover-glow's fixed pixel paddings use — these regions vary a lot in
  // size (the window's is much bigger than the monitor's), so a
  // proportional falloff keeps each one reading as "glowing at its own
  // edges" rather than the window's version bleeding across half the room.
  const rings: Array<[number, number]> = [
    [width * 0.16, 0.1],
    [width * 0.09, 0.18],
    [width * 0.03, 0.32],
  ]
  for (const [padding, ringAlpha] of rings) {
    glow
      .roundRect(centerX - width / 2 - padding, centerY - height / 2 - padding, width + padding * 2, height + padding * 2, 16)
      .fill({ color, alpha: ringAlpha })
  }
  glow.label = label
  glow.blendMode = 'add'
  glow.alpha = 0
  glow.eventMode = 'none'
  return glow
}

// --- Night-ambience emissive glows (lamp OFF only) --------------------
// Authored world-unit regions for the room's own already-visible light
// sources — no new art, no source-artwork changes, just additive glow
// shapes over the existing production backplate/furniture at their real
// positions (see roomAssets.ts for the furniture placements these are
// measured against). Restrained on purpose per the approved plan ("do not
// make the room neon... do not overpower the room") — these read as a
// gentle presence, not a light source in their own right.
//
// Window: the tall cityscape window against the left wall, above/behind
// the TV console (roomAssets.ts's `tv` sits at x=262 — the window spans
// roughly that same horizontal position, from the wall up to the ceiling
// above it). A cool lavender/pink tint — night-sky city light through
// glass — distinct from the warm lamp/TV glows.
const WINDOW_GLOW_REGION = { centerX: 150, centerY: 220, width: 260, height: 280 }
const WINDOW_GLOW_COLOR = 0xb99bdc

// TV screen: a sub-region of the `tv` sprite's own bounds (world position
// 262,538 — see roomAssets.ts), not its whole console — just the glowing
// screen area near the top of that sprite.
const TV_SCREEN_GLOW_REGION = { centerX: 262, centerY: 470, width: 200, height: 110 }
const TV_SCREEN_GLOW_COLOR = 0xcfe6ff

// Desk monitor: a sub-region of the `desk` sprite's own bounds (world
// position 734,396 — see roomAssets.ts) — the monitor screen baked into
// that same production art, not a separate cutout. Smaller and fainter
// than the TV's own glow per "very restrained" for secondary devices.
const MONITOR_GLOW_REGION = { centerX: 734, centerY: 330, width: 90, height: 60 }
const MONITOR_GLOW_COLOR = 0xcfe6ff
const MONITOR_GLOW_MAX_ALPHA = 0.5 // relative to the TV's own full-strength glow — see the tick function

/**
 * Wires up the lamp as the room's second interactive furniture piece:
 * hover feedback + a click/tap that toggles `lampOn`/`lampOff` ambience —
 * the approved V1 scope (two states only, no day/night system, no
 * persistence). Several things fade together on toggle, all via the same
 * lightweight easing buildTvGlow's own tick already established: the
 * lamp's own "on" glow (hidden when off), a small hover highlight (still
 * available either way — the lamp stays clickable off, to turn back on),
 * a full-room ambience tint drawn in `layers.effects` (see
 * ROOM_AMBIENCE_COLOR/ROOM_AMBIENCE_OFF_ALPHA above), and three restrained
 * additive glows over the room's own already-visible light sources —
 * window, TV screen, desk monitor (see buildNightEmissiveGlow and the
 * WINDOW_GLOW_REGION/TV_SCREEN_GLOW_REGION/MONITOR_GLOW_REGION constants
 * above) — that only appear once the lamp is off, so the room reads as
 * "darker, but still alive at night" rather than uniformly dim. All of it
 * is an overlay over the existing production art, never a change to the
 * art itself, per the approved plan.
 *
 * Same `eventMode: 'static'`, bounds-only hit-testing the TV already
 * established (see setupTvInteraction's own doc comment) — no custom
 * hitArea. The lamp base's rendered footprint (108x117 world units) is
 * smaller than the TV's, so if manual mobile testing finds it too tight a
 * tap target, a dedicated hit-area rectangle is the follow-up; not added
 * speculatively here to avoid an unverified custom-hitArea/anchor
 * interaction under this slice's time budget.
 */
function setupLampInteraction(
  lampBase: Sprite,
  lampGlow: Sprite,
  layers: RoomLayers,
  application: Application,
): () => void {
  const hoverGlow = buildLampHoverGlow(lampBase)
  layers.lighting.addChild(hoverGlow)

  const ambience = new Graphics().rect(0, 0, ROOM_WORLD_WIDTH, ROOM_WORLD_HEIGHT).fill(ROOM_AMBIENCE_COLOR)
  ambience.label = 'room-ambience-overlay'
  ambience.blendMode = 'multiply'
  ambience.alpha = 0
  ambience.eventMode = 'none'
  layers.effects.addChild(ambience)

  // Night-only device/window glows — added AFTER the ambience overlay
  // (layers.effects has no sortableChildren, so this is plain insertion
  // order) so each one composites on TOP of the darkened base, the same
  // way a real lit screen or window reads as its own light source rather
  // than getting dimmed along with everything else.
  const windowGlow = buildNightEmissiveGlow(
    WINDOW_GLOW_REGION.centerX,
    WINDOW_GLOW_REGION.centerY,
    WINDOW_GLOW_REGION.width,
    WINDOW_GLOW_REGION.height,
    WINDOW_GLOW_COLOR,
    'window-night-glow',
  )
  const tvScreenGlow = buildNightEmissiveGlow(
    TV_SCREEN_GLOW_REGION.centerX,
    TV_SCREEN_GLOW_REGION.centerY,
    TV_SCREEN_GLOW_REGION.width,
    TV_SCREEN_GLOW_REGION.height,
    TV_SCREEN_GLOW_COLOR,
    'tv-screen-night-glow',
  )
  const monitorGlow = buildNightEmissiveGlow(
    MONITOR_GLOW_REGION.centerX,
    MONITOR_GLOW_REGION.centerY,
    MONITOR_GLOW_REGION.width,
    MONITOR_GLOW_REGION.height,
    MONITOR_GLOW_COLOR,
    'monitor-night-glow',
  )
  layers.effects.addChild(windowGlow, tvScreenGlow, monitorGlow)

  let lampOn = true
  let hoverTargetAlpha = 0

  function tick() {
    const glowTarget = lampOn ? LAMP_GLOW_ON_ALPHA : 0
    lampGlow.alpha += (glowTarget - lampGlow.alpha) * LAMP_GLOW_EASE
    const ambienceTarget = lampOn ? 0 : ROOM_AMBIENCE_OFF_ALPHA
    ambience.alpha += (ambienceTarget - ambience.alpha) * LAMP_GLOW_EASE
    hoverGlow.alpha += (hoverTargetAlpha - hoverGlow.alpha) * LAMP_GLOW_EASE

    // Only present once the room actually goes dark — these read as
    // "this device/window is lit," which isn't a meaningful thing to see
    // during the room's normal warm/daytime appearance.
    const deviceGlowTarget = lampOn ? 0 : 1
    windowGlow.alpha += (deviceGlowTarget - windowGlow.alpha) * LAMP_GLOW_EASE
    tvScreenGlow.alpha += (deviceGlowTarget - tvScreenGlow.alpha) * LAMP_GLOW_EASE
    monitorGlow.alpha += (deviceGlowTarget * MONITOR_GLOW_MAX_ALPHA - monitorGlow.alpha) * LAMP_GLOW_EASE
  }
  application.ticker.add(tick)

  lampBase.eventMode = 'static'
  lampBase.cursor = 'pointer'
  function handleOver() {
    hoverTargetAlpha = 0.3
  }
  function handleOut() {
    hoverTargetAlpha = 0
  }
  function handleTap() {
    lampOn = !lampOn
  }
  lampBase.on('pointerover', handleOver)
  lampBase.on('pointerout', handleOut)
  lampBase.on('pointertap', handleTap)

  return () => {
    application.ticker.remove(tick)
    lampBase.off('pointerover', handleOver)
    lampBase.off('pointerout', handleOut)
    lampBase.off('pointertap', handleTap)
    hoverGlow.destroy()
    ambience.destroy()
    windowGlow.destroy()
    tvScreenGlow.destroy()
    monitorGlow.destroy()
  }
}

interface RoomCanvasProps {
  /** Opens Watch Together — the exact same callback CoupleHomePage passes
   * to the accessible "Start Watching" button, so the TV's click/tap and
   * that button invoke one shared navigation path, never two. */
  onOpenWatch: () => void
}

/**
 * Mounts and owns one PixiJS Application: the interactive room's canvas.
 * This is the only file in features/room that touches PIXI.* directly —
 * camera.ts and layers.ts stay pure/testable, and this component just
 * wires them together against a real renderer.
 *
 * Renders an empty wrapper (after logging a warning) if WebGL/WebGPU
 * aren't available — a real fallback for old/unusual browsers, not just a
 * testing convenience. Nothing else on Couple Home depends on this
 * succeeding: the accessible "Start Watching" button lives outside it.
 */
export function RoomCanvas({ onOpenWatch }: RoomCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  // The effect below runs once ([] deps — see the StrictMode note just
  // inside it) and reads this ref rather than closing over `onOpenWatch`
  // directly, so the TV's click handler (set up once) always calls
  // whatever the CURRENT prop value is, not whatever it happened to be
  // the moment the room first mounted.
  const onOpenWatchRef = useRef(onOpenWatch)
  useEffect(() => {
    onOpenWatchRef.current = onOpenWatch
  }, [onOpenWatch])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    // Guards the async setup below against React StrictMode's
    // mount→cleanup→mount dance in development: if the effect is torn down
    // before init() resolves, setup must not go on to touch a wrapper
    // that's no longer this effect's.
    let cancelled = false
    let app: Application | null = null
    let resizeObserver: ResizeObserver | null = null
    let avatarCleanup: (() => void) | null = null
    let tvCleanup: (() => void) | null = null
    let lampCleanup: (() => void) | null = null

    async function setup() {
      const application = new Application()
      try {
        await application.init({
          // Only visible in the sliver of a moment before the environment
          // texture loads, or if it fails to — a plausible floor tone
          // rather than a jarring flash of Pixi's default black.
          background: 0xe6ddc9,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          antialias: true,
        })
      } catch (error) {
        console.warn('Our Space: the room canvas could not start.', error)
        return
      }

      if (cancelled || !wrapperRef.current) {
        application.destroy(true)
        return
      }
      app = application
      wrapperRef.current.appendChild(application.canvas)

      // Everything room-related renders inside this one "world" container,
      // which the camera transform below scales/positions as a whole — the
      // room's own scene layout never needs to know about the viewport.
      const world = new Container({ label: 'room-world' })
      application.stage.addChild(world)
      const layers = createRoomLayers(world)

      // --- Production environment backplate ---
      // The master art's own aspect ratio (3344x1882 ≈ 1.777) already
      // matches the 1600x900 world (1.778) to within a fraction of a
      // percent, so filling the world dimensions exactly reads as "the
      // room IS the world" with no visible crop or stretch — not a
      // coincidence; the backplate was produced for this world size.
      let environment: Sprite | null = null
      try {
        const environmentTexture = await Assets.load(ENVIRONMENT_TEXTURE_PATH)
        if (cancelled) return
        environment = new Sprite(environmentTexture)
        environment.label = 'room-environment-backplate'
        environment.width = ROOM_WORLD_WIDTH
        environment.height = ROOM_WORLD_HEIGHT
        layers.environment.addChild(environment)
      } catch (error) {
        console.warn('Our Space: the room backplate could not load.', error)
      }

      // --- Production furniture + lamp ---
      // Independent of the environment/avatars: if any piece fails to
      // load, this fails quietly with a console warning rather than
      // breaking the room the rest of the scene still renders fine
      // without it — same fallback posture as the avatar loading below.
      try {
        const furnitureSprites = await loadFurniture(layers)
        if (cancelled) return
        const lampSprites = await loadLamp(layers)
        if (cancelled) return

        // The TV is the room's first interactive furniture piece — see
        // setupTvInteraction's own docs for the hover-glow/click design
        // and why it shares Couple Home's existing Watch Together
        // navigation rather than inventing a second path.
        const tvSprite = furnitureSprites.find((sprite) => sprite.label === 'tv')
        if (tvSprite) {
          tvCleanup = setupTvInteraction(tvSprite, layers, application, () => onOpenWatchRef.current)
        }

        // The lamp is the second — see setupLampInteraction's own docs for
        // the ON/OFF ambience design.
        lampCleanup = setupLampInteraction(lampSprites.base, lampSprites.glow, layers, application)
      } catch (error) {
        console.warn('Our Space: room furniture could not load.', error)
      }

      // --- Room Avatars ---
      // Runs independently of everything above: if the production art
      // isn't present under public/room/avatars/ yet (or fails to load for
      // any other reason), this fails quietly with a console warning —
      // the room itself must keep working either way, same as the
      // whole-canvas fallback this file already has.
      void (async () => {
        try {
          const [
            { textures: maleTextures, headSadReady: maleHeadSadReady },
            { textures: femaleTextures, headSadReady: femaleHeadSadReady },
            hugTexture,
          ] = await Promise.all([
            loadAvatarTextures(MALE_AVATAR_CONFIG),
            loadAvatarTextures(FEMALE_AVATAR_CONFIG),
            Assets.load(HUG_SPRITE_TEXTURE_PATH),
          ])

          // One shared baseScale, computed from the female's body texture
          // (the relativeScale=1.0 reference) and reused verbatim for the
          // male — never recomputed separately per character. See
          // AvatarRig's constructor docs for why that matters: the two
          // characters' source art isn't cropped to matching canvas sizes,
          // so normalizing each independently would silently cancel out
          // the approved 1.15 male:female height rule instead of applying it.
          // TARGET_BODY_HEIGHT_WORLD_UNITS is the ONE knob that changes
          // when the room itself (not the avatar rig) demands a different
          // overall scale — calibrated here against the real production
          // furniture (see avatarConfigs.ts), never against the two
          // characters' relativeScale values, which stay untouched.
          const baseScale = TARGET_BODY_HEIGHT_WORLD_UNITS / femaleTextures.bodyBase.height
          const male = new AvatarRig(MALE_AVATAR_CONFIG, maleTextures, baseScale)
          const female = new AvatarRig(FEMALE_AVATAR_CONFIG, femaleTextures, baseScale)

          if (cancelled) {
            male.destroy()
            female.destroy()
            return
          }

          // Neither avatar needs its "sad" head art for this standing-room
          // render — see loadAvatarTextures's doc comment. Wire in the real
          // texture the moment it's actually decoded, well after the room's
          // first frame, instead of blocking on it up front.
          void maleHeadSadReady.then((texture) => {
            if (!cancelled) male.setHeadSadTexture(texture)
          })
          void femaleHeadSadReady.then((texture) => {
            if (!cancelled) female.setHeadSadTexture(texture)
          })

          layers.avatars.addChild(male.container, female.container)
          // Static-at-load-time depth key for each avatar's INITIAL spawn
          // position — tickAvatars below keeps this current every frame
          // once either one actually starts walking. Without this, a
          // brand-new avatar would sort using zIndex 0 (Container's
          // default) until its first move, which could misplace it
          // relative to the lamp for that first idle stretch.
          syncFloorDepth({ container: male.container }, AVATAR_POSITIONS.male.y)
          syncFloorDepth({ container: female.container }, AVATAR_POSITIONS.female.y)
          layers.avatars.sortChildren()

          // Each controller owns its rig's world position/facing/limb
          // animation from here on (see AvatarMotionController.ts) — starts
          // idle, at rest, at the same spawn points the static rig used to
          // be positioned at directly. Each AvatarAutonomyDirector then
          // owns WHEN/WHERE that controller walks/sits/lies (see
          // AvatarAutonomyDirector.ts) — production code takes its default
          // real `Math.random`; only tests inject a seeded source.
          const maleMotion = new AvatarMotionController(male, MALE_AVATAR_CONFIG, AVATAR_POSITIONS.male)
          const femaleMotion = new AvatarMotionController(female, FEMALE_AVATAR_CONFIG, AVATAR_POSITIONS.female)
          const maleDirector = new AvatarAutonomyDirector(maleMotion)
          const femaleDirector = new AvatarAutonomyDirector(femaleMotion)

          // --- Couple hug ---
          // The combined sprite stands in for BOTH independent rigs while
          // hugging (see CoupleHugCoordinator.ts) — added once, hidden,
          // positioned at the one authored hug point (avatarActivities.ts)
          // for the whole room's lifetime, the same "static entity, depth
          // key set once" pattern the lamp group already uses.
          const hugSprite = new Sprite(hugTexture)
          hugSprite.label = 'couple-hug'
          hugSprite.anchor.set(0.5, 1)
          hugSprite.position.set(HUG_INTERACTION_POINT.x, HUG_INTERACTION_POINT.y)
          hugSprite.width = HUG_SPRITE_WORLD_SIZE.width
          hugSprite.height = HUG_SPRITE_WORLD_SIZE.height
          hugSprite.visible = false
          syncFloorDepth({ container: hugSprite }, HUG_INTERACTION_POINT.y)
          layers.avatars.addChild(hugSprite)

          const hugCoordinator = new CoupleHugCoordinator(
            { motion: maleMotion, director: maleDirector, rig: male },
            { motion: femaleMotion, director: femaleDirector, rig: female },
            (visible) => {
              hugSprite.visible = visible
            },
          )

          function tickAvatars(ticker: Ticker) {
            const deltaSeconds = ticker.deltaMS / 1000
            maleDirector.update(deltaSeconds)
            femaleDirector.update(deltaSeconds)
            // After both solo directors, per CoupleHugCoordinator's own
            // doc comment — it only ever READS their resulting state
            // while deciding whether to start a hug, and while one IS
            // under way both directors are already paused (see
            // AvatarAutonomyDirector.pause), so this order never double-
            // advances anything.
            hugCoordinator.update(deltaSeconds)

            // Y-based depth sort (see roomDepth.ts) — each avatar's floor/
            // contact point is its own current world position, with the
            // locked female-over-male tie-break applied only while lying
            // (computeAvatarDepthKey) — see roomDepth.ts's own doc
            // comment for why bed lying specifically needs one. Re-synced
            // every tick because this is exactly what needs to change AS
            // an avatar walks past the lamp, not something to set once.
            syncFloorDepth(
              { container: male.container },
              computeAvatarDepthKey(maleMotion.getPosition().y, male.getPose(), 'male'),
            )
            syncFloorDepth(
              { container: female.container },
              computeAvatarDepthKey(femaleMotion.getPosition().y, female.getPose(), 'female'),
            )
            layers.avatars.sortChildren()
          }
          application.ticker.add(tickAvatars)

          avatarCleanup = () => {
            application.ticker.remove(tickAvatars)
          }
        } catch (error) {
          console.warn('Our Space: room avatars could not load.', error)
        }
      })()

      let panX = 0
      let panY = 0
      let maxPanX = 0
      let maxPanY = 0
      let dragging = false
      let lastGlobalX = 0
      let lastGlobalY = 0

      function positionWorld(viewportWidth: number, viewportHeight: number) {
        world.position.set(
          viewportWidth / 2 - (ROOM_WORLD_WIDTH / 2) * world.scale.x + panX,
          viewportHeight / 2 - (ROOM_WORLD_HEIGHT / 2) * world.scale.y + panY,
        )
      }

      function updateCursor() {
        if (environment) environment.cursor = maxPanX > 0 || maxPanY > 0 ? 'grab' : 'default'
      }

      // Recomputes scale + pan limits for the current viewport size — the
      // one place camera.ts's pure math meets the real, measured DOM
      // element. Called once up front and again on every resize.
      function applyCameraFrame() {
        const rect = wrapperRef.current?.getBoundingClientRect()
        if (!rect || rect.width === 0 || rect.height === 0) return

        // Resizes the actual renderer surface to match the wrapper's real
        // pixel size. Without this, the canvas stays at Pixi's default
        // 800x600 and the browser just CSS-stretches it to fit — blurry,
        // and it would silently break the "contain vs. min-scale" camera
        // math below, which must be computed against the true surface
        // size, not a fixed default.
        application.renderer.resize(rect.width, rect.height)

        const frame = computeCameraFrame(rect.width, rect.height)
        maxPanX = frame.maxPanX
        maxPanY = frame.maxPanY
        panX = clampPan(panX, maxPanX)
        panY = clampPan(panY, maxPanY)

        world.scale.set(frame.scale)
        positionWorld(rect.width, rect.height)
        updateCursor()
      }

      // Empty-room panning lives on the environment backplate specifically,
      // not on the stage as a whole. A Room Avatar or furniture sprite
      // (added to layers.avatars/furnitureBack, rendered above the
      // backplate) will be hit-tested first wherever it overlaps the floor
      // — Pixi picks exactly one target per pointer event, front-to-back —
      // so its own pointerdown simply fires instead of this one. Nothing
      // here needs to know avatars/furniture exist yet for that separation
      // to already be correct.
      if (environment) {
        environment.eventMode = 'static'
        environment.on('pointerdown', (event) => {
          if (maxPanX <= 0 && maxPanY <= 0) return
          dragging = true
          lastGlobalX = event.global.x
          lastGlobalY = event.global.y
          if (environment) environment.cursor = 'grabbing'
        })
        environment.on('globalpointermove', (event) => {
          if (!dragging) return
          const rect = wrapperRef.current?.getBoundingClientRect()
          if (!rect) return
          panX = clampPan(panX + (event.global.x - lastGlobalX), maxPanX)
          panY = clampPan(panY + (event.global.y - lastGlobalY), maxPanY)
          lastGlobalX = event.global.x
          lastGlobalY = event.global.y
          positionWorld(rect.width, rect.height)
        })
        function endDrag() {
          dragging = false
          updateCursor()
        }
        environment.on('pointerup', endDrag)
        environment.on('pointerupoutside', endDrag)
      }

      applyCameraFrame()
      resizeObserver = new ResizeObserver(() => applyCameraFrame())
      resizeObserver.observe(wrapperRef.current)
    }

    void setup()

    return () => {
      cancelled = true
      avatarCleanup?.()
      tvCleanup?.()
      lampCleanup?.()
      resizeObserver?.disconnect()
      app?.destroy(true, { children: true })
    }
  }, [])

  // Still hidden from assistive tech, aria-hidden and role="presentation" —
  // the canvas has one real interactive object now (the TV, see
  // setupTvInteraction above), but it's a graphical shortcut to a flow
  // that's already fully reachable and screen-reader-accessible through
  // CoupleHomePage's "Start Watching" button, not a second, independent
  // path assistive tech would need its own way into.
  return <div ref={wrapperRef} className={styles.wrapper} role="presentation" aria-hidden="true" />
}
