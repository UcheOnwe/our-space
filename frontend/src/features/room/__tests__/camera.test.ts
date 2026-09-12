import { describe, expect, it } from 'vitest'
import { MIN_READABLE_SCALE, clampPan, computeCameraFrame } from '../camera'

// A fixed stand-in world so every case below has predictable numbers,
// independent of whatever the real ROOM_WORLD_WIDTH/HEIGHT placeholder
// currently is.
const WORLD_WIDTH = 1600
const WORLD_HEIGHT = 900

describe('computeCameraFrame', () => {
  it('fits the whole room with no panning on a comfortably wide viewport', () => {
    const frame = computeCameraFrame(1200, 800, WORLD_WIDTH, WORLD_HEIGHT)

    // contain scale = min(1200/1600, 800/900) = 0.75, above MIN_READABLE_SCALE.
    expect(frame.scale).toBeCloseTo(0.75)
    expect(frame.maxPanX).toBe(0)
    expect(frame.maxPanY).toBe(0)
  })

  it('holds the minimum readable scale and allows horizontal panning on a narrow/tall viewport', () => {
    const frame = computeCameraFrame(375, 700, WORLD_WIDTH, WORLD_HEIGHT)

    // contain scale = min(375/1600, 700/900) ≈ 0.234, below MIN_READABLE_SCALE
    // — the camera must not shrink further than that.
    expect(frame.scale).toBe(MIN_READABLE_SCALE)
    // scaled world = 1600*0.55=880 wide, 900*0.55=495 tall.
    // Wider than the 375px viewport (needs panning); shorter than the
    // 700px viewport (doesn't).
    expect(frame.maxPanX).toBeCloseTo((880 - 375) / 2)
    expect(frame.maxPanY).toBe(0)
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
