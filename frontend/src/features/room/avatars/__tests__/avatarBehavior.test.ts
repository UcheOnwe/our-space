import { describe, expect, it } from 'vitest'
import {
  ARRIVAL_THRESHOLD_WORLD_UNITS,
  DEFAULT_WALK_SPEED_WORLD_UNITS_PER_SECOND,
  computeWalkLimbAngles,
  deriveNeutralLimbAngles,
  settleTowardNeutral,
  stepTowards,
  transition,
} from '../avatarBehavior'

describe('transition', () => {
  it('moves from idle to walking on MOVE_TO', () => {
    expect(transition('idle', { type: 'MOVE_TO', destination: { x: 10, y: 10 } })).toBe('walking')
  })

  it('moves from walking to idle on ARRIVED', () => {
    expect(transition('walking', { type: 'ARRIVED' })).toBe('idle')
  })

  it('retargeting mid-walk (MOVE_TO while already walking) stays walking', () => {
    expect(transition('walking', { type: 'MOVE_TO', destination: { x: 20, y: 20 } })).toBe('walking')
  })

  it('moves from idle to sitting on SIT', () => {
    expect(transition('idle', { type: 'SIT' })).toBe('sitting')
  })

  it('moves from idle to lying on LIE', () => {
    expect(transition('idle', { type: 'LIE' })).toBe('lying')
  })

  it('moves from sitting back to idle on STAND', () => {
    expect(transition('sitting', { type: 'STAND' })).toBe('idle')
  })

  it('moves from lying back to idle on STAND', () => {
    expect(transition('lying', { type: 'STAND' })).toBe('idle')
  })
})

describe('stepTowards', () => {
  it('moves toward the destination at the given speed, proportional to elapsed time', () => {
    const position = { x: 0, y: 0 }
    const destination = { x: 100, y: 0 }
    const result = stepTowards(position, destination, 50, 1) // 50 world units/sec for 1s
    expect(result.arrived).toBe(false)
    expect(result.position.x).toBeCloseTo(50)
    expect(result.position.y).toBeCloseTo(0)
  })

  it('produces the same total displacement regardless of frame rate (10x0.1s == 1x1s)', () => {
    const destination = { x: 200, y: 0 }
    const speed = 60

    let manyFrames = { x: 0, y: 0 }
    for (let i = 0; i < 10; i++) {
      manyFrames = stepTowards(manyFrames, destination, speed, 0.1).position
    }

    const oneFrame = stepTowards({ x: 0, y: 0 }, destination, speed, 1).position

    expect(manyFrames.x).toBeCloseTo(oneFrame.x, 5)
    expect(manyFrames.y).toBeCloseTo(oneFrame.y, 5)
  })

  it('reports facing right when moving in +x and left when moving in -x', () => {
    expect(stepTowards({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 0.1).facing).toBe('right')
    expect(stepTowards({ x: 100, y: 0 }, { x: 0, y: 0 }, 10, 0.1).facing).toBe('left')
  })

  it('reports no facing change for purely vertical movement', () => {
    expect(stepTowards({ x: 50, y: 0 }, { x: 50, y: 100 }, 10, 0.1).facing).toBeNull()
  })

  it('snaps to the destination and reports arrived once within the arrival threshold', () => {
    const destination = { x: 100, y: 100 }
    const almostThere = { x: 100, y: 100 - (ARRIVAL_THRESHOLD_WORLD_UNITS - 1) }
    const result = stepTowards(almostThere, destination, 50, 1)
    expect(result.arrived).toBe(true)
    expect(result.position).toEqual(destination)
  })

  it('snaps to the destination when a step would overshoot it, rather than passing through', () => {
    const position = { x: 0, y: 0 }
    const destination = { x: 10, y: 0 }
    // At 1000 units/sec for 1s, a naive step would travel 1000 units — far
    // past the 10-unit-away destination.
    const result = stepTowards(position, destination, 1000, 1)
    expect(result.arrived).toBe(true)
    expect(result.position).toEqual(destination)
  })
})

describe('DEFAULT_WALK_SPEED_WORLD_UNITS_PER_SECOND', () => {
  it('is a calm, configurable-but-sensible walking pace, not the old brisk default', () => {
    // Regression guard for the "avatars move too fast" manual-inspection
    // finding — this was 110 before; not pinning an exact number (a later
    // slice may retune it further), just that it stayed meaningfully calmer.
    expect(DEFAULT_WALK_SPEED_WORLD_UNITS_PER_SECOND).toBeLessThan(80)
    expect(DEFAULT_WALK_SPEED_WORLD_UNITS_PER_SECOND).toBeGreaterThan(0)
  })
})

describe('deriveNeutralLimbAngles', () => {
  it("derives opposing leg neutrals from a character's legStanceRotation", () => {
    const neutral = deriveNeutralLimbAngles({ legStanceRotation: 0.04 })
    expect(neutral.leftLeg).toBeCloseTo(0.04)
    expect(neutral.rightLeg).toBeCloseTo(-0.04)
    expect(neutral.leftArm).toBe(0)
    expect(neutral.rightArm).toBe(0)
  })

  it('neutrals everything at 0 for a character with no legStanceRotation (e.g. female)', () => {
    const neutral = deriveNeutralLimbAngles({})
    expect(neutral).toEqual({ leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0 })
  })
})

describe('computeWalkLimbAngles', () => {
  const neutral = { leftLeg: 0.04, rightLeg: -0.04, leftArm: 0, rightArm: 0 }

  it('swings left/right legs in opposing directions around their own neutral', () => {
    // Pick a time where sin(t * frequency * 2π) is unambiguously non-zero.
    const angles = computeWalkLimbAngles(0.15, neutral, { legRadians: 0.16, armRadians: 0.1 }, 1.7)
    const legSwing = angles.leftLeg! - neutral.leftLeg
    const oppositeLegSwing = angles.rightLeg! - neutral.rightLeg
    expect(legSwing).not.toBeCloseTo(0, 3)
    expect(legSwing).toBeCloseTo(-oppositeLegSwing, 5)
  })

  it("swings each arm opposite its corresponding leg, not its own side's neutral", () => {
    const angles = computeWalkLimbAngles(0.15, neutral, { legRadians: 0.16, armRadians: 0.1 }, 1.7)
    const leftLegSwing = angles.leftLeg! - neutral.leftLeg
    const leftArmSwing = angles.leftArm! - neutral.leftArm
    expect(Math.sign(leftArmSwing)).toBe(-Math.sign(leftLegSwing))
  })

  it('returns exactly neutral at the start of a walk cycle (t=0)', () => {
    const angles = computeWalkLimbAngles(0, neutral)
    expect(angles).toEqual(neutral)
  })
})

describe('settleTowardNeutral', () => {
  const neutral = { leftLeg: 0.04, rightLeg: -0.04, leftArm: 0, rightArm: 0 }
  const midStride = { leftLeg: 0.2, rightLeg: -0.2, leftArm: -0.1, rightArm: 0.1 }

  it('returns the starting angles unchanged at t=0', () => {
    expect(settleTowardNeutral(midStride, neutral, 0)).toEqual(midStride)
  })

  it('returns exactly neutral at t=1', () => {
    expect(settleTowardNeutral(midStride, neutral, 1)).toEqual(neutral)
  })

  it('is partway between start and neutral at t=0.5', () => {
    const halfway = settleTowardNeutral(midStride, neutral, 0.5)
    expect(halfway.leftLeg).toBeCloseTo((midStride.leftLeg + neutral.leftLeg) / 2)
  })

  it('clamps out-of-range t instead of overshooting past neutral', () => {
    expect(settleTowardNeutral(midStride, neutral, 5)).toEqual(neutral)
    expect(settleTowardNeutral(midStride, neutral, -5)).toEqual(midStride)
  })
})
