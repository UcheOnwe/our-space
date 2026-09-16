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
import type { CompanionView } from './companionView'
import { readEquippedCompanion, watchEquippedCompanion } from './equippedCompanionStore'
import { COMPANION_TYPES, DEFAULT_COMPANION_TYPE } from '../companions/registry'
import type { ColorVariantId, CompanionTypeId } from '../companions/types'

/**
 * Our Space Companion content script — the ONLY impure module in this
 * feature (see companionMovement.ts/keyboardInput.ts/movementKeyOwner.ts/
 * focusMode.ts/companionControlMode.ts/equippedCompanionStore.ts for the
 * tested logic this file drives). Runs once per real page load of
 * https://www.youtube.com/* (see ../../../../extension/manifest.json)
 * and never touches YouTube's own DOM — it only ever creates and updates
 * elements inside its own `#our-space-extension-root` Shadow DOM (see
 * companionView.ts).
 *
 * KEYBOARD OWNERSHIP: WASD is always-on outside editable fields; arrow
 * keys move the companion — and belong to it EXCLUSIVELY while Companion
 * Control Mode is active. Typing in any editable control always wins,
 * unconditionally. See movementKeyOwner.ts's own doc comment for the
 * capture-phase + stopImmediatePropagation mechanics.
 *
 * `run_at: "document_start"` (../../../../extension/manifest.json) is
 * deliberate and load-bearing: manual verification once found the
 * companion's arrow-key interception losing a registration-order race
 * against YouTube's OWN arrow-key listener when this attached later, at
 * `document_idle`. `document_start` is the one `run_at` value Chrome
 * guarantees runs before ANY of the page's own scripts — so
 * `createMovementKeyOwner` below is called IMMEDIATELY, at the very top
 * of this file, synchronously, before anything else (including the
 * `await` a few lines down) — that ordering is what actually wins the
 * race, not an implementation detail to simplify away.
 *
 * `document.body` doesn't exist yet at document_start, though — so
 * everything DOM-dependent (the companion's visible root/shadow DOM/
 * animation loop) waits for `DOMContentLoaded` via `setupCompanionUI`
 * below, same as before this file also started reading Companion sync
 * state.
 *
 * WHICH COMPANION RENDERS: see equippedCompanionStore.ts's own doc
 * comment for the full sync mechanism. In short: this reads the last
 * value the web app's bridge script cached in `chrome.storage.local`
 * (falling back to the registry's own default if nothing has ever
 * synced) and applies it BEFORE the companion's very first paint — the
 * storage read is kicked off immediately (in parallel with waiting for
 * DOMContentLoaded) and awaited before any DOM is created, so there is
 * no default-then-swap flash — then stays subscribed for live updates
 * for as long as this page is open, no reload needed if the user changes
 * their equipped Companion in another tab.
 */

let controlModeState = createControlModeState()
let focusModeState = createFocusModeState()
let view: CompanionView | null = null
let currentCompanionId: CompanionTypeId = DEFAULT_COMPANION_TYPE
let currentColorId: ColorVariantId = COMPANION_TYPES[currentCompanionId].defaultColor

// Armed FIRST, before anything else in this file (including the async
// storage read below) — see this file's own top-level doc comment for
// why attaching here, this early, is the actual keyboard-ownership fix
// rather than an optimization.
const movementKeys = createMovementKeyOwner(
  window,
  () => controlModeState.isActive,
  () => {
    controlModeState = deactivateControlMode()
    view?.setControlModeActive(false)
  },
)

// Kicked off immediately too (chrome.storage doesn't need the DOM) so
// it's very likely already settled by the time setupCompanionUI actually
// needs it, rather than adding its own visible delay on top of waiting
// for DOMContentLoaded.
const equippedCompanionPromise = readEquippedCompanion()

async function setupCompanionUI(): Promise<void> {
  // Defensive against any double-injection edge case — cheap, and this
  // content script has no reason to ever run twice on the same document.
  if (document.getElementById('our-space-extension-root')) return

  // Awaited BEFORE any DOM is created — this, not any ordering trick
  // below, is what guarantees the companion's very first render already
  // shows the right Companion instead of the registry default.
  const cached = await equippedCompanionPromise
  if (cached) {
    currentCompanionId = cached.companionType
    currentColorId = cached.colorVariant
  }

  const hostElement = document.createElement('div')
  hostElement.id = 'our-space-extension-root'
  document.body.appendChild(hostElement)
  const shadowRoot = hostElement.attachShadow({ mode: 'open' })

  const companionView = createCompanionView(shadowRoot, {
    onCompanionActivate: () => {
      controlModeState = activateControlMode()
      companionView.setControlModeActive(true)
    },
    onFocusToggle: () => {
      focusModeState = toggleFocusMode(focusModeState)
      companionView.setFocusModeActive(focusModeState.isActive)
      // Can't keep controlling a companion that's no longer visible.
      if (focusModeState.isActive && controlModeState.isActive) {
        controlModeState = deactivateControlMode()
        companionView.setControlModeActive(false)
      }
    },
  })
  view = companionView
  // No `await` since the view was created — still the same paint, so
  // this never shows as a separate flash after the registry default
  // `createCompanionView` itself renders internally.
  companionView.setCompanion(currentCompanionId, currentColorId)

  watchEquippedCompanion((equipped) => {
    currentCompanionId = equipped.companionType
    currentColorId = equipped.colorVariant
    companionView.setCompanion(currentCompanionId, currentColorId)
  })

  function handleDocumentClick(event: MouseEvent): void {
    if (!controlModeState.isActive) return
    if (isClickOutsideRoot(event.target, hostElement)) {
      controlModeState = deactivateControlMode()
      companionView.setControlModeActive(false)
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

    companionView.setPosition(position)
    companionView.setMoving(direction.x !== 0 || direction.y !== 0)

    // Companions with their own full directional posing (Nova Guardian,
    // currently) use setDirectionalPose instead of the simple left/right
    // flip every other Companion uses — see registry.ts's
    // `computeDirectionalPose` doc comment for why this is a per-entry
    // capability rather than something special-cased by name here.
    const computePose = COMPANION_TYPES[currentCompanionId].computeDirectionalPose
    if (computePose) {
      companionView.setDirectionalPose(computePose(direction))
    } else {
      companionView.setFacingX(direction.x)
    }

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
