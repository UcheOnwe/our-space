import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM_FACTOR,
  MIN_READABLE_SCALE,
  MIN_ZOOM_FACTOR,
  clampPan,
  computeCameraFrame,
  computeMaxPan,
} from '../camera'

// A fixed stand-in world so every case below has predictable numbers,
// independent of whatever the real ROOM_WORLD_WIDTH/HEIGHT placeholder
// currently is.
const WORLD_WIDTH = 1600
const WORLD_HEIGHT = 900

describe('computeCameraFrame', () => {
  it('needs no panning when the viewport already matches the world\'s own aspect ratio (desktop\'s own box shape)', () => {
    // 960x540 is exactly 1600x900 at 0.6 scale on both axes — the same
    // "box locked to the world's ratio" RoomCanvas.module.css's desktop
    // media query guarantees via `aspect-ratio: 1600/900`.
    const frame = computeCameraFrame(960, 540, WORLD_WIDTH, WORLD_HEIGHT)

    expect(frame.scale).toBeCloseTo(0.6)
    expect(frame.maxPanX).toBe(0)
    expect(frame.maxPanY).toBe(0)
  })

  it('covers a viewport whose aspect ratio does not match the world, panning only on the axis that needs it', () => {
    const frame = computeCameraFrame(1200, 800, WORLD_WIDTH, WORLD_HEIGHT)

    // cover scale = max(1200/1600, 800/900) = max(0.75, 0.888..) = 0.888..
    // — the larger of the two, so BOTH axes are fully covered (never a
    // "contain" gap on the shorter one).
    expect(frame.scale).toBeCloseTo(8 / 9)
    // Scaled world is 1422.2 wide vs. a 1200px viewport — needs panning.
    expect(frame.maxPanX).toBeCloseTo((1600 * (8 / 9) - 1200) / 2)
    // Scaled world is exactly 800 tall — the limiting axis, no panning.
    expect(frame.maxPanY).toBe(0)
  })

  it('holds the minimum readable scale and allows panning on both axes on a very small viewport', () => {
    const frame = computeCameraFrame(300, 300, WORLD_WIDTH, WORLD_HEIGHT)

    // cover scale = max(300/1600, 300/900) ≈ 0.333, below MIN_READABLE_SCALE
    // — the camera must not shrink further than that, which now overflows
    // BOTH axes (not just one, since forcing the scale up growsboth
    // dimensions together).
    expect(frame.scale).toBe(MIN_READABLE_SCALE)
    // scaled world = 1600*0.55=880 wide, 900*0.55=495 tall — bigger than
    // the 300x300 viewport on both axes.
    expect(frame.maxPanX).toBeCloseTo((880 - 300) / 2)
    expect(frame.maxPanY).toBeCloseTo((495 - 300) / 2)
  })

  it('never shrinks below MIN_READABLE_SCALE even for a tiny viewport', () => {
    const frame = computeCameraFrame(200, 150, WORLD_WIDTH, WORLD_HEIGHT)
    expect(frame.scale).toBe(MIN_READABLE_SCALE)
  })

  it('falls back to a safe frame instead of NaN/Infinity for a zero-sized viewport', () => {
    const frame = computeCameraFrame(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    expect(frame.scale).toBe(MIN_READABLE_SCALE)
    expect(frame.maxPanX).toBe(0)
    expect(frame.maxPanY).toBe(0)
  })

  it('defaults to the real room world dimensions when none are given', () => {
    // Just confirms the default-parameter wiring works — the exact
    // ROOM_WORLD_WIDTH/HEIGHT values are covered by the explicit-size
    // cases above, not re-asserted here (they're a placeholder, per
    // constants.ts, and shouldn't make this test brittle).
    const frame = computeCameraFrame(1200, 800)
    expect(frame.scale).toBeGreaterThan(0)
  })
})

describe('computeMaxPan', () => {
  it('returns 0 when the scaled dimension already fits inside the viewport', () => {
    expect(computeMaxPan(500, 500)).toBe(0)
    expect(computeMaxPan(400, 500)).toBe(0)
  })

  it('returns half the overflow when the scaled dimension exceeds the viewport', () => {
    expect(computeMaxPan(900, 500)).toBe(200)
  })
})

describe('zoom factor bounds', () => {
  it('floors at 1 (never below the base cover-fit scale) and caps at a modest 2.5x', () => {
    expect(MIN_ZOOM_FACTOR).toBe(1)
    expect(MAX_ZOOM_FACTOR).toBeGreaterThan(MIN_ZOOM_FACTOR)
    expect(MAX_ZOOM_FACTOR).toBeLessThanOrEqual(3)
  })
})

describe('clampPan', () => {
  it('leaves a value inside the allowed range unchanged', () => {
    expect(clampPan(10, 50)).toBe(10)
    expect(clampPan(-10, 50)).toBe(-10)
  })

  it('clamps a value past the positive or negative edge', () => {
    expect(clampPan(100, 50)).toBe(50)
    expect(clampPan(-100, 50)).toBe(-50)
  })

  it('always collapses to 0 when no panning is allowed on that axis', () => {
    expect(clampPan(25, 0)).toBe(0)
    expect(clampPan(-25, 0)).toBe(0)
  })
})
