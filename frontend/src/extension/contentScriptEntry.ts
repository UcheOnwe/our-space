import {
  activateControlMode,
  createControlModeState,
  deactivateControlMode,
  isClickOutsideRoot,
} from './companionControlMode'
import { createFocusModeState, toggleFocusMode } from './focusMode'
import {
  COMPANION_SIZE_PX,
  COMPANION_SPEED_PX_PER_SECOND,
  computeDirectionVector,
  normalizeVelocity,
  stepPosition,
} from './companionMovement'
import type { Vector2 } from './companionMovement'
import { createMovementKeyOwner } from './movementKeyOwner'
import { createCompanionView } from './companionView'

/**
 * Our Space Companion content script — the ONLY impure module in this
 * feature (see companionMovement.ts/keyboardInput.ts/movementKeyOwner.ts/
 * focusMode.ts/companionControlMode.ts for the tested logic this file
 * drives). Runs once per real page load of https://www.youtube.com/* (see
 * ../../../../extension/manifest.json) and never touches YouTube's own
 * DOM — it only ever creates and updates elements inside its own
 * `#our-space-extension-root` Shadow DOM (see companionView.ts).
 *
 * KEYBOARD OWNERSHIP: WASD is always-on outside editable fields; arrow
 * keys move the companion — and belong to it EXCLUSIVELY while Companion
 * Control Mode is active (the companion was clicked/selected). Typing in
 * any editable control always wins, unconditionally. See
 * movementKeyOwner.ts's own doc comment for the full capture-phase +
 * stopImmediatePropagation mechanics; THIS file's own responsibility in
 * that fix is WHEN the listener attaches — see `run_at` below.
 *
 * `run_at: "document_start"` (../../../../extension/manifest.json) is
 * deliberate and load-bearing, not incidental: manual verification on
 * YouTube Shorts found the companion's arrow-key interception losing a
 * registration-order race against YouTube's OWN arrow-key listener —
 * capture-phase listeners on the SAME node (window) still run in
 * registration order among themselves, and the previous version attached
 * at `document_idle`, which only runs after the page's own scripts have
 * already had the chance to set theirs up first. `document_start` is the
 * one `run_at` value Chrome guarantees runs before ANY of the page's own
 * scripts execute, so attaching the key listener here — immediately, at
 * the top of this file — is what actually wins that race, regardless of
 * what YouTube's own code does or when. Everything DOM-dependent below
 * (the companion's visible root/shadow DOM/animation loop) still has to
 * wait for `document.body` to exist, since document_start runs before the
 * DOM is constructed at all — see `setupCompanionUI` and where it's
 * called.
 */

let controlModeState = createControlModeState()
let focusModeState = createFocusModeState()
// Filled in once `setupCompanionUI` runs (see bottom of this file) — the
// key owner below only ever reads `controlModeState`/calls the resume/
// pause callbacks, never `view` directly, so it works correctly even
// during the brief window before the companion itself has been created.
let view: ReturnType<typeof createCompanionView> | null = null

// Armed FIRST, before anything else in this file — see this file's own
// top-level doc comment for why attaching here, this early, is the actual
// fix rather than an optimization.
const movementKeys = createMovementKeyOwner(
  window,
  () => controlModeState.isActive,
  () => {
    controlModeState = deactivateControlMode()
    view?.setControlModeActive(false)
  },
)

function setupCompanionUI(): void {
  // Defensive against any double-injection edge case — cheap, and this
  // content script has no reason to ever run twice on the same document.
  if (document.getElementById('our-space-extension-root')) return

  const hostElement = document.createElement('div')
  hostElement.id = 'our-space-extension-root'
  document.body.appendChild(hostElement)
  const shadowRoot = hostElement.attachShadow({ mode: 'open' })

  view = createCompanionView(shadowRoot, {
    onCompanionActivate: () => {
      controlModeState = activateControlMode()
      view?.setControlModeActive(true)
    },
    onFocusToggle: () => {
      focusModeState = toggleFocusMode(focusModeState)
      view?.setFocusModeActive(focusModeState.isActive)
      // Can't keep controlling a companion that's no longer visible.
      if (focusModeState.isActive && controlModeState.isActive) {
        controlModeState = deactivateControlMode()
        view?.setControlModeActive(false)
      }
    },
  })

  function handleDocumentClick(event: MouseEvent): void {
    if (!controlModeState.isActive) return
    if (isClickOutsideRoot(event.target, hostElement)) {
      controlModeState = deactivateControlMode()
      view?.setControlModeActive(false)
    }
  }

  // Capture phase would let this fire even if some YouTube element calls
  // stopPropagation() on a bubbling click — deliberately using bubble
  // phase instead, since we WANT YouTube's own click handling to run
  // completely undisturbed; we're only ever reading `event.target` here,
  // never intercepting the click itself.
  document.addEventListener('click', handleDocumentClick)

  let position: Vector2 = {
    x: Math.max(0, window.innerWidth / 2 - COMPANION_SIZE_PX.width / 2),
    y: Math.max(0, window.innerHeight / 2 - COMPANION_SIZE_PX.height / 2),
  }
  let lastTimestamp: number | null = null

  function tick(timestamp: number): void {
    if (lastTimestamp === null) lastTimestamp = timestamp
    const deltaSeconds = (timestamp - lastTimestamp) / 1000
    lastTimestamp = timestamp

    const direction = computeDirectionVector(movementKeys.getActiveDirections())
    const velocity = normalizeVelocity(direction, COMPANION_SPEED_PX_PER_SECOND)
    // Reading window.innerWidth/innerHeight fresh every frame (rather
    // than caching it and listening for 'resize') is what makes viewport
    // resizing "just work" — the very next frame after a resize simply
    // clamps against the new size.
    position = stepPosition(position, velocity, deltaSeconds, {
      width: window.innerWidth,
      height: window.innerHeight,
    })

    view?.setPosition(position)
    view?.setFacingX(direction.x)
    view?.setMoving(direction.x !== 0 || direction.y !== 0)

    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

// `document.body` doesn't exist yet at document_start — wait for the DOM
// to actually be parsed before building the companion's visible UI. If
// this script were ever loaded after that point (it isn't, in production,
// given `run_at: "document_start"` — this is just defensive), `body`
// already existing means running immediately instead of waiting for an
// event that already fired.
if (document.body) {
  setupCompanionUI()
} else {
  document.addEventListener('DOMContentLoaded', setupCompanionUI, { once: true })
}
