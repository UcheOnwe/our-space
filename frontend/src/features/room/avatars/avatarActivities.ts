import type { WorldPoint } from './avatarBehavior'
import { isWithinWalkableArea } from '../walkableArea'

/**
 * The "believable behavior loop" foundation — pure data + weighted choice,
 * no PixiJS, no timers. AvatarAutonomyDirector.ts is the only thing that
 * calls into this module; it owns turning an `AvatarActivity` into real
 * `moveTo`/`sitAt`/`lieAt` calls against a live AvatarMotionController.
 * Keeping the choosing separate from the doing is what makes the choosing
 * itself fully unit-testable with a seeded/mock random source, the same
 * "pure logic module, real-object driving class" split avatarBehavior.ts
 * and AvatarMotionController.ts already established.
 */

/** Returns a number in [0, 1) — `Math.random`'s own contract. Production
 * code defaults to `Math.random`; tests inject a seeded/mock source so a
 * choice is exactly reproducible instead of flaky. Isolating randomness to
 * this one function signature (rather than calling `Math.random()` inline
 * wherever a choice is made) is the whole point — see the approved plan's
 * "inject or isolate randomness" direction. */
export type RandomSource = () => number

export type AvatarActivityKind = 'wander' | 'sit-couch' | 'lie-bed'

export interface AvatarActivity {
  kind: AvatarActivityKind
  /** Where to WALK first (via the existing obstacle-aware
   * AvatarMotionController.moveTo/computeRoute) — always a point this
   * module's own test confirms is walkable. */
  approach: WorldPoint
  /** What behavior state AvatarAutonomyDirector should put the avatar
   * into once it arrives at `approach`. */
  arrivalState: 'idle' | 'sitting' | 'lying'
  /** Only present for a furniture activity — the exact authored position
   * the pose snaps to on arrival (see AvatarMotionController's
   * sitAt/lieAt), which may sit a little further onto the couch/bed than
   * the walkable `approach` point itself. Deliberately NOT required to
   * pass `isWithinWalkableArea` — it's not a walking destination, it's
   * where the seated/lying illustration rests on the furniture. */
  posePosition?: WorldPoint
}

// --- Authored wander spots -----------------------------------------------
// Hand-picked open-floor points, spread around the main room so "stand
// somewhere else for a while" doesn't always mean the same spot — each
// confirmed clear of every FURNITURE_OBSTACLES rectangle by this module's
// own test (avatarActivities.test.ts), not just by eye.
export const WANDER_POINTS: WorldPoint[] = [
  { x: 250, y: 750 },
  { x: 950, y: 700 },
  { x: 1150, y: 750 },
  { x: 380, y: 800 },
  { x: 700, y: 820 },
]

// --- Authored furniture interaction points -------------------------------
// V1 scope, per the approved plan: one seat, one lying spot — explicit
// authored points, not generic "any avatar near any furniture"
// understanding. `approach` is an ordinary walkable point; `pose` is the
// small final placement onto the piece itself (see AvatarActivity's doc
// comment above for why that one is exempt from the walkable check).
export const COUCH_ACTIVITY_POINTS = {
  approach: { x: 744, y: 665 } as WorldPoint,
  pose: { x: 744, y: 615 } as WorldPoint,
}

export const BED_ACTIVITY_POINTS = {
  approach: { x: 1100, y: 415 } as WorldPoint,
  // Nudged up and left from the approach point's own x/y (rather than
  // directly above it) after live visual inspection — the bed's own
  // pillow/mattress area reads center-left of its bottom-center anchor
  // (1092, 398 in roomAssets.ts), so a lying position placed straight
  // above the approach point sat too far toward the bed's near-right
  // corner/edge instead of its visible sleeping surface.
  pose: { x: 1060, y: 350 } as WorldPoint,
}

export interface WeightedOption<T> {
  value: T
  weight: number
}

/** Picks one option's `value`, with probability proportional to its
 * `weight` (weights don't need to sum to 1 — this normalizes by the
 * total). Falls back to the last option if floating-point rounding ever
 * leaves a sliver of probability unaccounted for, rather than returning
 * `undefined`. */
export function weightedChoice<T>(options: ReadonlyArray<WeightedOption<T>>, random: RandomSource): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0)
  let remaining = random() * total
  for (const option of options) {
    if (remaining < option.weight) return option.value
    remaining -= option.weight
  }
  return options[options.length - 1].value
}

/** Picks a uniformly-random element of a non-empty array. */
export function randomElement<T>(items: readonly T[], random: RandomSource): T {
  const index = Math.min(items.length - 1, Math.floor(random() * items.length))
  return items[index]
}

// Wander is favored heavily over the two furniture activities — an avatar
// should read as mostly standing/walking around the room, occasionally
// settling onto the couch or bed, not a couple that sits or lies down
// every other choice.
const ACTIVITY_KIND_WEIGHTS: ReadonlyArray<WeightedOption<AvatarActivityKind>> = [
  { value: 'wander', weight: 6 },
  { value: 'sit-couch', weight: 2 },
  { value: 'lie-bed', weight: 1 },
]

function buildActivity(kind: AvatarActivityKind, random: RandomSource): AvatarActivity {
  if (kind === 'sit-couch') {
    return { kind, approach: COUCH_ACTIVITY_POINTS.approach, arrivalState: 'sitting', posePosition: COUCH_ACTIVITY_POINTS.pose }
  }
  if (kind === 'lie-bed') {
    return { kind, approach: BED_ACTIVITY_POINTS.approach, arrivalState: 'lying', posePosition: BED_ACTIVITY_POINTS.pose }
  }
  return { kind: 'wander', approach: randomElement(WANDER_POINTS, random), arrivalState: 'idle' }
}

/**
 * Eligibility → weighted choice → (the caller handles) state transition
 * and duration/cooldown. The one eligibility rule this V1 slice needs:
 * whatever activity the avatar JUST finished doing is excluded from this
 * choice, so standing up from the bed doesn't immediately turn into lying
 * back down again — a plain repeat read as mechanical, not like a person
 * deciding what to do next. `lastActivityKind: null` (nothing done yet,
 * e.g. right after mount) excludes nothing.
 *
 * Deterministic given `random`: the same sequence of return values from
 * `random` always produces the same sequence of choices, which is what
 * makes this fully testable with a seeded/mock source instead of a real
 * flaky `Math.random`.
 */
export function chooseNextActivity(random: RandomSource, lastActivityKind: AvatarActivityKind | null): AvatarActivity {
  const eligible = ACTIVITY_KIND_WEIGHTS.filter((option) => option.value !== lastActivityKind)
  // Only possible if lastActivityKind excluded every option, which can't
  // currently happen (there are always at least two other kinds left) —
  // guarded anyway so a future change to this list can't silently produce
  // an empty choice set.
  const kind = weightedChoice(eligible.length > 0 ? eligible : ACTIVITY_KIND_WEIGHTS, random)
  return buildActivity(kind, random)
}

// --- Duration/cooldown ranges ---------------------------------------------
// Deliberately a RANGE, not a fixed number, per the approved plan — so two
// avatars given the same activity at different times don't look
// mechanically synchronized. Seconds.
export const IDLE_DURATION_RANGE_SECONDS = { min: 3, max: 8 }
export const SIT_DURATION_RANGE_SECONDS = { min: 8, max: 20 }
export const LIE_DURATION_RANGE_SECONDS = { min: 12, max: 30 }

function pickInRange(range: { min: number; max: number }, random: RandomSource): number {
  return range.min + random() * (range.max - range.min)
}

/** How long to stand/wait idle before choosing the next activity. */
export function pickIdleDuration(random: RandomSource): number {
  return pickInRange(IDLE_DURATION_RANGE_SECONDS, random)
}

/** How long to remain seated before standing back up. */
export function pickSitDuration(random: RandomSource): number {
  return pickInRange(SIT_DURATION_RANGE_SECONDS, random)
}

/** How long to remain lying down before standing back up. */
export function pickLieDuration(random: RandomSource): number {
  return pickInRange(LIE_DURATION_RANGE_SECONDS, random)
}

/** True if every authored WALKING destination this module can choose
 * (wander spots and both furniture approach points — NOT the furniture
 * `pose` positions, which are deliberately not walking destinations, see
 * AvatarActivity's doc comment) is a real, walkable floor point. Exported
 * so avatarActivities.test.ts can assert it directly rather than
 * duplicating this list by hand. */
export function allApproachPointsAreWalkable(): boolean {
  const points = [...WANDER_POINTS, COUCH_ACTIVITY_POINTS.approach, BED_ACTIVITY_POINTS.approach]
  return points.every((point) => isWithinWalkableArea(point.x, point.y))
}
