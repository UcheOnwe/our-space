import { describe, expect, it } from 'vitest'
import {
  COMPANION_SIZE_PX,
  computeDirectionVector,
  normalizeVelocity,
  stepPosition,
} from '../companionMovement'
import type { MovementDirection } from '../companionMovement'

function directions(...values: MovementDirection[]): Set<MovementDirection> {
  return new Set(values)
}

describe('computeDirectionVector', () => {
  it('returns zero when nothing is held', () => {
    expect(computeDirectionVector(directions())).toEqual({ x: 0, y: 0 })
  })

  it('maps each cardinal direction independently', () => {
    expect(computeDirectionVector(directions('up'))).toEqual({ x: 0, y: -1 })
    expect(computeDirectionVector(directions('down'))).toEqual({ x: 0, y: 1 })
    expect(computeDirectionVector(directions('left'))).toEqual({ x: -1, y: 0 })
    expect(computeDirectionVector(directions('right'))).toEqual({ x: 1, y: 0 })
  })

  it('combines opposite directions back to zero on that axis', () => {
    expect(computeDirectionVector(directions('left', 'right'))).toEqual({ x: 0, y: 0 })
    expect(computeDirectionVector(directions('up', 'down'))).toEqual({ x: 0, y: 0 })
  })

  it('produces a diagonal vector when two perpendicular directions are held', () => {
    expect(computeDirectionVector(directions('up', 'right'))).toEqual({ x: 1, y: -1 })
  })
})

describe('normalizeVelocity (diagonal speed must not exceed cardinal speed)', () => {
  const speed = 240

  it('leaves a cardinal direction at full speed', () => {
    const velocity = normalizeVelocity({ x: 1, y: 0 }, speed)
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(speed)
  })

  it('scales a diagonal direction down so its magnitude still equals `speed`, not speed*sqrt(2)', () => {
    const velocity = normalizeVelocity({ x: 1, y: -1 }, speed)
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(speed)
    // Diagonal components must be smaller than the cardinal case, or a
    // diagonal walk would visibly cover ground faster than a straight one.
    expect(Math.abs(velocity.x)).toBeLessThan(speed)
    expect(Math.abs(velocity.y)).toBeLessThan(speed)
  })

  it('returns zero velocity for zero direction (no div-by-zero NaN)', () => {
    expect(normalizeVelocity({ x: 0, y: 0 }, speed)).toEqual({ x: 0, y: 0 })
  })
})

describe('stepPosition', () => {
  const viewport = { width: 800, height: 600 }

  it('advances position by velocity * deltaSeconds — not a fixed step', () => {
    const start = { x: 100, y: 100 }
    const next = stepPosition(start, { x: 240, y: 0 }, 0.5, viewport)
    expect(next.x).toBeCloseTo(220) // 100 + 240*0.5
    expect(next.y).toBeCloseTo(100)
  })

  it('is frame-rate independent: many small steps cover the same ground as one big step', () => {
    const velocity = { x: 240, y: 0 }
    const totalSeconds = 1
    const frameCount = 60 // simulates ~60fps for one second

    let viaManyFrames = { x: 0, y: 0 }
    for (let i = 0; i < frameCount; i++) {
      viaManyFrames = stepPosition(viaManyFrames, velocity, totalSeconds / frameCount, viewport)
    }

    const viaOneStep = stepPosition({ x: 0, y: 0 }, velocity, totalSeconds, viewport)
    expect(viaManyFrames.x).toBeCloseTo(viaOneStep.x, 5)
  })

  it('clamps to the left/top viewport edge — never negative, never teleports past 0', () => {
    const next = stepPosition({ x: 5, y: 5 }, { x: -1000, y: -1000 }, 1, viewport)
    expect(next.x).toBe(0)
    expect(next.y).toBe(0)
  })

  it('clamps to the right/bottom viewport edge, accounting for the companion’s own size', () => {
    const next = stepPosition(
      { x: viewport.width - 10, y: viewport.height - 10 },
      { x: 1000, y: 1000 },
      1,
      viewport,
    )
    expect(next.x).toBe(viewport.width - COMPANION_SIZE_PX.width)
    expect(next.y).toBe(viewport.height - COMPANION_SIZE_PX.height)
  })

  it('adapts to a resized (smaller) viewport on the very next call, with no separate resize handling', () => {
    const shrunkViewport = { width: 200, height: 150 }
    const next = stepPosition({ x: 190, y: 140 }, { x: 0, y: 0 }, 1, shrunkViewport)
    expect(next.x).toBeLessThanOrEqual(shrunkViewport.width - COMPANION_SIZE_PX.width)
    expect(next.y).toBeLessThanOrEqual(shrunkViewport.height - COMPANION_SIZE_PX.height)
  })
})
