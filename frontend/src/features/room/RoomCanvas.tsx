import { Application, Assets, Container, Graphics, Sprite } from 'pixi.js'
import type { Ticker } from 'pixi.js'
import { useEffect, useRef } from 'react'
import { AvatarAutonomyDirector } from './avatars/AvatarAutonomyDirector'
import { AvatarMotionController } from './avatars/AvatarMotionController'
import { AvatarRig } from './avatars/AvatarRig'
import { loadAvatarTextures } from './avatars/createAvatarRig'
import { FEMALE_AVATAR_CONFIG, MALE_AVATAR_CONFIG, TARGET_BODY_HEIGHT_WORLD_UNITS } from './avatars/avatarConfigs'
import { clampPan, computeCameraFrame } from './camera'
import { ROOM_WORLD_HEIGHT, ROOM_WORLD_WIDTH } from './constants'
import { createRoomLayers } from './layers'
import { ENVIRONMENT_TEXTURE_PATH, FURNITURE_PLACEMENTS, LAMP_BASE, LAMP_GLOW } from './roomAssets'
import { syncFloorDepth } from './roomDepth'
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
async function loadLamp(layers: RoomLayers): Promise<void> {
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
  glow.alpha = 0.85

  group.addChild(base, glow)
  // The lamp never moves, so its depth key is set once here rather than
  // every tick the way each avatar's is (see tickAvatars below) — its
  // floor/contact point is the base's own position, the same Y every
  // other piece of furniture already places itself at.
  syncFloorDepth({ container: group }, LAMP_BASE.position.y)
  layers.avatars.addChild(group)
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
        await loadLamp(layers)
        if (cancelled) return

        // The TV is the room's first interactive furniture piece — see
        // setupTvInteraction's own docs for the hover-glow/click design
        // and why it shares Couple Home's existing Watch Together
        // navigation rather than inventing a second path.
        const tvSprite = furnitureSprites.find((sprite) => sprite.label === 'tv')
        if (tvSprite) {
          tvCleanup = setupTvInteraction(tvSprite, layers, application, () => onOpenWatchRef.current)
        }
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
          ] = await Promise.all([loadAvatarTextures(MALE_AVATAR_CONFIG), loadAvatarTextures(FEMALE_AVATAR_CONFIG)])

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

          function tickAvatars(ticker: Ticker) {
            const deltaSeconds = ticker.deltaMS / 1000
            maleDirector.update(deltaSeconds)
            femaleDirector.update(deltaSeconds)

            // Y-based depth sort (see roomDepth.ts) — each avatar's floor/
            // contact point is just its own current world position, since
            // both stand/sit/lie with a bottom-center (or, sitting, still
            // feet-level) anchor. Re-synced every tick because this is
            // exactly what needs to change AS an avatar walks past the
            // lamp, not something to set once.
            syncFloorDepth({ container: male.container }, maleMotion.getPosition().y)
            syncFloorDepth({ container: female.container }, femaleMotion.getPosition().y)
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
