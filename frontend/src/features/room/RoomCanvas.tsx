import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js'
import type { Ticker } from 'pixi.js'
import { useEffect, useRef, useState } from 'react'
import { GamingActivity } from '../gaming/GamingActivity'
import { AmbientEffectsLayer } from './ambient/AmbientEffectsLayer'
import {
  LAURUCH_DESKTOP_AMBIENT,
  LAURUCH_DOOR_AMBIENT,
  LAURUCH_GARAGE_AMBIENT,
  LAURUCH_KITCHEN_AMBIENT,
  LAURUCH_TV_AMBIENT,
} from './ambient/lauruchAmbience'
import type { AmbientEffectSpec } from './ambient/types'
import { AvatarAutonomyDirector } from './avatars/AvatarAutonomyDirector'
import { AvatarMotionController } from './avatars/AvatarMotionController'
import { AvatarRig } from './avatars/AvatarRig'
import { CoupleHugCoordinator } from './avatars/CoupleHugCoordinator'
import { loadAvatarTextures } from './avatars/createAvatarRig'
import { FEMALE_AVATAR_CONFIG, MALE_AVATAR_CONFIG, TARGET_BODY_HEIGHT_WORLD_UNITS } from './avatars/avatarConfigs'
import { HUG_INTERACTION_POINT, HUG_SPRITE_TEXTURE_PATH, HUG_SPRITE_WORLD_SIZE } from './avatars/avatarActivities'
import { MAX_ZOOM_FACTOR, MIN_ZOOM_FACTOR, clampPan, computeCameraFrame, computeMaxPan } from './camera'
import { ROOM_WORLD_HEIGHT, ROOM_WORLD_WIDTH } from './constants'
import { HallwayNavigation } from './HallwayNavigation'
import { RoomCloseUp, RoomCloseUpBackdrop } from './hotspots/RoomCloseUp'
import { useRoomHotspotInteraction } from './hotspots/useRoomHotspotInteraction'
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

// How far above the TV sprite's own center the always-visible icon sits —
// roughly where the screen itself is on the console texture (see
// TV_SCREEN_GLOW_REGION below, a separate/later constant for the night-
// ambience glow, calibrated the same way against this same sprite).
const TV_ICON_Y_OFFSET_FACTOR = 0.22
const TV_ICON_IDLE_ALPHA = 0.92
const TV_ICON_HOVER_SCALE = 1.15
const TV_ICON_LABEL_TEXT = 'Watch'

// Shared "always-visible chip + hover-reveal label" sizing for every
// LaurUch icon (TV's own buildTvIcon below, and buildRoomIcon's generic
// Gaming/Kitchen/Door version) — one set of numbers, not two independently
// tuned ones, so every hotspot in this room reads as the same affordance.
// Matches RoomHotspotIcon.module.css's OWN resting glyph size (27px) at the
// mobile radius below, for visual parity between Couple Home's Pixi icons
// and After Hours'/Cozy Loft's DOM ones — see MOBILE_ICON_BREAKPOINT_PX's
// own doc comment for why "mobile" is a fixed viewport check here rather
// than a live CSS media query.
const ICON_RADIUS_DESKTOP = 20
// Bumped up for touch, same reasoning RoomHotspotIcon.module.css's own doc
// comment already gives for ITS mobile-oriented sizing nudge: "mobile has
// no hover to fall back on" for either discovery or fine-aim, so the
// resting chip itself needs to read as an obviously TappABLE target and be
// easy to actually hit, not just be technically visible. Real mobile
// testing found an earlier, smaller mobile radius (28) still too subtle —
// this needs to be a clearly, visibly bigger control at rest, not merely a
// bigger invisible hit area around a same-sized glyph.
const ICON_RADIUS_MOBILE = 34
// Matches every other room CSS's own `@media (min-width: 701px)` desktop
// cutover (RoomCanvas.module.css, CozyLoftRoom.module.css, AfterHoursRoom.
// module.css, RoomGallery.module.css) — one shared breakpoint, not a
// second number to keep in sync. Checked once at Pixi setup time (see
// isMobileViewport's own call site below), consistent with how this scene
// already treats layout/sizing as fixed for its whole mounted lifetime
// (furniture/environment sizing, camera world size, etc. aren't
// live-recomputed across a breakpoint crossing either — only the camera's
// own pan/zoom continuously reacts to resize, via applyCameraFrame).
const MOBILE_ICON_BREAKPOINT_PX = 700

function isMobileViewport(): boolean {
  return window.innerWidth <= MOBILE_ICON_BREAKPOINT_PX
}

// The translucent chip's own fill/border — one shared visual treatment for
// every LaurUch icon's frame, matching RoomHotspotIcon.module.css's own
// `background: rgba(20, 18, 16, 0.6)` / `border: 1.5px solid rgba(255,
// 255, 255, 0.55)` resting look closely enough to read as the same
// control language (exact color differs slightly since Pixi additive/
// normal blending over the room's varied backdrop reads best with a pure
// black translucent fill here, matched from the TV icon's own
// already-approved chip color rather than the DOM component's brown-tinted
// one).
const ICON_FRAME_FILL_COLOR = 0x000000
const ICON_FRAME_FILL_ALPHA = 0.45
const ICON_FRAME_BORDER_WIDTH = 1.5
const ICON_FRAME_BORDER_COLOR = 0xffffff
const ICON_FRAME_BORDER_ALPHA = 0.55
// Space between the glyph's own circular cap and where the label text
// starts, and between the label text and the frame's rounded right edge —
// together these are what the frame's width animates OUT TO as the label
// reveals (see drawExpandingFrame/labelRevealWidth below), so the frame
// visually contains the label as one continuous pill instead of the label
// merely floating in the space next to a frame that only ever fits the
// glyph (the exact bug real device testing found with the first version
// of this "sideways expansion" — the label slid out to the right, but the
// translucent chip itself never grew to actually contain it).
const ICON_LABEL_GAP = 8
const ICON_LABEL_END_PADDING = 14

/**
 * Redraws `chip` as a stadium/pill shape: a `radius`-sized circular cap at
 * the icon's own local origin (0,0) — where the glyph always sits — grown
 * rightward by `revealWidth` (0 at rest, the full label-sized amount at
 * full reveal). A rounded rect whose corner radius equals half its own
 * height naturally produces two semicircle end-caps, so this is a single
 * shape at every width, not "a circle plus a separate rectangle" — the
 * left cap stays pixel-identical to the resting circle throughout.
 *
 * This exists because a PLAIN Graphics object can't be reshaped by
 * scaling alone (scaling a circle horizontally ovals it, distorting the
 * border thickness/corner roundness) — the shape has to be re-drawn
 * per-frame as it grows, unlike the container's own uniform hover
 * `.scale`, which is fine for a shape whose proportions aren't changing.
 */
function drawExpandingFrame(chip: Graphics, radius: number, revealWidth: number) {
  const height = radius * 2
  const width = height + Math.max(0, revealWidth)
  chip
    .clear()
    .roundRect(-radius, -radius, width, height, radius)
    .fill({ color: ICON_FRAME_FILL_COLOR, alpha: ICON_FRAME_FILL_ALPHA })
    .stroke({ width: ICON_FRAME_BORDER_WIDTH, color: ICON_FRAME_BORDER_COLOR, alpha: ICON_FRAME_BORDER_ALPHA })
}

/**
 * Builds the TV's always-visible discovery icon — a small circular chip
 * (mirroring RoomHotspotIcon.module.css's resting-visible glyph-in-a-chip
 * look, since Couple Home is Pixi and can't use that DOM component
 * directly — see setupTvInteraction's own doc comment) plus a label that
 * reveals SIDEWAYS on hover (matching RoomHotspotIcon.module.css's own
 * "collapsed max-width -> expands to the right" language exactly, rather
 * than the icon's earlier below-the-chip label reveal — see this
 * component's own module doc comment for why Couple Home's Pixi icons
 * must reproduce that behavior rather than literally share the DOM
 * component), eased the exact same way buildTvGlow's own hover glow
 * already is. Idle at TV_ICON_IDLE_ALPHA (never invisible) rather than
 * hover-gated, which is the actual behavior change from the previous
 * hover-only glow discovery mechanism.
 */
function buildTvIcon(tvSprite: Sprite, radius: number): { container: Container; label: Text; chip: Graphics } {
  const renderedWidth = tvSprite.texture.width * tvSprite.scale.x
  const renderedHeight = tvSprite.texture.height * tvSprite.scale.y
  const centerX = tvSprite.position.x - (tvSprite.anchor.x - 0.5) * renderedWidth
  const centerY = tvSprite.position.y - (tvSprite.anchor.y - 0.5) * renderedHeight
  const iconCenterY = centerY - renderedHeight * TV_ICON_Y_OFFSET_FACTOR

  const container = new Container({ label: 'tv-icon' })
  container.position.set(centerX, iconCenterY)
  container.alpha = TV_ICON_IDLE_ALPHA
  container.eventMode = 'none' // purely decorative; the TV sprite itself owns hit-testing

  const chip = new Graphics()
  drawExpandingFrame(chip, radius, 0)
  const glyph = new Text({
    text: '📺',
    style: { fontSize: radius * 1.3 },
  })
  glyph.anchor.set(0.5)
  container.addChild(chip, glyph)

  // Left-anchored, vertically centered on the icon. `chip` (above) is
  // redrawn every tick to grow out and actually CONTAIN this text as one
  // pill — see drawExpandingFrame's own doc comment for why the frame
  // can't just be a fixed circle with the label floating next to it.
  const label = new Text({
    text: TV_ICON_LABEL_TEXT,
    style: { fontSize: 14, fill: 0xffffff, fontWeight: '600' },
  })
  label.anchor.set(0, 0.5)
  label.position.set(centerX + radius + ICON_LABEL_GAP, iconCenterY)
  label.alpha = 0

  return { container, label, chip }
}

/**
 * Makes the TV/media console the room's first real interactive furniture
 * piece: an always-visible discovery icon (see buildTvIcon above) plus
 * the existing soft additive hover glow, a "Watch" label that reveals on
 * hover, an appropriate pointer cursor, and a click/tap that opens Watch
 * Together through the exact same `onOpenWatch` callback the accessible
 * "Start Watching" button uses (see CoupleHomePage.tsx) — not a second,
 * separate navigation path.
 *
 * Previously this discovery mechanism was hover-only (the glow was the
 * ONLY indication the TV was interactive, invisible until a pointer
 * happened to land on it) — replaced here with an always-visible icon so
 * Couple Home's TV interaction matches the same "small icon, always
 * discoverable, brightens on hover/focus" language Cozy Loft's/After
 * Hours' DOM RoomHotspotIcon already uses, adapted to Pixi (a Container
 * positioned at the TV's own world coordinates rather than a DOM
 * element, so it pans/zooms with the Pixi camera automatically — no
 * separate coordinate-sync code needed). The glow/label/icon all live in
 * the same `lighting` layer, which already renders after every other
 * layer (see layers.ts) — the same "always washes over the whole room"
 * placement the hover glow already used.
 *
 * Returns a cleanup function that removes every listener and the ticker
 * callback this installs.
 */
function setupTvInteraction(
  tvSprite: Sprite,
  layers: RoomLayers,
  application: Application,
  getOnOpenWatch: () => () => void,
  radius: number,
): () => void {
  const glow = buildTvGlow(tvSprite)
  const { container: icon, label, chip } = buildTvIcon(tvSprite, radius)
  layers.lighting.addChild(glow, icon, label)

  let targetGlowAlpha = 0
  let targetLabelAlpha = 0
  function tick() {
    const glowDiff = targetGlowAlpha - glow.alpha
    glow.alpha = Math.abs(glowDiff) < 0.004 ? targetGlowAlpha : glow.alpha + glowDiff * TV_GLOW_EASE
    const labelDiff = targetLabelAlpha - label.alpha
    label.alpha = Math.abs(labelDiff) < 0.004 ? targetLabelAlpha : label.alpha + labelDiff * TV_GLOW_EASE
    // The frame itself grows to actually CONTAIN the label as one pill,
    // driven by the SAME eased 0..1 progress as the label's own alpha
    // (label.alpha IS that progress, already eased) — see
    // drawExpandingFrame's own doc comment.
    drawExpandingFrame(chip, radius, label.alpha * (ICON_LABEL_GAP + label.width + ICON_LABEL_END_PADDING))
    icon.scale.set(icon.scale.x + ((targetGlowAlpha > 0 ? TV_ICON_HOVER_SCALE : 1) - icon.scale.x) * TV_GLOW_EASE)
  }
  application.ticker.add(tick)

  tvSprite.eventMode = 'static'
  tvSprite.cursor = 'pointer'
  function handleOver() {
    targetGlowAlpha = TV_GLOW_HOVER_ALPHA
    targetLabelAlpha = 1
  }
  function handleOut() {
    targetGlowAlpha = 0
    targetLabelAlpha = 0
  }
  function handleTap() {
    getOnOpenWatch()()
  }
  tvSprite.on('pointerover', handleOver)
  tvSprite.on('pointerout', handleOut)
  tvSprite.on('pointertap', handleTap)

  return () => {
    application.ticker.remove(tick)
    tvSprite.off('pointerover', handleOver)
    tvSprite.off('pointerout', handleOut)
    tvSprite.off('pointertap', handleTap)
    glow.destroy()
    icon.destroy({ children: true })
    label.destroy()
  }
}

// --- Generic room icon (Gaming/Kitchen/Door) --------------------------------
// A reusable version of buildTvIcon's "always-visible, hover-brightens,
// sideways-label-reveals" language for a hotspot that has no existing
// furniture sprite to own hit-testing (unlike the TV) — the icon container
// itself is the interactive target, positioned at a fixed, hand-measured
// world region rather than a sprite's own bounds. Shared by Gaming (the
// desk monitor's own calibrated region — see MONITOR_GLOW_REGION), Kitchen,
// and Door, each just supplying their own position/glyph/label/callback.
const ROOM_ICON_IDLE_ALPHA = 0.92
const ROOM_ICON_HOVER_SCALE = 1.15

function buildRoomIcon(
  centerX: number,
  centerY: number,
  glyph: string,
  labelText: string,
  radius: number,
): { container: Container; label: Text; chip: Graphics } {
  const container = new Container({ label: `room-icon-${labelText}` })
  container.position.set(centerX, centerY)
  container.alpha = ROOM_ICON_IDLE_ALPHA
  container.eventMode = 'static'
  container.cursor = 'pointer'
  // A generously-sized invisible hit area beyond the visible chip —
  // matches RoomHotspotIcon's own "generous, non-pixel-perfect target"
  // approach for desktop hover precision and touch forgiveness.
  container.hitArea = new Rectangle(-radius * 1.6, -radius * 1.6, radius * 3.2, radius * 3.2)

  const chip = new Graphics()
  drawExpandingFrame(chip, radius, 0)
  const glyphText = new Text({ text: glyph, style: { fontSize: radius * 1.2 } })
  glyphText.anchor.set(0.5)
  container.addChild(chip, glyphText)

  // Left-anchored. `chip` (above) is redrawn every tick to grow out and
  // actually CONTAIN this text as one pill — see drawExpandingFrame's own
  // doc comment for why the frame can't just be a fixed circle with the
  // label floating next to it.
  const label = new Text({
    text: labelText,
    style: { fontSize: 14, fill: 0xffffff, fontWeight: '600' },
  })
  label.anchor.set(0, 0.5)
  label.position.set(centerX + radius + ICON_LABEL_GAP, centerY)
  label.alpha = 0

  return { container, label, chip }
}

/**
 * Adds one always-visible room hotspot icon (same interaction language as
 * setupTvInteraction: always shown, brightens + reveals a label sideways
 * on hover, click/tap to activate) that opens a close-up via `onActivate`
 * — the caller decides what that means (enter a DOM close-up state, in
 * RoomCanvas's case — see the HOTSPOTS/useRoomHotspotInteraction wiring
 * in the component below).
 */
function setupRoomIconInteraction(
  layers: RoomLayers,
  application: Application,
  centerX: number,
  centerY: number,
  glyph: string,
  labelText: string,
  getOnActivate: () => () => void,
  radius: number,
): () => void {
  const { container: icon, label, chip } = buildRoomIcon(centerX, centerY, glyph, labelText, radius)
  layers.lighting.addChild(icon, label)

  let targetLabelAlpha = 0
  function tick() {
    const labelDiff = targetLabelAlpha - label.alpha
    label.alpha = Math.abs(labelDiff) < 0.004 ? targetLabelAlpha : label.alpha + labelDiff * TV_GLOW_EASE
    // The frame itself grows to actually CONTAIN the label as one pill —
    // see drawExpandingFrame's own doc comment.
    drawExpandingFrame(chip, radius, label.alpha * (ICON_LABEL_GAP + label.width + ICON_LABEL_END_PADDING))
    const targetScale = targetLabelAlpha > 0 ? ROOM_ICON_HOVER_SCALE : 1
    const newScale = icon.scale.x + (targetScale - icon.scale.x) * TV_GLOW_EASE
    icon.scale.set(newScale)
  }
  application.ticker.add(tick)

  function handleOver() {
    targetLabelAlpha = 1
  }
  function handleOut() {
    targetLabelAlpha = 0
  }
  function handleTap() {
    getOnActivate()()
  }
  icon.on('pointerover', handleOver)
  icon.on('pointerout', handleOut)
  icon.on('pointertap', handleTap)

  return () => {
    application.ticker.remove(tick)
    icon.off('pointerover', handleOver)
    icon.off('pointerout', handleOut)
    icon.off('pointertap', handleTap)
    icon.destroy({ children: true })
    label.destroy()
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

// The Gaming icon's own position — DELIBERATELY separate from
// MONITOR_GLOW_REGION above (which stays exactly as it was, per "don't
// reposition anything without a genuinely identified issue" — it's a
// different effect, the lamp-off night ambience glow, not this icon).
// Real device testing found the icon sitting too low, around the chair/
// desk-surface area rather than on the monitor itself — re-measured
// directly against furniture_desk.png (1183x788): the screen's own
// content (cropped/verified directly) centers at roughly (700, 200) in
// that texture, i.e. x_frac=0.592, y_frac=0.254 of the sprite's own
// rendered box. Converting through the desk sprite's actual placement
// (roomAssets.ts: position 734,396, anchor bottom-center, width 337.92,
// height 225.28 — so its rendered box spans x:[565.04, 902.96],
// y:[170.72, 396]) gives world coordinates of roughly (765, 228), well
// above and slightly right of the old (734, 330) — squarely on the
// monitor screen rather than near the desk surface below it.
const GAMING_ICON_POSITION = { x: 765, y: 228 }

// Kitchen (fridge/stove) and Door icon world positions — measured
// directly against public/room/environment/room_environment_base.png
// (3344x1882, the same master the Pixi environment sprite renders at
// full world size, so source-pixel/3344*1600 and /1882*900 convert
// directly to world units): the fridge/stove cluster sits at roughly
// (3060, 776) source px, the front door at roughly (2374, 1438) source
// px, in that background art.
const KITCHEN_ICON_POSITION = { x: 1464, y: 371 }
const DOOR_ICON_POSITION = { x: 1136, y: 687 }

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

// Runtime copies of art-source/LaurUch/*.png — see
// scripts/optimize-lauruch-assets.mjs for how these are generated
// (re-encoded to quality JPEG at full resolution, source PNGs untouched).
// These are CLOSE-UP destinations reached from the existing Pixi main
// room below — the main room's own environment/furniture/avatar
// rendering is completely unchanged; only what happens after a hotspot
// tap is new.
const LAURUCH_CLOSEUPS: Record<string, { label: string; closeUpSrc: string; ambient: AmbientEffectSpec[] }> = {
  tv: { label: 'Watch', closeUpSrc: '/lauruch/tv-closeup.jpg', ambient: LAURUCH_TV_AMBIENT },
  gaming: { label: 'Play', closeUpSrc: '/lauruch/desktop-closeup.jpg', ambient: LAURUCH_DESKTOP_AMBIENT },
  kitchen: { label: 'Kitchen', closeUpSrc: '/lauruch/kitchen-closeup.jpg', ambient: LAURUCH_KITCHEN_AMBIENT },
  door: { label: 'Door', closeUpSrc: '/lauruch/door-closeup.jpg', ambient: LAURUCH_DOOR_AMBIENT },
  garage: { label: 'Garage', closeUpSrc: '/lauruch/garage.jpg', ambient: LAURUCH_GARAGE_AMBIENT },
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
  // Warms the browser's own image cache for every LaurUch close-up up
  // front, not lazily per-hotspot — real-device testing found a brief
  // flash of the Pixi canvas (avatars included) showing through a
  // freshly-switched close-up (Door -> Garage especially, which has no
  // "entering" phase of its own to piggyback a preload on — see
  // switchHotspot's own doc comment) while its image was still being
  // fetched/decoded for the first time. `RoomCloseUp`'s own `<img>` will
  // resolve straight from cache once this has already run, regardless of
  // which hotspot/direction actually triggers it. A plain `Image()`
  // fetch — no DOM insertion needed, and CozyLoftRoom.tsx's own
  // preload-video pattern is the same "warm the fetch/decode early"
  // idea, just for a resource type that already has a real HTML element
  // to attach to.
  useEffect(() => {
    for (const closeUp of Object.values(LAURUCH_CLOSEUPS)) {
      const image = new Image()
      image.src = closeUp.closeUpSrc
    }
  }, [])
  // Shows the shared GamingActivity as a DOM overlay above the canvas —
  // see setupRoomIconInteraction's own doc comment for why Couple Home
  // reuses the exact same Gaming implementation as Cozy Loft/After Hours
  // rather than a Pixi-native one. This is the SAME reusable room/
  // entering/closeup/leaving state machine CozyLoftRoom.tsx/
  // AfterHoursRoom.tsx already use — knows nothing about Pixi, so it
  // works identically here even though the "room" itself is a canvas
  // rather than a DOM world.
  const { phase, enterHotspot, leaveHotspot, switchHotspot } = useRoomHotspotInteraction()
  // The Pixi setup effect below runs once ([] deps — see the StrictMode
  // note just inside it) and reads these refs rather than closing over
  // the hook's return values directly, so each icon's tap handler (set up
  // once) always calls whatever is CURRENT, not whatever it happened to
  // be the moment the room first mounted (enterHotspot/leaveHotspot are
  // plain functions from useRoomHotspotInteraction, not memoized, so they
  // get a new identity every render).
  const onOpenWatchRef = useRef(onOpenWatch)
  useEffect(() => {
    onOpenWatchRef.current = onOpenWatch
  }, [onOpenWatch])
  const enterHotspotRef = useRef(enterHotspot)
  useEffect(() => {
    enterHotspotRef.current = enterHotspot
  }, [enterHotspot])

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
    let gamingCleanup: (() => void) | null = null
    let kitchenCleanup: (() => void) | null = null
    let doorCleanup: (() => void) | null = null
    let lampCleanup: (() => void) | null = null
    let pinchCleanup: (() => void) | null = null

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

      // Checked once for this canvas's whole mounted lifetime — see
      // isMobileViewport's own doc comment for why a live-responsive
      // version isn't needed here, consistent with how the rest of this
      // scene already treats content sizing as fixed rather than
      // continuously breakpoint-aware.
      const iconRadius = isMobileViewport() ? ICON_RADIUS_MOBILE : ICON_RADIUS_DESKTOP

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
        // setupTvInteraction's own docs for the hover-glow/click design.
        // Tapping it now enters the same room/entering/closeup/leaving
        // state machine every other hotspot uses (see enterHotspotRef)
        // rather than jumping straight to Watch Together — the TV close-up
        // (lauruch/tv-closeup.jpg) shows first, matching Cozy Loft/After
        // Hours' own TV flow; onOpenWatch itself is now called from that
        // close-up's own "Continue with YouTube" button (see this
        // component's render).
        const tvSprite = furnitureSprites.find((sprite) => sprite.label === 'tv')
        if (tvSprite) {
          tvCleanup = setupTvInteraction(
            tvSprite,
            layers,
            application,
            () => () => enterHotspotRef.current('tv'),
            iconRadius,
          )
        }

        // The lamp is the second — see setupLampInteraction's own docs for
        // the ON/OFF ambience design.
        lampCleanup = setupLampInteraction(lampSprites.base, lampSprites.glow, layers, application)
      } catch (error) {
        console.warn('Our Space: room furniture could not load.', error)
      }

      // Gaming/Kitchen/Door icons — independent of the furniture load
      // above (each is positioned at a fixed, hand-measured world region,
      // not a furniture sprite's own bounds — see setupRoomIconInteraction's
      // doc comment), so they're set up unconditionally rather than only
      // on a successful furniture load. Each just enters the shared
      // hotspot state machine for its own id — Garage has no icon of its
      // own here, it's reached via the Door close-up's "Other Spaces"
      // navigation (see this component's render).
      gamingCleanup = setupRoomIconInteraction(
        layers,
        application,
        GAMING_ICON_POSITION.x,
        GAMING_ICON_POSITION.y,
        '🎮',
        'Play',
        () => () => enterHotspotRef.current('gaming'),
        iconRadius,
      )
      kitchenCleanup = setupRoomIconInteraction(
        layers,
        application,
        KITCHEN_ICON_POSITION.x,
        KITCHEN_ICON_POSITION.y,
        '🍳',
        'Kitchen',
        () => () => enterHotspotRef.current('kitchen'),
        iconRadius,
      )
      doorCleanup = setupRoomIconInteraction(
        layers,
        application,
        DOOR_ICON_POSITION.x,
        DOOR_ICON_POSITION.y,
        '🚪',
        'Door',
        () => () => enterHotspotRef.current('door'),
        iconRadius,
      )

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
      // The cover-fit scale from computeCameraFrame, BEFORE the pinch
      // zoom multiplier below is applied on top of it — recomputed on
      // every resize, never touched by zooming itself.
      let baseScale = MIN_ZOOM_FACTOR
      let zoomFactor = MIN_ZOOM_FACTOR

      function positionWorld(viewportWidth: number, viewportHeight: number) {
        world.position.set(
          viewportWidth / 2 - (ROOM_WORLD_WIDTH / 2) * world.scale.x + panX,
          viewportHeight / 2 - (ROOM_WORLD_HEIGHT / 2) * world.scale.y + panY,
        )
      }

      function updateCursor() {
        if (environment) environment.cursor = maxPanX > 0 || maxPanY > 0 ? 'grab' : 'default'
      }

      // Applies baseScale*zoomFactor and re-derives pan bounds for THAT
      // scale (not just the base one) — shared by both a plain resize and
      // a pinch-zoom change, so pan limits are always correct for
      // whatever the room is actually scaled to right now.
      function applyScale(viewportWidth: number, viewportHeight: number) {
        const scale = baseScale * zoomFactor
        maxPanX = computeMaxPan(ROOM_WORLD_WIDTH * scale, viewportWidth)
        maxPanY = computeMaxPan(ROOM_WORLD_HEIGHT * scale, viewportHeight)
        panX = clampPan(panX, maxPanX)
        panY = clampPan(panY, maxPanY)
        world.scale.set(scale)
        positionWorld(viewportWidth, viewportHeight)
        updateCursor()
      }

      // Recomputes the base cover-fit scale for the current viewport size
      // — the one place camera.ts's pure math meets the real, measured DOM
      // element. Called once up front and again on every resize. Does NOT
      // reset zoomFactor — resizing (e.g. a phone rotation) shouldn't
      // silently undo a pinch the user just did.
      function applyCameraFrame() {
        const wrapper = wrapperRef.current
        if (!wrapper) return
        // `offsetWidth`/`offsetHeight` (layout box size), NOT
        // `getBoundingClientRect()` (post-transform, rendered size) — see
        // useRoomCameraGestures.ts's own doc comment on `currentViewport`
        // for the exact bug this fixes: a freshly-mounted room's wrapper
        // can sit inside RoomExperience.module.css's `.roomSlot` while its
        // own `room-expand-in` CSS transform animation (scale 0.92 -> 1)
        // is still running. Sampling the TRANSFORMED size at that instant
        // bakes a too-small viewport into computeCameraFrame below, and
        // since a pure CSS transform never changes layout, the
        // ResizeObserver watching this element never fires once the
        // animation ends to correct it — the room stays visibly
        // mis-fitted (exposed background at the edges) until something
        // else remounts it fresh (a reload, which never hits this
        // animation at all — exactly the reported symptom).
        // `offsetWidth`/`offsetHeight` reflect the element's own LAYOUT
        // size, which an ancestor's `transform` never touches.
        const width = wrapper.offsetWidth
        const height = wrapper.offsetHeight
        if (width === 0 || height === 0) return

        // Resizes the actual renderer surface to match the wrapper's real
        // pixel size. Without this, the canvas stays at Pixi's default
        // 800x600 and the browser just CSS-stretches it to fit — blurry,
        // and it would silently break the cover-fit/min-scale camera math
        // below, which must be computed against the true surface size,
        // not a fixed default.
        application.renderer.resize(width, height)

        baseScale = computeCameraFrame(width, height).scale
        applyScale(width, height)
      }

      // Rescales around a fixed SCREEN-space focal point (the pinch
      // gesture's own midpoint) rather than the world's center — the
      // standard "zoom that keeps the point under your fingers steady"
      // calculation: read which world-space point currently sits under
      // the focal point at the OLD scale, then choose the new pan so that
      // same world point still sits under the focal point at the NEW
      // scale. `focalX`/`focalY` are canvas-relative (see the pointer
      // handlers below), matching positionWorld's own coordinate space.
      function applyZoom(nextZoomFactor: number, focalX: number, focalY: number) {
        const rect = wrapperRef.current?.getBoundingClientRect()
        if (!rect) return

        const oldScale = baseScale * zoomFactor
        const worldPosXOld = rect.width / 2 - (ROOM_WORLD_WIDTH / 2) * oldScale + panX
        const worldPosYOld = rect.height / 2 - (ROOM_WORLD_HEIGHT / 2) * oldScale + panY
        const worldX = (focalX - worldPosXOld) / oldScale
        const worldY = (focalY - worldPosYOld) / oldScale

        zoomFactor = Math.max(MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM_FACTOR, nextZoomFactor))
        const newScale = baseScale * zoomFactor
        maxPanX = computeMaxPan(ROOM_WORLD_WIDTH * newScale, rect.width)
        maxPanY = computeMaxPan(ROOM_WORLD_HEIGHT * newScale, rect.height)

        const desiredWorldPosX = focalX - worldX * newScale
        const desiredWorldPosY = focalY - worldY * newScale
        panX = clampPan(desiredWorldPosX - rect.width / 2 + (ROOM_WORLD_WIDTH / 2) * newScale, maxPanX)
        panY = clampPan(desiredWorldPosY - rect.height / 2 + (ROOM_WORLD_HEIGHT / 2) * newScale, maxPanY)

        world.scale.set(newScale)
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
          // A pinch (2+ fingers, tracked natively below) owns the gesture
          // instead — see handlePointerDownNative, which also cancels an
          // in-progress single-finger drag the instant a second finger
          // lands, so the two mechanisms never fight over panX/panY.
          if (activePointers.size >= 2) return
          if (maxPanX <= 0 && maxPanY <= 0) return
          dragging = true
          lastGlobalX = event.global.x
          lastGlobalY = event.global.y
          if (environment) environment.cursor = 'grabbing'
        })
        environment.on('globalpointermove', (event) => {
          if (!dragging || activePointers.size >= 2) return
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

      // --- Pinch-to-zoom ---
      // Plain native Pointer Events on the real canvas DOM element, not a
      // Pixi-level mechanism — Pixi's own event system hit-tests one
      // sprite at a time, which fits single-pointer drag (above) but not
      // "track two simultaneous fingers regardless of what's under each
      // one." Desktop is unaffected: a mouse only ever produces one
      // pointer, so `activePointers.size` never reaches 2 there.
      const activePointers = new Map<number, { x: number; y: number }>()
      let pinchStartDistance = 0
      let pinchStartZoom = MIN_ZOOM_FACTOR

      function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
        return Math.hypot(a.x - b.x, a.y - b.y)
      }

      function handlePointerDownNative(event: PointerEvent) {
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (activePointers.size === 2) {
          const [a, b] = Array.from(activePointers.values())
          pinchStartDistance = pointerDistance(a, b)
          pinchStartZoom = zoomFactor
          // A pinch starting mid-drag must not leave the single-finger
          // pan still "live" underneath it once the pinch ends.
          dragging = false
        }
      }

      function handlePointerMoveNative(event: PointerEvent) {
        if (!activePointers.has(event.pointerId)) return
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (activePointers.size !== 2 || pinchStartDistance <= 0) return

        const rect = wrapperRef.current?.getBoundingClientRect()
        if (!rect) return
        const [a, b] = Array.from(activePointers.values())
        const newDistance = pointerDistance(a, b)
        const midClientX = (a.x + b.x) / 2
        const midClientY = (a.y + b.y) / 2
        applyZoom(pinchStartZoom * (newDistance / pinchStartDistance), midClientX - rect.left, midClientY - rect.top)
      }

      function handlePointerEndNative(event: PointerEvent) {
        activePointers.delete(event.pointerId)
        if (activePointers.size < 2) {
          pinchStartDistance = 0
        }
      }

      const canvas = application.canvas
      canvas.addEventListener('pointerdown', handlePointerDownNative)
      canvas.addEventListener('pointermove', handlePointerMoveNative)
      canvas.addEventListener('pointerup', handlePointerEndNative)
      canvas.addEventListener('pointercancel', handlePointerEndNative)
      canvas.addEventListener('pointerleave', handlePointerEndNative)
      pinchCleanup = () => {
        canvas.removeEventListener('pointerdown', handlePointerDownNative)
        canvas.removeEventListener('pointermove', handlePointerMoveNative)
        canvas.removeEventListener('pointerup', handlePointerEndNative)
        canvas.removeEventListener('pointercancel', handlePointerEndNative)
        canvas.removeEventListener('pointerleave', handlePointerEndNative)
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
      gamingCleanup?.()
      kitchenCleanup?.()
      doorCleanup?.()
      lampCleanup?.()
      pinchCleanup?.()
      resizeObserver?.disconnect()
      app?.destroy(true, { children: true })
    }
  }, [])

  const showCloseUp = phase.status === 'closeup' || phase.status === 'leaving'
  const activeHotspotId = phase.status !== 'room' ? phase.hotspotId : undefined
  const activeCloseUp = activeHotspotId ? LAURUCH_CLOSEUPS[activeHotspotId] : undefined

  // The OUTGOING close-up of a direct switch (Door -> Garage, or back),
  // kept mounted as a purely visual, non-interactive backdrop
  // (RoomCloseUpBackdrop) directly UNDERNEATH the incoming one for the
  // switch animation's own duration — see RoomCloseUpBackdrop's own doc
  // comment for exactly why this exists: real-device testing still found
  // an occasional flash of the room/avatars through a direct switch even
  // with the incoming close-up's own opacity/background already fixed,
  // which points at paint/compositing timing (GPU layer promotion for a
  // freshly-mounted element, in particular) rather than anything CSS
  // alone can guarantee away. The outgoing close-up's own image is
  // PROVABLY already decoded and painted — it was the visible one an
  // instant ago — so keeping it mounted as a safety net removes that
  // risk structurally instead of trying to out-tune it with more CSS.
  //
  // Detected and applied DURING render (comparing against a ref of the
  // previous render's own hotspotId, React's own documented pattern for
  // "adjust state during rendering") rather than in a useEffect — an
  // effect runs AFTER the DOM has already committed/painted once, which
  // would let the browser paint a frame with ONLY the incoming close-up
  // before the backdrop effect even runs; doing it during render means
  // React discards that in-between render entirely and the backdrop is
  // present from the very first commit of the switch.
  const [outgoingHotspotId, setOutgoingHotspotId] = useState<string | null>(null)
  const previousActiveHotspotIdRef = useRef<string | undefined>(undefined)
  const viaSwitch = phase.status === 'closeup' && phase.viaSwitch === true
  // Reading/writing a ref during render is React's own documented pattern
  // for exactly this — "storing information from previous renders" (see
  // react.dev/reference/react/useState#storing-information-from-previous-renders)
  // — not a mistake; a generic lint rule can't tell this apart from an
  // actual misuse, since the ref here isn't used for anything the JSX
  // below reads directly (only `setOutgoingHotspotId`'s resulting STATE
  // is).
  // eslint-disable-next-line react/refs
  if (activeHotspotId !== previousActiveHotspotIdRef.current) {
    // eslint-disable-next-line react/refs
    if (viaSwitch && previousActiveHotspotIdRef.current && activeHotspotId) {
      // eslint-disable-next-line react/refs
      setOutgoingHotspotId(previousActiveHotspotIdRef.current)
    }
    previousActiveHotspotIdRef.current = activeHotspotId
  }
  const outgoingCloseUp = outgoingHotspotId ? LAURUCH_CLOSEUPS[outgoingHotspotId] : undefined
  // Removed after the switch's own visual duration — see
  // RoomCloseUp.module.css's `.switching` keyframe (300ms); a small
  // buffer keeps this from being torn down a frame before the incoming
  // close-up has visibly finished settling.
  useEffect(() => {
    if (outgoingHotspotId === null) return
    const timeoutId = window.setTimeout(() => setOutgoingHotspotId(null), 350)
    return () => window.clearTimeout(timeoutId)
  }, [outgoingHotspotId])

  // The Door close-up's "Other Spaces" navigation — reuses the exact same
  // HallwayNavigation/destination-list component After Hours' hallway
  // uses, just with LaurUch's own (currently: one) real destination.
  //
  // A DIRECT close-up-to-close-up transition (switchHotspot), not the
  // earlier leave-then-re-enter-after-a-timeout approach this replaced:
  // that older version called leaveHotspot() (which starts the normal
  // 'leaving' -> 650ms timeout -> 'room' sequence) and then re-entered
  // 'garage' from a SECOND timeout racing the first — which meant phase
  // genuinely passed through `{status: 'room'}` for a moment (the main
  // room would flash visible between Door and Garage on a slow enough
  // frame) and needed a brittle "+50ms" buffer to even reliably win that
  // race. switchHotspot changes hotspotId in ONE synchronous update while
  // staying in `'closeup'` the whole time — phase.status is never 'room'
  // at any point in this transition, by construction, not by timing luck.
  // The visual "short zoom" handoff instead comes from RoomCloseUp being
  // re-keyed by hotspotId below, which makes React remount it and replay
  // its OWN existing enter animation — reusing the same transition
  // language the room already uses elsewhere, not a new one.
  function goToGarageFromDoor() {
    switchHotspot('garage', 'door')
  }
  const otherSpacesDestinations = [{ id: 'garage', label: 'Garage', icon: '🚗', onSelect: goToGarageFromDoor }]

  // Only set once a close-up's phase actually records where it was
  // switched in from (see switchHotspot/cameFrom) — every other close-up
  // keeps RoomCloseUp's own default "Back to Room" wording.
  const cameFrom = phase.status === 'closeup' ? phase.cameFrom : undefined
  const backLabel = cameFrom ? `Back to ${LAURUCH_CLOSEUPS[cameFrom]?.label ?? 'Room'}` : undefined
  // 'switch' (opaque-only, no room-flash) for a close-up reached directly
  // from another one, in EITHER direction — see types.ts's own doc
  // comment on `viaSwitch` for why this is a separate flag from
  // `cameFrom` (which is absent on the Garage -> Door return trip, even
  // though THAT mount still needs this same treatment). The normal
  // fade-in otherwise — see RoomCloseUp.tsx's own doc comment on
  // `transitionStyle`.
  const transitionStyle = viaSwitch ? 'switch' : 'enter'

  return (
    <div className={styles.outer}>
      {/* Still hidden from assistive tech, aria-hidden and
          role="presentation" — the canvas has several interactive objects
          now (TV, Gaming, Kitchen, Door), but each is a graphical
          shortcut to a close-up that's already fully reachable and
          screen-reader-accessible another way (the close-up overlay
          below, which is NOT aria-hidden, has its own real buttons), not
          a second, independent path assistive tech would need its own
          way into. */}
      <div ref={wrapperRef} className={styles.wrapper} role="presentation" aria-hidden="true" />

      {/* The outgoing close-up's own opaque, non-interactive backdrop —
          rendered BEFORE (so it paints underneath) the incoming
          RoomCloseUp below. See outgoingHotspotId's own doc comment. */}
      {outgoingCloseUp && <RoomCloseUpBackdrop imageSrc={outgoingCloseUp.closeUpSrc} />}

      {/* The shared close-up shell — same component Cozy Loft/After Hours
          use, just with LaurUch's own images/ambience. Not portaled itself
          (RoomCloseUp's own "Back to Room" button already portals to
          <body>, which is what actually needs to escape this component's
          transformed ancestors). */}
      {showCloseUp && activeHotspotId && activeCloseUp && (
        <RoomCloseUp
          // Re-keyed by hotspotId so a direct close-up-to-close-up switch
          // (goToGarageFromDoor -> switchHotspot) forces a real remount —
          // see goToGarageFromDoor's own doc comment for why that's what
          // supplies this transition's visual "short zoom," reusing
          // RoomCloseUp's existing mount animation rather than a new one.
          // Never changes for the normal room->closeup->leaving->room
          // flow (hotspotId is stable across those phases), so nothing
          // about the existing per-hotspot animation is affected.
          key={activeHotspotId}
          imageSrc={activeCloseUp.closeUpSrc}
          label={activeCloseUp.label}
          onBack={leaveHotspot}
          backLabel={backLabel}
          isLeaving={phase.status === 'leaving'}
          transitionStyle={transitionStyle}
          wideActivity={activeHotspotId === 'gaming'}
          ambientEffects={<AmbientEffectsLayer effects={activeCloseUp.ambient} />}
          // Physically accepted on TV first (see RoomCloseUp's own
          // `enableDirectDrag` doc comment); this ONE shared call site
          // renders every LaurUch close-up (TV/Gaming/Kitchen/Door/
          // Garage), so promoting it here covers all of them without a
          // per-hotspot condition.
          enableDirectDrag
        >
          {activeHotspotId === 'tv' && <LauruchTvActivity onOpenWatch={() => onOpenWatchRef.current()} />}
          {activeHotspotId === 'gaming' && <GamingActivity />}
          {activeHotspotId === 'door' && <HallwayNavigation destinations={otherSpacesDestinations} />}
          {/* Kitchen/Garage: no activity children at all — pure
              exploration spaces, intentionally with no gameplay/
              customization UI yet. */}
        </RoomCloseUp>
      )}
    </div>
  )
}

/** Identical in spirit to CozyLoftRoom's/AfterHoursRoom's own TvActivity —
 * a doorway into the EXISTING Watch Together capability, not a
 * reimplementation. Kept local (not the shared component) since each
 * room's version is a tiny, already-duplicated three-line panel — see
 * AfterHoursRoom.tsx's own doc comment on this same tradeoff. */
function LauruchTvActivity({ onOpenWatch }: { onOpenWatch: () => void }) {
  return (
    <div className={styles.activityPanel}>
      <h3 className={styles.activityTitle}>Watch Together</h3>
      <button type="button" className={styles.activityPrimaryButton} onClick={onOpenWatch}>
        ▶ Continue with YouTube
      </button>
      <p className={styles.activityNote}>More providers coming soon.</p>
    </div>
  )
}
