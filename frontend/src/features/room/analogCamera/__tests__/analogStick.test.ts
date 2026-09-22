import { describe, expect, it } from 'vitest'
import { STICK_DEAD_ZONE_RATIO, clampKnobPosition, computeStickVector } from '../analogStick'

const RADIUS = 50

describe('computeStickVector', () => {
  it('is zero at dead center', () => {
    expect(computeStickVector(0, 0, RADIUS)).toEqual({ x: 0, y: 0 })
  })

  it('is zero anywhere inside the dead zone — tiny touchscreen noise must not drift the camera', () => {
    const insideDeadZone = RADIUS * (STICK_DEAD_ZONE_RATIO - 0.02)
    expect(computeStickVector(insideDeadZone, 0, RADIUS)).toEqual({ x: 0, y: 0 })
    expect(computeStickVector(0, insideDeadZone, RADIUS)).toEqual({ x: 0, y: 0 })
    // A diagonal offset whose MAGNITUDE is still inside the dead zone,
    // not just each axis independently.
    const diag = insideDeadZone / Math.SQRT2
    expect(computeStickVector(diag, diag, RADIUS)).toEqual({ x: 0, y: 0 })
  })

  it('right displacement produces positive horizontal velocity and zero vertical', () => {
    const vector = computeStickVector(RADIUS, 0, RADIUS)
    expect(vector.x).toBeGreaterThan(0)
    expect(vector.y).toBe(0)
  })

  it('left displacement produces negative horizontal velocity', () => {
    const vector = computeStickVector(-RADIUS, 0, RADIUS)
    expect(vector.x).toBeLessThan(0)
    expect(vector.y).toBe(0)
  })

  it('vertical displacement produces the correct-signed vertical velocity and zero horizontal', () => {
    const down = computeStickVector(0, RADIUS, RADIUS)
    expect(down.y).toBeGreaterThan(0)
    expect(down.x).toBe(0)

    const up = computeStickVector(0, -RADIUS, RADIUS)
    expect(up.y).toBeLessThan(0)
    expect(up.x).toBe(0)
  })

  it('an arbitrary diagonal produces BOTH X and Y velocity, at the exact continuous angle — never snapped to a discrete direction', () => {
    // 37 degrees from horizontal, well clear of the dead zone.
    const angleRad = (37 * Math.PI) / 180
    const dx = RADIUS * Math.cos(angleRad)
    const dy = RADIUS * Math.sin(angleRad)

    const vector = computeStickVector(dx, dy, RADIUS)
    expect(vector.x).not.toBe(0)
    expect(vector.y).not.toBe(0)
    // The vector's own angle matches the input angle exactly — the curve
    // only rescales magnitude, it never touches direction.
    expect(Math.atan2(vector.y, vector.x)).toBeCloseTo(angleRad, 5)
  })

  it('every angle around the full circle is reachable, not just eight/four discrete directions', () => {
    const angles = [0, 22, 37, 74, 90, 111, 143, 180, 200, 215, 246, 270, 301, 333]
    const seenAngles = new Set<number>()
    for (const degrees of angles) {
      const rad = (degrees * Math.PI) / 180
      const dx = RADIUS * Math.cos(rad)
      const dy = RADIUS * Math.sin(rad)
      const vector = computeStickVector(dx, dy, RADIUS)
      seenAngles.add(Math.round(Math.atan2(vector.y, vector.x) * 1000))
    }
    // Every one of these distinct input angles produced its own distinct
    // output angle — nothing collapsed multiple angles into a shared
    // discrete direction.
    expect(seenAngles.size).toBe(angles.length)
  })

  it('magnitude affects speed — a bigger displacement produces a bigger (or equal) vector magnitude', () => {
    const small = computeStickVector(RADIUS * 0.3, 0, RADIUS)
    const large = computeStickVector(RADIUS * 0.8, 0, RADIUS)
    expect(Math.hypot(large.x, large.y)).toBeGreaterThan(Math.hypot(small.x, small.y))
  })

  it('the outer radius caps strength at 1 — going further than the base radius never demands MORE than max speed', () => {
    const atEdge = computeStickVector(RADIUS, 0, RADIUS)
    const wayPastEdge = computeStickVector(RADIUS * 5, 0, RADIUS)
    expect(atEdge.x).toBeCloseTo(1, 5)
    expect(wayPastEdge.x).toBeCloseTo(1, 5)
  })

  it('returns zero when maxRadius is not positive (defensive against an unmeasured/zero-size base)', () => {
    expect(computeStickVector(10, 10, 0)).toEqual({ x: 0, y: 0 })
  })
})

describe('clampKnobPosition', () => {
  it('leaves a position already inside the radius untouched', () => {
    expect(clampKnobPosition(10, 5, RADIUS)).toEqual({ x: 10, y: 5 })
  })

  it('never lets the knob visually exceed the base radius', () => {
    const clamped = clampKnobPosition(RADIUS * 3, 0, RADIUS)
    expect(Math.hypot(clamped.x, clamped.y)).toBeCloseTo(RADIUS, 5)
  })

  it('preserves direction exactly while clamping magnitude', () => {
    const angleRad = (143 * Math.PI) / 180
    const dx = RADIUS * 4 * Math.cos(angleRad)
    const dy = RADIUS * 4 * Math.sin(angleRad)
    const clamped = clampKnobPosition(dx, dy, RADIUS)
    expect(Math.atan2(clamped.y, clamped.x)).toBeCloseTo(angleRad, 5)
    expect(Math.hypot(clamped.x, clamped.y)).toBeCloseTo(RADIUS, 5)
  })

  it('handles the zero vector without dividing by zero', () => {
    expect(clampKnobPosition(0, 0, RADIUS)).toEqual({ x: 0, y: 0 })
  })
})
