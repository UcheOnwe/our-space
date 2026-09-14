import type { MovementDirection } from './companionMovement'
import { arrowDirectionForKey, isEditableTarget, wasdDirectionForKey } from './keyboardInput'

export interface MovementKeyOwner {
  /** The union of WASD's always-on directions with the arrow keys'
   * directions — but arrows only count while Companion Control Mode is
   * active, checked fresh on every call (not baked in at keydown time).
   * contentScriptEntry.ts reads this once per animation frame. */
  getActiveDirections(): ReadonlySet<MovementDirection>
  /** Removes every listener this attached. Content scripts live for the
   * whole page lifetime and never call this in production, but it keeps
   * this module honest/testable rather than leaking listeners silently. */
  detach(): void
}

/**
 * Owns every keyboard-ownership rule for the Space Companion — attached
 * once to `target` (real usage: `window`, from contentScriptEntry.ts) and
 * pulled out into its own module specifically so the fix below can be
 * exercised with a real dispatched KeyboardEvent in a test, rather than
 * only trusted by manual Chrome verification.
 *
 * THE BUG THIS FIXES (two rounds — see git history for the first):
 * with Companion Control Mode active, arrow keys were meant to belong
 * exclusively to the companion, but manual verification on real YouTube
 * kept finding YouTube ALSO reacting to the same ArrowUp/Down/Left/Right
 * keystrokes — seeking, changing volume, and specifically on Shorts,
 * navigating to another Short — even after this module already called
 * both `preventDefault()` and (round one) `stopPropagation()` in the
 * capture phase.
 *
 * `preventDefault()` only suppresses the BROWSER's own default action for
 * a key (e.g. page scroll) — it does nothing to stop ANOTHER script's own
 * event listener from running. `stopPropagation()`/`stopImmediatePropagation()`
 * can stop other listeners, but ONLY listeners that haven't already run —
 * neither can undo a listener that already fired earlier in the same
 * dispatch. That's the actual round-two root cause: capture-phase
 * listeners on the SAME node (`window`) still run in REGISTRATION order
 * among themselves, and YouTube's own arrow-key handling is realistically
 * also attached on `window` (or reachable no later than the capture
 * chain into it) very early during its own app bootstrap — earlier than
 * this content script used to attach, at `document_idle`. Whichever
 * listener registers first on `window`'s capture phase wins the race,
 * REGARDLESS of what either one calls afterward. See
 * contentScriptEntry.ts's own top-level doc comment for the actual fix to
 * that half of the problem: attaching at `run_at: "document_start"`,
 * which Chrome guarantees runs before ANY of the page's own scripts, so
 * this listener is always the first thing registered on `window`.
 *
 * This module's own half of the fix, now that registration order is
 * guaranteed to favor it: once an arrow key is claimed (Control Mode
 * active), call BOTH `stopPropagation()` (halts the rest of capture, the
 * target phase, and the entire bubble phase — stopping YouTube's own
 * `document`/target-level listeners) AND `stopImmediatePropagation()`
 * (also stops any OTHER listener on this exact same node, `window`,
 * registered after this one — closing the one gap plain
 * `stopPropagation()` leaves open if YouTube's own code also happens to
 * use a window-level capture listener). The two rounds of this bug
 * together are exactly the evidence the approved plan asked for before
 * reaching for `stopImmediatePropagation()` — it does nothing this module
 * itself needs to avoid (there is only ever this one keydown listener
 * registered on `window` from this codebase), so there's no real
 * "aggressiveness" cost paid for the extra guarantee.
 *
 * Everything else stays exactly as before:
 * - WASD is never claimed (preventDefault/stopPropagation) at all — no
 *   YouTube shortcut uses bare WASD, so there's nothing to take
 *   ownership of.
 * - Typing in any editable control (`isEditableTarget`) is checked FIRST
 *   and wins unconditionally, before any Control Mode/arrow logic runs.
 * - Escape, when Control Mode is active, calls `onEscape` and is
 *   otherwise left untouched (no preventDefault/stopPropagation), so
 *   YouTube's own Escape behavior (e.g. exiting fullscreen) still works.
 */
export function createMovementKeyOwner(
  target: EventTarget,
  isControlModeActive: () => boolean,
  onEscape: () => void,
): MovementKeyOwner {
  const wasdActive = new Set<MovementDirection>()
  const arrowActive = new Set<MovementDirection>()

  function handleKeyDown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent

    // Typing always wins — checked first, before anything else below,
    // regardless of Control Mode.
    if (isEditableTarget(keyboardEvent.target)) return

    if (keyboardEvent.key === 'Escape') {
      if (isControlModeActive()) onEscape()
      return
    }

    const wasdDirection = wasdDirectionForKey(keyboardEvent.key)
    if (wasdDirection) {
      wasdActive.add(wasdDirection)
      return
    }

    const arrowDirection = arrowDirectionForKey(keyboardEvent.key)
    if (arrowDirection && isControlModeActive()) {
      arrowActive.add(arrowDirection)
      // See this function's own top-level doc comment for why all three
      // calls are required — each closes a different way YouTube could
      // otherwise still react to this same keystroke.
      keyboardEvent.preventDefault()
      keyboardEvent.stopPropagation()
      keyboardEvent.stopImmediatePropagation()
    }
  }

  function handleKeyUp(event: Event): void {
    const keyboardEvent = event as KeyboardEvent
    const wasdDirection = wasdDirectionForKey(keyboardEvent.key)
    if (wasdDirection) {
      wasdActive.delete(wasdDirection)
      return
    }
    const arrowDirection = arrowDirectionForKey(keyboardEvent.key)
    if (arrowDirection) arrowActive.delete(arrowDirection)
  }

  // If the browser window loses focus while a key is physically held
  // (e.g. alt-tab), no keyup ever fires for it — without this, that
  // direction would stay "held" forever once focus returns.
  function handleBlur(): void {
    wasdActive.clear()
    arrowActive.clear()
  }

  target.addEventListener('keydown', handleKeyDown, { capture: true })
  target.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', handleBlur)

  return {
    getActiveDirections() {
      const effective = new Set(wasdActive)
      if (isControlModeActive()) {
        for (const direction of arrowActive) effective.add(direction)
      }
      return effective
    },
    detach() {
      target.removeEventListener('keydown', handleKeyDown, { capture: true })
      target.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    },
  }
}
