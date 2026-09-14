/**
 * Focus Mode's own state — a single boolean, but given its own tiny module
 * (rather than an inline `let` in contentScriptEntry.ts) so the on/off
 * transition is unit-testable and has one obvious place to read its own
 * doc comment: Focus Mode hides everything Our Space created (the
 * companion) while leaving a small always-present toggle so it can be
 * turned back off — see companionView.ts's `.our-space-focus-toggle`,
 * which never itself disappears, only shrinks/dims via the
 * `our-space-focus-toggle--focused` class this module's class list names.
 *
 * Deliberately never touches YouTube's own DOM/classes — every class name
 * here is scoped to elements Our Space created inside our own shadow root
 * (see contentScriptEntry.ts), so Focus Mode can't reach outside it.
 */
export interface FocusModeState {
  readonly isActive: boolean
}

export function createFocusModeState(): FocusModeState {
  return { isActive: false }
}

export function toggleFocusMode(state: FocusModeState): FocusModeState {
  return { isActive: !state.isActive }
}
