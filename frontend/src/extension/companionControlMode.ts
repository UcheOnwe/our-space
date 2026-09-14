/**
 * Companion Control Mode's own state — the approved correction to the
 * original plan's "arrow keys always move the companion." YouTube already
 * binds bare arrow keys to seek (left/right) and volume (up/down), so
 * arrows can only be safe to repurpose while the user has deliberately
 * selected the companion (click, or Enter/Space while it has keyboard
 * focus — see companionView.ts). WASD has no such conflict and stays
 * active outside this mode too (see keyboardInput.ts's own doc comment).
 *
 * Kept as its own module (distinct from focusMode.ts) because it's a
 * genuinely different concept: Focus Mode hides Our Space's UI; Control
 * Mode changes which keys the companion listens to. Conflating them would
 * make either one harder to reason about.
 */
export interface ControlModeState {
  readonly isActive: boolean
}

export function createControlModeState(): ControlModeState {
  return { isActive: false }
}

export function activateControlMode(): ControlModeState {
  return { isActive: true }
}

export function deactivateControlMode(): ControlModeState {
  return { isActive: false }
}

/**
 * The "click outside releases Control Mode" rule, implemented against our
 * OWN root element only — never against any assumption about YouTube's
 * DOM structure (the approved plan's own condition for building this at
 * all: "if this can be implemented cleanly without fragile YouTube DOM
 * assumptions"). `ourRootElement` is `#our-space-extension-root` (see
 * contentScriptEntry.ts); a click is "outside" simply when that element
 * doesn't contain the click's target.
 *
 * This works correctly even though the companion itself renders inside a
 * Shadow DOM attached to `ourRootElement`: a listener registered outside
 * the shadow tree (contentScriptEntry.ts's own `document`-level click
 * listener) sees shadow-internal clicks with their `target` already
 * "retargeted" by the browser to the shadow HOST element itself — which
 * `ourRootElement` IS — so `ourRootElement.contains(target)` is true for
 * every click inside our overlay, without this function needing to know
 * anything about what's inside the shadow root.
 */
export function isClickOutsideRoot(target: EventTarget | null, ourRootElement: Element): boolean {
  if (!(target instanceof Node)) return true
  return !ourRootElement.contains(target)
}
