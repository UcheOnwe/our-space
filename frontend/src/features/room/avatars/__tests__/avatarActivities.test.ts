import { describe, expect, it } from 'vitest'
import {
  BED_ACTIVITY_POINTS,
  COUCH_ACTIVITY_POINTS,
  IDLE_DURATION_RANGE_SECONDS,
  LIE_DURATION_RANGE_SECONDS,
  SIT_DURATION_RANGE_SECONDS,
  WANDER_POINTS,
  allApproachPointsAreWalkable,
  chooseNextActivity,
  pickIdleDuration,
  pickLieDuration,
  pickSitDuration,
  randomElement,
  weightedChoice,
} from '../avatarActivities'
import { findBlockingObstacle, isWithinWalkableArea } from '../../walkableArea'

/** A fully deterministic RandomSource for tests — returns a fixed queue of
 * values in order (repeating the last one if called more times than
 * provided), so a test can pin exactly what `Math.random()` would have
 * returned instead of depending on real randomness. */
function scriptedRandom(...values: number[]): () => number {
  let index = 0
  return () => {
    const value = values[Math.min(index, values.length - 1)]
    index++
    return value
  }
}

describe('weightedChoice', () => {
  it('always returns the only option when there is just one', () => {
    expect(weightedChoice([{ value: 'only', weight: 5 }], scriptedRandom(0))).toBe('only')
    expect(weightedChoice([{ value: 'only', weight: 5 }], scriptedRandom(0.999))).toBe('only')
  })

  it('picks the first option when random() returns 0', () => {
    const options = [
      { value: 'a', weight: 1 },
      { value: 'b', weight: 1 },
    ]
    expect(weightedChoice(options, scriptedRandom(0))).toBe('a')
  })

  it('picks proportionally to weight, not by index count', () => {
    // weights [1, 3] -> cumulative [1, 4]; random()=0.5 * total(4) = 2,
    // which falls past the first option's weight (1) into the second's.
    const options = [
      { value: 'rare', weight: 1 },
      { value: 'common', weight: 3 },
    ]
    expect(weightedChoice(options, scriptedRandom(0.5))).toBe('common')
  })

  it('is deterministic: the same random source always produces the same choice', () => {
    const options = [
      { value: 'a', weight: 1 },
      { value: 'b', weight: 2 },
      { value: 'c', weight: 3 },
    ]
    const results = Array.from({ length: 5 }, () => weightedChoice(options, scriptedRandom(0.7)))
    expect(new Set(results).size).toBe(1)
  })
})

describe('randomElement', () => {
  it('returns the first element when random() returns 0', () => {
    expect(randomElement(['a', 'b', 'c'], scriptedRandom(0))).toBe('a')
  })

  it('returns the last element for a value just under 1', () => {
    expect(randomElement(['a', 'b', 'c'], scriptedRandom(0.999))).toBe('c')
  })
})

describe('chooseNextActivity', () => {
  it('never selects the activity kind that was just performed (the one eligibility rule)', () => {
    // Force random() toward the highest-weight end of the distribution —
    // with nothing excluded, that's 'wander' (weight 6 of 9); confirm
    // instead that excluding 'wander' as the last activity steers the
    // choice to one of the two remaining options.
    const forcedHigh = scriptedRandom(0.999, 0.999)
    const activity = chooseNextActivity(forcedHigh, 'wander')
    expect(activity.kind).not.toBe('wander')
  })

  it('excludes lie-bed specifically when it was the last activity performed', () => {
    for (let trial = 0; trial < 20; trial++) {
      const random = scriptedRandom(trial / 20, 0.5)
      const activity = chooseNextActivity(random, 'lie-bed')
      expect(activity.kind).not.toBe('lie-bed')
    }
  })

  it('excludes nothing when no activity has been performed yet (lastActivityKind: null)', () => {
    // Every possible chosen kind must still be one of the three known
    // kinds — this just confirms `null` doesn't accidentally exclude
    // everything (see the defensive fallback in chooseNextActivity).
    for (let trial = 0; trial <= 10; trial++) {
      const random = scriptedRandom(trial / 10, 0.5)
      const activity = chooseNextActivity(random, null)
      expect(['wander', 'sit-couch', 'lie-bed']).toContain(activity.kind)
    }
  })

  it('a wander activity arrives to idle, with no pose position', () => {
    const activity = chooseNextActivity(scriptedRandom(0, 0), 'lie-bed') // low value -> wander
    expect(activity.kind).toBe('wander')
    expect(activity.arrivalState).toBe('idle')
    expect(activity.posePosition).toBeUndefined()
    expect(WANDER_POINTS).toContainEqual(activity.approach)
  })

  it('a sit-couch activity arrives to sitting, at the authored couch pose position', () => {
    // weights [wander 6, sit-couch 2] once lie-bed is excluded, cumulative
    // [6, 8] of total 8 -> random() just past 6/8=0.75 lands in sit-couch.
    const activity = chooseNextActivity(scriptedRandom(0.8), 'lie-bed')
    expect(activity.kind).toBe('sit-couch')
    expect(activity.arrivalState).toBe('sitting')
    expect(activity.approach).toEqual(COUCH_ACTIVITY_POINTS.approach)
    expect(activity.posePosition).toEqual(COUCH_ACTIVITY_POINTS.pose)
  })

  it('a lie-bed activity arrives to lying, at the authored bed pose position', () => {
    // weights [wander 6, lie-bed 1] once sit-couch is excluded, total 7 ->
    // random() close to 1 lands past wander's 6/7 share into lie-bed.
    const activity = chooseNextActivity(scriptedRandom(0.99), 'sit-couch')
    expect(activity.kind).toBe('lie-bed')
    expect(activity.arrivalState).toBe('lying')
    expect(activity.approach).toEqual(BED_ACTIVITY_POINTS.approach)
    expect(activity.posePosition).toEqual(BED_ACTIVITY_POINTS.pose)
  })

  it('is deterministic: a fixed random source always chooses the same activity', () => {
    const random = scriptedRandom(0.42, 0.13)
    const first = chooseNextActivity(random, null)
    const second = chooseNextActivity(scriptedRandom(0.42, 0.13), null)
    expect(first).toEqual(second)
  })
})

describe('autonomous destinations remain walkable', () => {
  it('every wander point is inside a walkable floor zone', () => {
    for (const point of WANDER_POINTS) {
      expect(isWithinWalkableArea(point.x, point.y)).toBe(true)
    }
  })

  it("the couch and bed approach points are walkable, and aren't inside any furniture obstacle", () => {
    for (const approach of [COUCH_ACTIVITY_POINTS.approach, BED_ACTIVITY_POINTS.approach]) {
      expect(isWithinWalkableArea(approach.x, approach.y)).toBe(true)
      // A point strictly inside an obstacle rect blocks the trivial
      // zero-length segment from itself to itself — the same check
      // findBlockingObstacle already does for a real walk.
      expect(findBlockingObstacle(approach, approach)).toBeNull()
    }
  })

  it('allApproachPointsAreWalkable reports true for the whole authored set', () => {
    expect(allApproachPointsAreWalkable()).toBe(true)
  })
})

describe('duration pickers', () => {
  it('pickIdleDuration stays within its documented range', () => {
    for (const value of [0, 0.25, 0.5, 0.75, 0.999]) {
      const duration = pickIdleDuration(scriptedRandom(value))
      expect(duration).toBeGreaterThanOrEqual(IDLE_DURATION_RANGE_SECONDS.min)
      expect(duration).toBeLessThan(IDLE_DURATION_RANGE_SECONDS.max)
    }
  })

  it('pickSitDuration stays within its documented range', () => {
    for (const value of [0, 0.25, 0.5, 0.75, 0.999]) {
      const duration = pickSitDuration(scriptedRandom(value))
      expect(duration).toBeGreaterThanOrEqual(SIT_DURATION_RANGE_SECONDS.min)
      expect(duration).toBeLessThan(SIT_DURATION_RANGE_SECONDS.max)
    }
  })

  it('pickLieDuration stays within its documented range', () => {
    for (const value of [0, 0.25, 0.5, 0.75, 0.999]) {
      const duration = pickLieDuration(scriptedRandom(value))
      expect(duration).toBeGreaterThanOrEqual(LIE_DURATION_RANGE_SECONDS.min)
      expect(duration).toBeLessThan(LIE_DURATION_RANGE_SECONDS.max)
    }
  })

  it('sit/lie/idle ranges give meaningfully different typical durations (not all the same knob)', () => {
    // Not pinned to exact numbers (a later slice may retune them), just
    // that idle stays clearly shorter than a sit, and a sit no longer
    // than a lie — matching "stand for a bit" vs. "sit/lie for a while."
    expect(IDLE_DURATION_RANGE_SECONDS.max).toBeLessThanOrEqual(SIT_DURATION_RANGE_SECONDS.min)
    expect(SIT_DURATION_RANGE_SECONDS.max).toBeLessThanOrEqual(LIE_DURATION_RANGE_SECONDS.max)
  })
})
