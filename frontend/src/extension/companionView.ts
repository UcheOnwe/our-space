import contentStyles from './content-script.css?raw'
import type { Vector2 } from './companionMovement'
import { COLOR_VARIANTS, COMPANION_TYPES, DEFAULT_COMPANION_TYPE, getCompanionDefinition } from '../companions/registry'
import type { ColorVariantId, CompanionTypeId } from '../companions/types'
import type { NovaGuardianPose } from '../companions/novaGuardianPose'

export interface CompanionViewCallbacks {
  /** Fired on click, or Enter/Space while the companion has keyboard
   * focus — contentScriptEntry.ts turns this into Companion Control Mode
   * activation. This view knows nothing about control mode itself, only
   * that "the companion was selected." */
  onCompanionActivate: () => void
  /** Fired on clicking the Focus Mode toggle — contentScriptEntry.ts owns
   * the actual FocusModeState transition; this view only reports the
   * click. */
  onFocusToggle: () => void
}

export interface CompanionView {
  /** Writes the companion's world position — called once per animation
   * frame from contentScriptEntry.ts's requestAnimationFrame loop. */
  setPosition(position: Vector2): void
  /** Flips the companion to face left/right. `facingX` is the horizontal
   * component of the current movement direction; 0 leaves the last
   * facing unchanged (an idle companion keeps facing whichever way it
   * last walked, rather than snapping back to a default). Companions
   * with their own full directional posing (see `setDirectionalPose`)
   * don't use this — contentScriptEntry.ts only calls one or the other
   * per frame, based on whether the current Companion's registry entry
   * defines `computeDirectionalPose`. */
  setFacingX(facingX: number): void
  /** Swaps the idle animation for the snappier "moving" variant — see
   * content-script.css's per-preset `.our-space-companion--moving`
   * overrides. */
  setMoving(isMoving: boolean): void
  /** Shows/hides the glow ring that signals Companion Control Mode. */
  setControlModeActive(isActive: boolean): void
  /** Hides the companion (Focus Mode) without touching the focus toggle
   * itself, which must stay visible as the restore control. */
  setFocusModeActive(isActive: boolean): void
  /** Re-renders the companion as a DIFFERENT type/color — used both for
   * the initial "whatever was last synced" render and for LIVE updates
   * (contentScriptEntry.ts's chrome.storage.onChanged listener) while
   * already on YouTube, with no page reload. A no-op if this exact
   * type/color is already showing, so a redundant sync message never
   * causes a visible re-render flicker. */
  setCompanion(companionId: CompanionTypeId, colorId: ColorVariantId): void
  /** Applies a full semantic pose (see novaGuardianPose.ts) for
   * Companions that define `computeDirectionalPose` — currently only
   * Nova Guardian. A no-op if the currently-rendered Companion isn't one
   * of those (e.g. this is called on a stale reference right after
   * switching away — see `setCompanion`). */
  setDirectionalPose(pose: NovaGuardianPose | null): void
}

/** The DOM elements `setDirectionalPose` writes to — re-queried once
 * per `renderCompanion` call (i.e. once per Companion swap, not once per
 * animation frame) rather than on every `setDirectionalPose` call, since
 * `bob.innerHTML` is fully replaced on every swap and old references
 * would otherwise silently point at detached nodes. `null` whenever the
 * currently-rendered Companion isn't Nova Guardian (or any future
 * Companion using this same DOM convention). */
interface NovaGuardianElements {
  mirror: HTMLElement
  bank: HTMLElement
  body: HTMLElement
  leadArm: HTMLElement
  trailArm: HTMLElement
  cape: HTMLElement
  wake: HTMLElement
}

function queryNovaGuardianElements(root: HTMLElement): NovaGuardianElements | null {
  const mirror = root.querySelector<HTMLElement>('.nova-guardian-mirror')
  const bank = root.querySelector<HTMLElement>('.nova-guardian-bank')
  const body = root.querySelector<HTMLElement>('.nova-guardian-body')
  const leadArm = root.querySelector<HTMLElement>('.nova-guardian-lead-arm')
  const trailArm = root.querySelector<HTMLElement>('.nova-guardian-trail-arm')
  const cape = root.querySelector<HTMLElement>('.nova-guardian-cape')
  const wake = root.querySelector<HTMLElement>('.nova-guardian-wake')
  if (!mirror || !bank || !body || !leadArm || !trailArm || !cape || !wake) return null
  return { mirror, bank, body, leadArm, trailArm, cape, wake }
}

/** cape/wake are drawn pointing straight down as their own canonical
 * rest orientation (see companionShapes.ts's buildNovaGuardianSvg) — -90
 * here is what realigns the standard `atan2` convention (0deg = pointing
 * along +x) with that "0deg = pointing down" baseline, the same
 * realignment novaGuardianPose.ts's own angle math uses for the body. */
function trailDirectionToDeg(trailDirection: Vector2): number {
  return (Math.atan2(trailDirection.y, trailDirection.x) * 180) / Math.PI - 90
}

/**
 * Builds the whole Our Space overlay (companion + Focus Mode toggle)
 * inside `shadowRoot` and wires up the DOM events `CompanionViewCallbacks`
 * cares about. Everything here is plain DOM — no React/PixiJS — since the
 * content script is a completely separate, tiny bundle from the main web
 * app (see vite.extension.config.ts) and pulling in a UI framework for one
 * companion and one button would be a lot of bundle weight for nothing.
 */
export function createCompanionView(shadowRoot: ShadowRoot, callbacks: CompanionViewCallbacks): CompanionView {
  const style = document.createElement('style')
  style.textContent = contentStyles
  shadowRoot.appendChild(style)

  const overlay = document.createElement('div')
  overlay.className = 'our-space-overlay'

  const companion = document.createElement('button')
  companion.type = 'button'
  companion.className = 'our-space-companion'
  companion.setAttribute('aria-label', 'Space Companion — select to control it with the arrow keys too')
  companion.innerHTML = `
    <span class="our-space-companion-ring"></span>
    <div class="our-space-companion-flip">
      <div class="our-space-companion-bob"></div>
    </div>
  `
  companion.addEventListener('click', () => callbacks.onCompanionActivate())

  const bob = companion.querySelector<HTMLElement>('.our-space-companion-bob')
  const flip = companion.querySelector<HTMLElement>('.our-space-companion-flip')

  const focusToggle = document.createElement('button')
  focusToggle.type = 'button'
  focusToggle.className = 'our-space-focus-toggle'
  focusToggle.setAttribute('aria-pressed', 'false')
  focusToggle.setAttribute('aria-label', 'Toggle Focus Mode')
  focusToggle.innerHTML = `
    <span class="our-space-focus-toggle-dot"></span>
    <span class="our-space-focus-toggle-label">Focus Mode</span>
  `
  focusToggle.addEventListener('click', () => callbacks.onFocusToggle())

  overlay.append(companion, focusToggle)
  shadowRoot.appendChild(overlay)

  let lastNonZeroFacingX = -1 // faces left by default, matching the SVG's own resting eye layout
  let currentCompanionId: CompanionTypeId | null = null
  let currentColorId: ColorVariantId | null = null
  let novaGuardianElements: NovaGuardianElements | null = null

  function renderCompanion(companionId: CompanionTypeId, colorId: ColorVariantId): void {
    const definition = getCompanionDefinition(companionId)
    const colorHex = COLOR_VARIANTS[colorId].hex
    const usesDirectionalPose = Boolean(definition.computeDirectionalPose)

    if (bob) {
      bob.innerHTML = definition.buildSvgMarkup(colorId, colorHex)
      // Only one preset class is ever applied at a time — always clear
      // every possible one first rather than tracking which was active,
      // so this can never leave a stale preset's animation running
      // alongside the new one.
      bob.classList.remove(
        'our-space-preset-float-drift',
        'our-space-preset-soar-glide',
        'our-space-preset-hover-wobble',
        'our-space-preset-twinkle-dart',
        'our-space-preset-hero-hover',
      )
      bob.classList.add(`our-space-preset-${definition.animationPreset}`)
      novaGuardianElements = usesDirectionalPose ? queryNovaGuardianElements(bob) : null
    }

    // Directionally-posed Companions (Nova Guardian) own their OWN
    // internal mirror group (see companionShapes.ts) instead of this
    // generic one. Leaving `flip` at a stale scaleX left over from
    // whichever Companion was equipped BEFORE it would double-mirror —
    // or contradict — Nova Guardian's own internal facing, which is
    // exactly the stale-mirror bug found during inspection. Explicitly
    // reset it to neutral here, on every swap, rather than only when
    // convenient, so no previous Companion's facing can ever leak in.
    if (flip) {
      flip.style.transform = usesDirectionalPose ? '' : `scaleX(${lastNonZeroFacingX < 0 ? -1 : 1})`
    }

    currentCompanionId = companionId
    currentColorId = colorId
  }

  renderCompanion(DEFAULT_COMPANION_TYPE, COMPANION_TYPES[DEFAULT_COMPANION_TYPE].defaultColor)

  return {
    setPosition(position) {
      companion.style.transform = `translate(${position.x}px, ${position.y}px)`
    },
    setFacingX(facingX) {
      if (facingX !== 0) lastNonZeroFacingX = facingX
      if (flip) flip.style.transform = `scaleX(${lastNonZeroFacingX < 0 ? -1 : 1})`
    },
    setMoving(isMoving) {
      companion.classList.toggle('our-space-companion--moving', isMoving)
    },
    setControlModeActive(isActive) {
      companion.classList.toggle('our-space-companion--control-active', isActive)
    },
    setFocusModeActive(isActive) {
      companion.classList.toggle('our-space-companion--focus-hidden', isActive)
      focusToggle.classList.toggle('our-space-focus-toggle--focused', isActive)
      focusToggle.setAttribute('aria-pressed', String(isActive))
    },
    setCompanion(companionId, colorId) {
      if (companionId === currentCompanionId && colorId === currentColorId) return
      renderCompanion(companionId, colorId)
    },
    setDirectionalPose(pose) {
      if (!novaGuardianElements) return
      const { mirror, bank, body, leadArm, trailArm, cape, wake } = novaGuardianElements

      mirror.style.transform = `scaleX(${pose?.facingLeft ? -1 : 1})`
      bank.style.transform = `rotate(${pose?.bankDeg ?? 0}deg)`
      leadArm.style.transform = `rotate(${pose?.leadArmSwingDeg ?? 0}deg)`
      trailArm.style.transform = `rotate(${pose?.trailArmSwingDeg ?? 0}deg)`
      body.dataset.poseMode = pose?.poseMode ?? 'idle'

      if (pose?.isFlying) {
        // Cape and wake are driven directly from `trailDirection` — an
        // ABSOLUTE direction, not something inherited through the
        // mirror/bank stack above — so both reliably point the correct
        // way regardless of which way the body itself is currently
        // facing/banked (see companionShapes.ts's own doc comment for
        // why they're siblings of the mirror/bank groups, not children).
        const trailAngleDeg = trailDirectionToDeg(pose.trailDirection)
        cape.style.transform = `rotate(${trailAngleDeg}deg)`
        wake.style.transform = `rotate(${trailAngleDeg}deg)`
      } else {
        // Idle: clear the inline rotation so content-script.css's own
        // idle sway keyframe (never overridden by an inline style once
        // this is empty) takes back over.
        cape.style.transform = ''
        wake.style.transform = ''
      }
    },
  }
}
