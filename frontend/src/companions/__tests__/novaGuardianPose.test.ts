import { describe, expect, it } from 'vitest'
import { NOVA_GUARDIAN_IDLE_POSE, computeNovaGuardianPose } from '../novaGuardianPose'

describe('computeNovaGuardianPose — idle', () => {
  it('returns the idle pose (not flying, poseMode "idle") for zero direction', () => {
    const pose = computeNovaGuardianPose({ x: 0, y: 0 })
    expect(pose).toEqual(NOVA_GUARDIAN_IDLE_POSE)
    expect(pose.isFlying).toBe(false)
    expect(pose.trailDirection).toEqual({ x: 0, y: 0 })
  })
})

describe('computeNovaGuardianPose — cardinal directions', () => {
  it('right (1,0): side pose, faces right (not mirrored), no bank, trail points left', () => {
    const pose = computeNovaGuardianPose({ x: 1, y: 0 })
    expect(pose.isFlying).toBe(true)
    expect(pose.poseMode).toBe('side')
    expect(pose.facingLeft).toBe(false)
    expect(pose.bankDeg).toBe(0)
    expect(pose.trailDirection).toEqual({ x: -1, y: 0 })
  })

  it('left (-1,0): side pose, mirrored (facingLeft), no bank, trail points right', () => {
    const pose = computeNovaGuardianPose({ x: -1, y: 0 })
    expect(pose.isFlying).toBe(true)
    expect(pose.poseMode).toBe('side')
    expect(pose.facingLeft).toBe(true)
    expect(pose.bankDeg).toBe(0)
    expect(pose.trailDirection).toEqual({ x: 1, y: 0 })
  })

  it('up (0,-1): dedicated vertical-up pose, trail points down', () => {
    const pose = computeNovaGuardianPose({ x: 0, y: -1 })
    expect(pose.isFlying).toBe(true)
    expect(pose.poseMode).toBe('vertical-up')
    expect(pose.trailDirection).toEqual({ x: 0, y: 1 })
  })

  it('down (0,1): dedicated vertical-down pose, trail points up', () => {
    const pose = computeNovaGuardianPose({ x: 0, y: 1 })
    expect(pose.isFlying).toBe(true)
    expect(pose.poseMode).toBe('vertical-down')
    expect(pose.trailDirection).toEqual({ x: 0, y: -1 })
  })

  it('vertical poses never mirror (facingLeft is always false) and never bank', () => {
    expect(computeNovaGuardianPose({ x: 0, y: -1 }).facingLeft).toBe(false)
    expect(computeNovaGuardianPose({ x: 0, y: -1 }).bankDeg).toBe(0)
    expect(computeNovaGuardianPose({ x: 0, y: 1 }).facingLeft).toBe(false)
    expect(computeNovaGuardianPose({ x: 0, y: 1 }).bankDeg).toBe(0)
  })
})

describe('computeNovaGuardianPose — diagonals (banked side pose)', () => {
  it('up-right: faces right, banks toward up, trail points down-left', () => {
    const pose = computeNovaGuardianPose({ x: 1, y: -1 })
    expect(pose.poseMode).toBe('side')
    expect(pose.facingLeft).toBe(false)
    expect(pose.bankDeg).toBeLessThan(0)
    expect(pose.trailDirection).toEqual({ x: -1, y: 1 })
  })

  it('up-left: faces left (mirrored), banks the SAME direction as up-right (mirror handles the flip)', () => {
    const upRight = computeNovaGuardianPose({ x: 1, y: -1 })
    const upLeft = computeNovaGuardianPose({ x: -1, y: -1 })
    expect(upLeft.poseMode).toBe('side')
    expect(upLeft.facingLeft).toBe(true)
    expect(upLeft.bankDeg).toBe(upRight.bankDeg)
    expect(upLeft.trailDirection).toEqual({ x: 1, y: 1 })
  })

  it('down-right: faces right, banks toward down, trail points up-left', () => {
    const pose = computeNovaGuardianPose({ x: 1, y: 1 })
    expect(pose.poseMode).toBe('side')
    expect(pose.facingLeft).toBe(false)
    expect(pose.bankDeg).toBeGreaterThan(0)
    expect(pose.trailDirection).toEqual({ x: -1, y: -1 })
  })

  it('down-left: faces left (mirrored), banks the SAME direction as down-right, trail points up-right', () => {
    const downRight = computeNovaGuardianPose({ x: 1, y: 1 })
    const downLeft = computeNovaGuardianPose({ x: -1, y: 1 })
    expect(downLeft.poseMode).toBe('side')
    expect(downLeft.facingLeft).toBe(true)
    expect(downLeft.bankDeg).toBe(downRight.bankDeg)
    expect(downLeft.trailDirection).toEqual({ x: 1, y: -1 })
  })

  it('banks up-diagonals and down-diagonals in opposite directions from each other', () => {
    const up = computeNovaGuardianPose({ x: 1, y: -1 }).bankDeg
    const down = computeNovaGuardianPose({ x: 1, y: 1 }).bankDeg
    expect(Math.sign(up)).not.toBe(Math.sign(down))
  })
})

describe('computeNovaGuardianPose — trailDirection is always exactly the negated movement direction', () => {
  const cases: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, -1],
    [0, 1],
    [1, -1],
    [-1, -1],
    [1, 1],
    [-1, 1],
  ]

  it.each(cases)('direction (%d, %d)', (x, y) => {
    const pose = computeNovaGuardianPose({ x, y })
    // `-x || 0` normalizes away `-0` (e.g. negating a zero x-axis for
    // pure vertical travel) — a real, harmless JS quirk, not a bug;
    // `toEqual` otherwise distinguishes -0 from 0.
    expect(pose.trailDirection).toEqual({ x: -x || 0, y: -y || 0 })
  })
})

describe('computeNovaGuardianPose — arm swing', () => {
  it('side pose gives the lead and trail arm different, non-zero swings', () => {
    const pose = computeNovaGuardianPose({ x: 1, y: 0 })
    expect(pose.leadArmSwingDeg).not.toBe(0)
    expect(pose.trailArmSwingDeg).not.toBe(0)
    expect(pose.leadArmSwingDeg).not.toBe(pose.trailArmSwingDeg)
  })

  it('side pose uses the identical arm swing regardless of facing (mirroring handles left vs right)', () => {
    const right = computeNovaGuardianPose({ x: 1, y: 0 })
    const left = computeNovaGuardianPose({ x: -1, y: 0 })
    expect(right.leadArmSwingDeg).toBe(left.leadArmSwingDeg)
    expect(right.trailArmSwingDeg).toBe(left.trailArmSwingDeg)
  })

  it('vertical poses swing both arms identically (no lead/trail distinction when travel is purely vertical)', () => {
    const up = computeNovaGuardianPose({ x: 0, y: -1 })
    expect(up.leadArmSwingDeg).toBe(up.trailArmSwingDeg)
    const down = computeNovaGuardianPose({ x: 0, y: 1 })
    expect(down.leadArmSwingDeg).toBe(down.trailArmSwingDeg)
  })

  it('vertical-up and vertical-down use different arm swings from each other', () => {
    const up = computeNovaGuardianPose({ x: 0, y: -1 })
    const down = computeNovaGuardianPose({ x: 0, y: 1 })
    expect(up.leadArmSwingDeg).not.toBe(down.leadArmSwingDeg)
  })

  it('idle keeps both arms at their natural drawn rest angle (zero swing)', () => {
    expect(NOVA_GUARDIAN_IDLE_POSE.leadArmSwingDeg).toBe(0)
    expect(NOVA_GUARDIAN_IDLE_POSE.trailArmSwingDeg).toBe(0)
  })
})

describe('computeNovaGuardianPose — magnitude independence', () => {
  it('an unnormalized diagonal direction produces the same pose as a unit one (Math.sign discards magnitude)', () => {
    const small = computeNovaGuardianPose({ x: 0.1, y: -0.1 })
    const large = computeNovaGuardianPose({ x: 50, y: -50 })
    expect(small).toEqual(large)
  })
})
