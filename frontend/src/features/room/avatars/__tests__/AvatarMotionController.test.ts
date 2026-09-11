import { Sprite, Texture, TextureSource } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { AvatarMotionController } from '../AvatarMotionController'
import { AvatarRig } from '../AvatarRig'
import type { AvatarTextures } from '../AvatarRig'
import { FEMALE_AVATAR_CONFIG, MALE_AVATAR_CONFIG } from '../avatarConfigs'
import { SETTLE_DURATION_SECONDS } from '../avatarBehavior'
import { FURNITURE_OBSTACLES, WALKABLE_FLOOR_ZONES } from '../../walkableArea'

const FAKE_BASE_SCALE = 1

function fakeTextures(): AvatarTextures {
  return {
    headIdle: Texture.WHITE,
    headSad: Texture.EMPTY,
    bodyBase: Texture.WHITE,
    arm: Texture.WHITE,
    leg: Texture.WHITE,
    bodySitting: new Texture({ source: new TextureSource({ width: 10, height: 10 }) }),
    bodyLying: new Texture({ source: new TextureSource({ width: 10, height: 10 }) }),
  }
}

function findByLabel(rig: AvatarRig, label: string): Sprite {
  const found = rig.container.children.find((child) => child.label === label)
  if (!found) throw new Error(`No child labeled "${label}"`)
  return found as Sprite
}

// Fast, deterministic — a high speed and coarse-but-plentiful ticks keep
// these tests quick without needing real-time waits.
const FAST_SPEED = 10_000

describe('AvatarMotionController', () => {
  it('starts idle, at the given initial position, with no destination', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 })

    expect(controller.getState()).toBe('idle')
    expect(controller.getPosition()).toEqual({ x: 500, y: 700 })
    expect(rig.container.position.x).toBe(500)
    expect(rig.container.position.y).toBe(700)
  })

  it('enters walking immediately on moveTo', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 })

    controller.moveTo({ x: 600, y: 700 })
    expect(controller.getState()).toBe('walking')
  })

  it('moves the rig container toward the destination over successive updates', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 }, 50)

    controller.moveTo({ x: 600, y: 700 })
    controller.update(0.1) // 50 units/sec * 0.1s = 5 units of travel

    expect(controller.getPosition().x).toBeCloseTo(505)
    expect(rig.container.position.x).toBeCloseTo(505)
  })

  it('arrives, snaps exactly to the destination, and returns to idle', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 }, FAST_SPEED)

    controller.moveTo({ x: 600, y: 700 })
    controller.update(1) // FAST_SPEED * 1s vastly exceeds the 100-unit distance

    expect(controller.getState()).toBe('idle')
    expect(controller.getPosition()).toEqual({ x: 600, y: 700 })
  })

  it('restores male legs to their calibrated legStanceRotation neutral (not zero) once settled', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 }, FAST_SPEED)
    const stanceRotation = MALE_AVATAR_CONFIG.legStanceRotation
    expect(stanceRotation).toBeTruthy() // guards this test against the config losing its stance rotation

    controller.moveTo({ x: 600, y: 700 })
    controller.update(1) // arrives within this single update
    controller.update(SETTLE_DURATION_SECONDS + 0.1) // finishes the settle-to-neutral phase

    expect(findByLabel(rig, 'left-leg').rotation).toBeCloseTo(stanceRotation as number)
    expect(findByLabel(rig, 'right-leg').rotation).toBeCloseTo(-(stanceRotation as number))
  })

  it('restores female legs to zero (no legStanceRotation) once settled', () => {
    const rig = new AvatarRig(FEMALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const controller = new AvatarMotionController(rig, FEMALE_AVATAR_CONFIG, { x: 500, y: 700 }, FAST_SPEED)
    expect(FEMALE_AVATAR_CONFIG.legStanceRotation).toBeUndefined() // guards the female/male config distinction this test relies on

    controller.moveTo({ x: 600, y: 700 })
    controller.update(1)
    controller.update(SETTLE_DURATION_SECONDS + 0.1)

    expect(findByLabel(rig, 'left-leg').rotation).toBeCloseTo(0)
    expect(findByLabel(rig, 'right-leg').rotation).toBeCloseTo(0)
  })

  it('animates opposing leg swing while walking (not a static pose)', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 }, 50)

    controller.moveTo({ x: 2000, y: 700 }) // clamped by walkable area, but far enough to stay walking
    controller.update(0.2)

    const leftLeg = findByLabel(rig, 'left-leg').rotation
    const rightLeg = findByLabel(rig, 'right-leg').rotation
    const neutralLeft = MALE_AVATAR_CONFIG.legStanceRotation ?? 0
    const neutralRight = -neutralLeft
    const leftSwing = leftLeg - neutralLeft
    const rightSwing = rightLeg - neutralRight
    // Mid-stride, the legs should have swung measurably away from their
    // static neutral — otherwise this is just standing still, not walking —
    // and in opposite directions from each other.
    expect(Math.abs(leftSwing)).toBeGreaterThan(0.001)
    expect(leftSwing).toBeCloseTo(-rightSwing, 5)
  })

  it('flips the container horizontally to face the walk direction, preserving the scale magnitude', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 })
    const magnitude = Math.abs(rig.container.scale.x)

    controller.moveTo({ x: 400, y: 700 }) // to the left
    controller.update(0.05)
    expect(rig.container.scale.x).toBeCloseTo(-magnitude)

    controller.moveTo({ x: 900, y: 700 }) // now to the right
    controller.update(0.05)
    expect(rig.container.scale.x).toBeCloseTo(magnitude)
  })

  it('preserves the approved male:female relative scale regardless of facing changes', () => {
    const maleRig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const femaleRig = new AvatarRig(FEMALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const maleController = new AvatarMotionController(maleRig, MALE_AVATAR_CONFIG, { x: 500, y: 700 })
    const femaleController = new AvatarMotionController(femaleRig, FEMALE_AVATAR_CONFIG, { x: 500, y: 700 })

    maleController.moveTo({ x: 300, y: 700 })
    maleController.update(0.05)
    femaleController.moveTo({ x: 700, y: 700 })
    femaleController.update(0.05)

    const ratio = Math.abs(maleRig.container.scale.x) / Math.abs(femaleRig.container.scale.x)
    expect(ratio).toBeCloseTo(MALE_AVATAR_CONFIG.relativeScale / FEMALE_AVATAR_CONFIG.relativeScale, 5)
  })

  it('clamps an out-of-bounds destination to the walkable area instead of walking through a wall', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 }, FAST_SPEED)

    const zone = WALKABLE_FLOOR_ZONES[0]
    controller.moveTo({ x: zone.x0 - 1000, y: (zone.y0 + zone.y1) / 2 }) // far outside the walkable area
    controller.update(1)

    expect(controller.getState()).toBe('idle')
    expect(controller.getPosition().x).toBeCloseTo(zone.x0)
  })

  it('routes around a blocked obstacle via a detour waypoint, then still arrives at the real destination', () => {
    const couch = FURNITURE_OBSTACLES[0]
    const couchCenterY = (couch.y0 + couch.y1) / 2
    const start = { x: couch.x0 - 200, y: couchCenterY }
    const destination = { x: couch.x1 + 200, y: couchCenterY }

    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, start, FAST_SPEED)

    controller.moveTo(destination)
    // Several fast updates: first arrives at the detour waypoint (still
    // walking, no settle), then continues on to the real destination.
    for (let i = 0; i < 5; i++) controller.update(1)

    expect(controller.getState()).toBe('idle')
    expect(controller.getPosition()).toEqual(destination)
  })

  // Regression guards: an earlier pass added a whole-container travel
  // lean and a vertical walk bob, both removed after manual inspection —
  // the lean read as falling over (no real directional art to justify
  // it) and the bob read as a shake/vibration rather than footsteps. The
  // container must only ever translate and mirror (scale.x), never rotate
  // or bounce, while walking, mid-route, or settling.
  it('never rotates the container while walking (whole-body lean was removed)', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 }, 50)

    controller.moveTo({ x: 900, y: 700 }) // purely horizontal — would have been maximal lean
    controller.update(0.05)

    expect(rig.container.rotation).toBe(0)
  })

  it('keeps container.position.y exactly on the logical Y line while walking (no vertical bob)', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 }, 50)

    controller.moveTo({ x: 900, y: 750 })
    for (let i = 0; i < 5; i++) {
      controller.update(0.05)
      expect(rig.container.position.y).toBeCloseTo(controller.getPosition().y)
    }
  })

  it('stays unrotated through the whole walking->settling->idle sequence', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 }, FAST_SPEED)

    controller.moveTo({ x: 600, y: 700 })
    controller.update(1) // arrives
    expect(rig.container.rotation).toBe(0)
    controller.update(SETTLE_DURATION_SECONDS + 0.1) // finishes settling
    expect(rig.container.rotation).toBe(0)
  })

  describe('sitAt / lieAt / standUp', () => {
    it('sitAt moves to the given position, applies the sitting pose, and enters the sitting state', () => {
      const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
      const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 })

      controller.sitAt({ x: 744, y: 610 })

      expect(controller.getState()).toBe('sitting')
      expect(controller.getPosition()).toEqual({ x: 744, y: 610 })
      expect(rig.container.position.x).toBe(744)
      expect(rig.container.position.y).toBe(610)
      expect(rig.getPose()).toBe('sitting')
    })

    it('lieAt moves to the given position, applies the lying pose, and enters the lying state', () => {
      const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
      const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 })

      controller.lieAt({ x: 1100, y: 370 })

      expect(controller.getState()).toBe('lying')
      expect(controller.getPosition()).toEqual({ x: 1100, y: 370 })
      expect(rig.getPose()).toBe('lying')
    })

    it('standUp returns to idle, in place, with the standing pose restored', () => {
      const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
      const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 })

      controller.sitAt({ x: 744, y: 610 })
      controller.standUp()

      expect(controller.getState()).toBe('idle')
      expect(controller.getPosition()).toEqual({ x: 744, y: 610 }) // stands up IN PLACE, doesn't teleport
      expect(rig.getPose()).toBe('standing')
    })

    it('supports the realistic walk-then-sit sequence: walking -> idle (arrival) -> sitting', () => {
      const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
      const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 }, FAST_SPEED)

      controller.moveTo({ x: 744, y: 660 }) // the couch's approach point
      expect(controller.getState()).toBe('walking')
      controller.update(1) // arrives
      expect(controller.getState()).toBe('idle')

      controller.sitAt({ x: 744, y: 610 }) // the couch's own authored seat position
      expect(controller.getState()).toBe('sitting')
    })

    it('a walk requested while sitting stands the rig back up into a normal walk', () => {
      const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
      const controller = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, { x: 500, y: 700 }, FAST_SPEED)

      controller.sitAt({ x: 744, y: 610 })
      controller.standUp()
      controller.moveTo({ x: 600, y: 700 })

      expect(controller.getState()).toBe('walking')
      expect(rig.getPose()).toBe('standing')
    })
  })
})
