import { describe, expect, it } from 'vitest'
import { computeSafeHugAnchor } from '../sync'

describe('computeSafeHugAnchor', () => {
  it('returns the true midpoint when it is already safely inside the margins', () => {
    const anchor = computeSafeHugAnchor({ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 })
    expect(anchor).toEqual({ x: 0.5, y: 0.5 })
  })

  it('clamps toward the safe zone when both points are near a corner', () => {
    const anchor = computeSafeHugAnchor({ x: 0.01, y: 0.02 }, { x: 0.03, y: 0.01 })
    expect(anchor.x).toBeGreaterThanOrEqual(0.08)
    expect(anchor.y).toBeGreaterThanOrEqual(0.15)
  })

  it('clamps toward the safe zone at the opposite corner too', () => {
    const anchor = computeSafeHugAnchor({ x: 0.99, y: 0.98 }, { x: 0.97, y: 0.99 })
    expect(anchor.x).toBeLessThanOrEqual(0.92)
    expect(anchor.y).toBeLessThanOrEqual(0.92)
  })

  it('reserves more room at the top than the bottom, for hearts floating upward', () => {
    const topAnchor = computeSafeHugAnchor({ x: 0.5, y: 0.01 }, { x: 0.5, y: 0.02 })
    const bottomAnchor = computeSafeHugAnchor({ x: 0.5, y: 0.98 }, { x: 0.5, y: 0.99 })
    expect(topAnchor.y).toBe(0.15)
    expect(bottomAnchor.y).toBe(0.92)
  })

  it('is symmetric — the order of the two points does not matter', () => {
    const a = { x: 0.2, y: 0.7 }
    const b = { x: 0.6, y: 0.3 }
    expect(computeSafeHugAnchor(a, b)).toEqual(computeSafeHugAnchor(b, a))
  })
})
