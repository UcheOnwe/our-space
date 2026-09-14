import { describe, expect, it } from 'vitest'
import { createFocusModeState, toggleFocusMode } from '../focusMode'

describe('focus mode state', () => {
  it('starts inactive', () => {
    expect(createFocusModeState()).toEqual({ isActive: false })
  })

  it('toggles on, then off again', () => {
    const on = toggleFocusMode(createFocusModeState())
    expect(on.isActive).toBe(true)

    const off = toggleFocusMode(on)
    expect(off.isActive).toBe(false)
  })

  it('does not mutate the state it was given (each call returns a new object)', () => {
    const initial = createFocusModeState()
    const toggled = toggleFocusMode(initial)
    expect(initial.isActive).toBe(false)
    expect(toggled).not.toBe(initial)
  })
})
