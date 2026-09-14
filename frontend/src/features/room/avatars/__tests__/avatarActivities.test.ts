import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_KIND_WEIGHTS,
  BED_ACTIVITY_POINTS,
  COUCH_ACTIVITY_POINTS,
  DESK_CHAIR_ACTIVITY_POINTS,
  HUG_COOLDOWN_RANGE_SECONDS,
  HUG_CONVERGE_POINTS,
  HUG_DWELL_RANGE_SECONDS,
  HUG_INTERACTION_POINT,
  HUG_SPRITE_SCALE_MULTIPLIER,
  HUG_SPRITE_WORLD_SIZE,
  IDLE_DURATION_RANGE_SECONDS,
  LIE_DURATION_RANGE_SECONDS,
  SIT_DURATION_RANGE_SECONDS,
  WANDER_POINTS,
  allApproachPointsAreWalkable,
  chooseNextActivity,
  pickHugCooldownDuration,
  pickHugDwellDuration,
  pickIdleDuration,
  pickLieDuration,
  pickSitDuration,
  randomElement,
  weightedChoice,
} from '../avatarActivities'
import { MALE_RELATIVE_SCALE, TARGET_BODY_HEIGHT_WORLD_UNITS } from '../avatarConfigs'
import { findBlockingObstacle, isWithinWalkableArea } from '../../walkableArea'

/** Recomputes the weighted-choice band boundaries directly from the real
 * exported weights, so a test can pick a `random()` value guaranteed to
 * land in a given kind's band without hand-duplicating the arithmetic (and
 * without the test silently going stale the next time a weight changes —
 * exactly the failure mode a hardcoded "0.8 * 9 = 7.2" comment had before
 * `sit-desk-chair` was added and shifted every band). `exclude` mirrors
 * chooseNextActivity's own eligibility filter. */
function randomValueLandingIn(kind: string, exclude: string[] = []): number {
  const eligible = ACTIVITY_KIND_WEIGHTS.filter((option) => !exclude.includes(option.value))
  const total = eligible.reduce((sum, option) => sum + option.weight, 0)
  let cumulative = 0
  for (const option of eligible) {
    if (option.value === kind) {
      // Middle of this option's own band — never on a boundary, which
      // floating-point rounding could otherwise nudge into its neighbor.
      return (cumulative + option.weight / 2) / total
    }
    cumulative += option.weight
  }
  throw new Error(`"${kind}" is not eligible once [${exclude.join(', ')}] are excluded`)
}

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
    // Every possible chosen kind must still be one of the four known
    // kinds — this just confirms `null` doesn't accidentally exclude
    // everything (see the defensive fallback in chooseNextActivity).
    for (let trial = 0; trial <= 10; trial++) {
      const random = scriptedRandom(trial / 10, 0.5)
      const activity = chooseNextActivity(random, null)
      expect(['wander', 'sit-couch', 'sit-desk-chair', 'lie-bed']).toContain(activity.kind)
    }
  })

  it('a wander activity arrives to idle, with no pose position', () => {
    const activity = chooseNextActivity(scriptedRandom(0, 0), 'lie-bed') // low value -> wander
    expect(activity.kind).toBe('wander')
    expect(activity.arrivalState).toBe('idle')
    expect(activity.posePosition).toBeUndefined()
    expect(WANDER_POINTS).toContainEqual(activity.approach)
  })

  it('a sit-couch activity arrives to sitting, at the authored couch pose position/scale', () => {
    const activity = chooseNextActivity(scriptedRandom(randomValueLandingIn('sit-couch', ['lie-bed'])), 'lie-bed')
    expect(activity.kind).toBe('sit-couch')
    expect(activity.arrivalState).toBe('sitting')
    expect(activity.approach).toEqual(COUCH_ACTIVITY_POINTS.approach)
    expect(activity.posePosition).toEqual(COUCH_ACTIVITY_POINTS.pose)
    expect(activity.poseScaleMultiplier).toBe(COUCH_ACTIVITY_POINTS.scaleMultiplier)
    expect(activity.poseRotation).toBe(COUCH_ACTIVITY_POINTS.rotation)
  })

  it('a sit-desk-chair activity arrives to sitting, at the authored desk-chair pose position/scale', () => {
    const activity = chooseNextActivity(scriptedRandom(randomValueLandingIn('sit-desk-chair', ['lie-bed'])), 'lie-bed')
    expect(activity.kind).toBe('sit-desk-chair')
    expect(activity.arrivalState).toBe('sitting')
    expect(activity.approach).toEqual(DESK_CHAIR_ACTIVITY_POINTS.approach)
    expect(activity.posePosition).toEqual(DESK_CHAIR_ACTIVITY_POINTS.pose)
    expect(activity.poseScaleMultiplier).toBe(DESK_CHAIR_ACTIVITY_POINTS.scaleMultiplier)
    expect(activity.poseRotation).toBe(DESK_CHAIR_ACTIVITY_POINTS.rotation)
  })

  it('a lie-bed activity arrives to lying, at the authored bed pose position and scale multiplier', () => {
    const activity = chooseNextActivity(scriptedRandom(randomValueLandingIn('lie-bed', ['sit-couch'])), 'sit-couch')
    expect(activity.kind).toBe('lie-bed')
    expect(activity.arrivalState).toBe('lying')
    expect(activity.approach).toEqual(BED_ACTIVITY_POINTS.approach)
    expect(activity.posePosition).toEqual(BED_ACTIVITY_POINTS.pose)
    expect(activity.poseScaleMultiplier).toBe(BED_ACTIVITY_POINTS.scaleMultiplier)
    // The whole point of BED_ACTIVITY_POINTS.scaleMultiplier existing —
    // regression guard for "lying reads much too small against the bed."
    expect(activity.poseScaleMultiplier).toBeGreaterThan(1)
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

  it("the couch, desk-chair, and bed approach points are walkable, and aren't inside any furniture obstacle", () => {
    for (const approach of [
      COUCH_ACTIVITY_POINTS.approach,
      DESK_CHAIR_ACTIVITY_POINTS.approach,
      BED_ACTIVITY_POINTS.approach,
    ]) {
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

  it("both hug convergence points are walkable and aren't inside any obstacle", () => {
    for (const point of [HUG_CONVERGE_POINTS.male, HUG_CONVERGE_POINTS.female]) {
      expect(isWithinWalkableArea(point.x, point.y)).toBe(true)
      expect(findBlockingObstacle(point, point)).toBeNull()
    }
  })
})

describe('hug interaction metadata', () => {
  it('places the hug point near the couch/living area, clear of the lamp and not on the couch itself', () => {
    // Couch obstacle is {594-894, 555-645} (walkableArea.ts) — "not
    // directly on the couch" means clear of that rect; "slightly in
    // front/below" means a larger Y (closer to the viewer) than its own.
    expect(HUG_INTERACTION_POINT.y).toBeGreaterThan(645)
    expect(findBlockingObstacle(HUG_INTERACTION_POINT, HUG_INTERACTION_POINT)).toBeNull()
    // Lamp is at world (520, 747) — comfortably far away, never overlapping.
    const distanceFromLamp = Math.hypot(HUG_INTERACTION_POINT.x - 520, HUG_INTERACTION_POINT.y - 747)
    expect(distanceFromLamp).toBeGreaterThan(150)
  })

  it('gives each avatar its own distinct convergence point either side of the shared hug point', () => {
    expect(HUG_CONVERGE_POINTS.male).not.toEqual(HUG_CONVERGE_POINTS.female)
    expect(HUG_CONVERGE_POINTS.male.x).toBeLessThan(HUG_INTERACTION_POINT.x)
    expect(HUG_CONVERGE_POINTS.female.x).toBeGreaterThan(HUG_INTERACTION_POINT.x)
    // Close enough together that hiding both rigs and showing the combined
    // sprite at the midpoint reads as one small step, not a teleport.
    const separation = Math.hypot(
      HUG_CONVERGE_POINTS.male.x - HUG_CONVERGE_POINTS.female.x,
      HUG_CONVERGE_POINTS.male.y - HUG_CONVERGE_POINTS.female.y,
    )
    expect(separation).toBeLessThan(80)
  })
})

describe('hug sprite scale (regression guard for "hug reads smaller than the avatars it replaces")', () => {
  it('renders the combined hug sprite taller than a single standing avatar', () => {
    const tallerStandingHeight = TARGET_BODY_HEIGHT_WORLD_UNITS * MALE_RELATIVE_SCALE
    // The art depicts TWO people embracing, not one — matching a single
    // body's own height would still read as a shrink versus the two
    // avatars it replaces, which is exactly the bug this constant fixes.
    expect(HUG_SPRITE_WORLD_SIZE.height).toBeGreaterThan(tallerStandingHeight)
  })

  it('derives HUG_SPRITE_WORLD_SIZE from the dedicated HUG_SPRITE_SCALE_MULTIPLIER, not an independent magic number', () => {
    const expectedHeight = TARGET_BODY_HEIGHT_WORLD_UNITS * MALE_RELATIVE_SCALE * HUG_SPRITE_SCALE_MULTIPLIER
    expect(HUG_SPRITE_WORLD_SIZE.height).toBeCloseTo(expectedHeight)
  })

  it('preserves the production art’s own aspect ratio when deriving width from height', () => {
    // Whatever the multiplier, width and height must scale together —
    // never an independently-authored width that could stretch/squash
    // the untouched interaction_hug_couple.png.
    const aspect = HUG_SPRITE_WORLD_SIZE.width / HUG_SPRITE_WORLD_SIZE.height
    expect(aspect).toBeCloseTo(373 / 559, 5)
  })

  it('uses a scale multiplier meaningfully larger than 1 (a two-person embrace, not a single body)', () => {
    expect(HUG_SPRITE_SCALE_MULTIPLIER).toBeGreaterThan(1)
  })

  // Regression guard for the approved "increase by ~30%" follow-up pass —
  // 1.4 still read smaller than the normal avatars it replaces.
  it('is at least ~30% larger than the previous approved multiplier (1.4)', () => {
    const previousMultiplier = 1.4
    expect(HUG_SPRITE_SCALE_MULTIPLIER).toBeGreaterThanOrEqual(previousMultiplier * 1.3 - 0.01)
  })
})

describe('hug duration ranges', () => {
  it('pickHugDwellDuration stays within its documented range', () => {
    for (const value of [0, 0.5, 0.999]) {
      const duration = pickHugDwellDuration(scriptedRandom(value))
      expect(duration).toBeGreaterThanOrEqual(HUG_DWELL_RANGE_SECONDS.min)
      expect(duration).toBeLessThan(HUG_DWELL_RANGE_SECONDS.max)
    }
  })

  it('pickHugCooldownDuration stays within its documented range', () => {
    for (const value of [0, 0.5, 0.999]) {
      const duration = pickHugCooldownDuration(scriptedRandom(value))
      expect(duration).toBeGreaterThanOrEqual(HUG_COOLDOWN_RANGE_SECONDS.min)
      expect(duration).toBeLessThan(HUG_COOLDOWN_RANGE_SECONDS.max)
    }
  })

  it('keeps hugs occasional: cooldown is far longer than any solo idle/sit/lie wait', () => {
    expect(HUG_COOLDOWN_RANGE_SECONDS.min).toBeGreaterThan(IDLE_DURATION_RANGE_SECONDS.max)
    expect(HUG_COOLDOWN_RANGE_SECONDS.min).toBeGreaterThan(SIT_DURATION_RANGE_SECONDS.max)
    expect(HUG_COOLDOWN_RANGE_SECONDS.min).toBeGreaterThan(LIE_DURATION_RANGE_SECONDS.max)
  })

  it('keeps a hug itself brief — no advanced/long cuddle dwell', () => {
    expect(HUG_DWELL_RANGE_SECONDS.max).toBeLessThan(SIT_DURATION_RANGE_SECONDS.min)
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
