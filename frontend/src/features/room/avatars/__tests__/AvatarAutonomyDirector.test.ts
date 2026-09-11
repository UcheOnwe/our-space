import { Texture, TextureSource } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { AvatarAutonomyDirector } from '../AvatarAutonomyDirector'
import { AvatarMotionController } from '../AvatarMotionController'
import { AvatarRig } from '../AvatarRig'
import type { AvatarTextures } from '../AvatarRig'
import { MALE_AVATAR_CONFIG } from '../avatarConfigs'
import { COUCH_ACTIVITY_POINTS, pickIdleDuration } from '../avatarActivities'

const FAKE_BASE_SCALE = 1
// Vastly exceeds any distance in the room, so a chosen walk always
// resolves within a single `update()` call — the same fast-forwarding
// convention AvatarMotionController.test.ts already uses.
const FAST_SPEED = 10_000

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

function makeDirector(random: () => number, position = { x: 500, y: 700 }) {
  const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
  const motion = new AvatarMotionController(rig, MALE_AVATAR_CONFIG, position, FAST_SPEED)
  const director = new AvatarAutonomyDirector(motion, random)
  return { rig, motion, director }
}

/** Always returns the same value — deterministic, and since
 * pickIdleDuration/pickSitDuration/pickLieDuration/weightedChoice all just
 * call `random()` once (or twice, for a wander point) per decision, a
 * fixed value makes each KIND of decision reproducible on its own while
 * still varying naturally between kinds (idle vs. sit vs. lie durations
 * differ because their ranges differ, not because the input does). */
function constantRandom(value: number): () => number {
  return () => value
}

// With no exclusion, total weight is 9 (wander 6, sit-couch 2, lie-bed 1).
// 0.8 * 9 = 7.2, which lands past wander's 6 into sit-couch's [6, 8) band.
const PICKS_SIT_COUCH_FIRST = 0.8
// Once sit-couch is excluded (total 7: wander 6, lie-bed 1), the SAME 0.8
// lands at 5.6, still inside wander's [0, 6) band — i.e. after sitting,
// PICKS_SIT_COUCH_FIRST (reused below, unchanged) deterministically
// wanders next, proving the choice actually changed rather than picking
// sit-couch again.
// 0.95 * 9 = 8.55, past both wander's 6 and sit-couch's 2 (cumulative 8)
// into lie-bed's final [8, 9) band.
const PICKS_LIE_BED_FIRST = 0.95

describe('AvatarAutonomyDirector', () => {
  it('starts idle and does not move before the initial idle wait elapses', () => {
    const { motion, director } = makeDirector(constantRandom(PICKS_SIT_COUCH_FIRST))
    director.update(0.01)
    expect(motion.getState()).toBe('idle')
    expect(director.getPendingActivityKind()).toBeNull()
  })

  it('idle -> walking: chooses an activity and starts walking once the idle wait elapses', () => {
    const { motion, director } = makeDirector(constantRandom(PICKS_SIT_COUCH_FIRST))
    const initialIdleWait = pickIdleDuration(constantRandom(PICKS_SIT_COUCH_FIRST))

    director.update(initialIdleWait + 0.1)

    expect(motion.getState()).toBe('walking')
    expect(director.getPendingActivityKind()).toBe('sit-couch')
  })

  it('walking -> idle: a plain wander activity settles back into idle on arrival, with no pose change', () => {
    // 0 * 9 = 0, squarely in wander's [0, 6) band.
    const { rig, motion, director } = makeDirector(constantRandom(0))
    director.update(pickIdleDuration(constantRandom(0)) + 0.1) // choose + start walking
    expect(motion.getState()).toBe('walking')

    director.update(1) // arrives (FAST_SPEED)

    expect(motion.getState()).toBe('idle')
    expect(rig.getPose()).toBe('standing')
    expect(director.getLastActivityKind()).toBe('wander')
  })

  it('walking -> sitting: arriving at the couch activity sits the avatar at its authored pose position', () => {
    const { rig, motion, director } = makeDirector(constantRandom(PICKS_SIT_COUCH_FIRST))
    const initialIdleWait = pickIdleDuration(constantRandom(PICKS_SIT_COUCH_FIRST))
    director.update(initialIdleWait + 0.1) // choose sit-couch + start walking

    director.update(1) // arrives (FAST_SPEED)

    expect(motion.getState()).toBe('sitting')
    expect(rig.getPose()).toBe('sitting')
    expect(motion.getPosition()).toEqual(COUCH_ACTIVITY_POINTS.pose)
    expect(director.getLastActivityKind()).toBe('sit-couch')
  })

  it('sitting duration -> standing -> a different next activity is chosen', () => {
    const { rig, motion, director } = makeDirector(constantRandom(PICKS_SIT_COUCH_FIRST))
    director.update(pickIdleDuration(constantRandom(PICKS_SIT_COUCH_FIRST)) + 0.1) // choose + walk
    director.update(1) // arrive + sit
    expect(motion.getState()).toBe('sitting')

    // Blow well past even the longest possible sit duration.
    director.update(60)

    expect(motion.getState()).toBe('idle')
    expect(rig.getPose()).toBe('standing')

    // The fresh idle wait that standing-up started must also elapse
    // before the NEXT choice happens — one more big jump.
    director.update(60)

    expect(motion.getState()).toBe('walking')
    // sit-couch was just done, so it's excluded — this constant random
    // source deterministically wanders instead of sitting again.
    expect(director.getPendingActivityKind()).toBe('wander')
  })

  it('walking -> lying: arriving at the bed activity lies the avatar down at its authored pose position', () => {
    const { rig, motion, director } = makeDirector(constantRandom(PICKS_LIE_BED_FIRST))
    director.update(pickIdleDuration(constantRandom(PICKS_LIE_BED_FIRST)) + 0.1)
    expect(director.getPendingActivityKind()).toBe('lie-bed')

    director.update(1) // arrives

    expect(motion.getState()).toBe('lying')
    expect(rig.getPose()).toBe('lying')
    expect(director.getLastActivityKind()).toBe('lie-bed')
  })

  it('lying duration -> standing -> a different next activity is chosen', () => {
    const { rig, motion, director } = makeDirector(constantRandom(PICKS_LIE_BED_FIRST))
    director.update(pickIdleDuration(constantRandom(PICKS_LIE_BED_FIRST)) + 0.1)
    director.update(1) // arrive + lie down
    expect(motion.getState()).toBe('lying')

    director.update(60) // past even the longest lie duration

    expect(motion.getState()).toBe('idle')
    expect(rig.getPose()).toBe('standing')

    director.update(60) // the fresh idle wait elapses too

    expect(motion.getState()).toBe('walking')
    expect(director.getPendingActivityKind()).not.toBe('lie-bed')
  })

  it('never chooses the couch/bed pose positions as WALKING destinations directly (walks to the approach point first)', () => {
    const { motion, director } = makeDirector(constantRandom(PICKS_SIT_COUCH_FIRST))
    director.update(pickIdleDuration(constantRandom(PICKS_SIT_COUCH_FIRST)) + 0.1)

    // The route's final target is the walkable APPROACH point, not the
    // furniture pose position — sitAt only happens on arrival, separately.
    expect(motion.getState()).toBe('walking')
    expect(motion.getPosition()).not.toEqual(COUCH_ACTIVITY_POINTS.pose)
  })

  it('is deterministic: two directors given the same random source produce the same sequence of states', () => {
    const run = () => {
      const { motion, director } = makeDirector(constantRandom(PICKS_SIT_COUCH_FIRST))
      const states: string[] = []
      const initialIdleWait = pickIdleDuration(constantRandom(PICKS_SIT_COUCH_FIRST))
      director.update(initialIdleWait + 0.1)
      states.push(motion.getState())
      director.update(1)
      states.push(motion.getState())
      director.update(60)
      states.push(motion.getState())
      return states
    }

    expect(run()).toEqual(run())
  })
})
