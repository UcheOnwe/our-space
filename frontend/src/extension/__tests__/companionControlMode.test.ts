import { describe, expect, it } from 'vitest'
import {
  activateControlMode,
  createControlModeState,
  deactivateControlMode,
  isClickOutsideRoot,
} from '../companionControlMode'

describe('control mode state', () => {
  it('starts inactive', () => {
    expect(createControlModeState()).toEqual({ isActive: false })
  })

  it('activates and deactivates', () => {
    expect(activateControlMode()).toEqual({ isActive: true })
    expect(deactivateControlMode()).toEqual({ isActive: false })
  })
})

describe('isClickOutsideRoot', () => {
  const root = document.createElement('div')
  const childInsideRoot = document.createElement('button')
  root.appendChild(childInsideRoot)
  document.body.appendChild(root)

  const elementOutsideRoot = document.createElement('div')
  document.body.appendChild(elementOutsideRoot)

  it('is false when the click target is the root itself', () => {
    expect(isClickOutsideRoot(root, root)).toBe(false)
  })

  it('is false when the click target is inside the root (e.g. the companion button)', () => {
    expect(isClickOutsideRoot(childInsideRoot, root)).toBe(false)
  })

  it('is true when the click target is a completely unrelated element', () => {
    expect(isClickOutsideRoot(elementOutsideRoot, root)).toBe(true)
  })

  it('treats a non-Node target (e.g. null) as outside', () => {
    expect(isClickOutsideRoot(null, root)).toBe(true)
  })
})
