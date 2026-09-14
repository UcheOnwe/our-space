import type { MovementDirection } from './companionMovement'

/**
 * Keyboard-classification helpers — kept separate from companionMovement.ts
 * because this module's job is "what does this key/target MEAN," not "how
 * does a direction turn into a position." Pure functions over a
 * KeyboardEvent's own key/target, so they're unit-testable with plain DOM
 * elements (jsdom) and don't need a real content script running.
 */

// Case-insensitive on purpose — `key` is 'W' with Shift/Caps-Lock held, not
// just 'w'. Arrow keys have no letter case to worry about.
const WASD_TO_DIRECTION: Record<string, MovementDirection> = {
  w: 'up',
  a: 'left',
  s: 'down',
  d: 'right',
}

const ARROW_TO_DIRECTION: Record<string, MovementDirection> = {
  ArrowUp: 'up',
  ArrowLeft: 'left',
  ArrowDown: 'down',
  ArrowRight: 'right',
}

/** WASD is the DEFAULT, always-on control scheme (approved plan: "WASD
 * controls the Space Companion while the user is not typing" — no
 * Companion Control Mode required). Returns null for any other key. */
export function wasdDirectionForKey(key: string): MovementDirection | null {
  return WASD_TO_DIRECTION[key.toLowerCase()] ?? null
}

/** The arrow keys are YouTube's own seek/volume shortcuts by default — see
 * this module's own file-level doc and contentScriptEntry.ts's Companion
 * Control Mode handling. This function only classifies "is this an arrow
 * key movement-wise"; it does NOT decide whether arrows are currently
 * allowed to move the companion — that gating lives in the caller
 * (contentScriptEntry.ts), which only reads this while Companion Control
 * Mode is active. */
export function arrowDirectionForKey(key: string): MovementDirection | null {
  return ARROW_TO_DIRECTION[key] ?? null
}

/**
 * True when `target` is (or is inside) something the user could be typing
 * into — a normal `<input>`/`<textarea>`/`<select>`, any contentEditable
 * element (YouTube's comment box and search suggestions use this rather
 * than a plain `<textarea>`), or a descendant of one. Checked FIRST on
 * every keydown in contentScriptEntry.ts, before any movement/control-mode
 * handling runs at all — typing always wins, unconditionally, regardless
 * of Companion Control Mode.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false

  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true

  if (target instanceof HTMLElement && target.isContentEditable) return true

  // Covers the case where the editable element is an ancestor of the
  // actual event target (e.g. a `<span>` inside a contentEditable div) —
  // `isContentEditable` above already handles the target itself, this
  // catches the ancestor case `closest` is built for.
  return target.closest('[contenteditable="true"]') !== null
}
