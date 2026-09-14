import type { WorldPoint } from './avatarBehavior'
import { MALE_RELATIVE_SCALE, TARGET_BODY_HEIGHT_WORLD_UNITS } from './avatarConfigs'
import { isWithinWalkableArea } from '../walkableArea'

/**
 * The "believable behavior loop" foundation — pure data + weighted choice,
 * no PixiJS, no timers. AvatarAutonomyDirector.ts is the only thing that
 * calls into this module for SOLO activities; it owns turning an
 * `AvatarActivity` into real `moveTo`/`sitAt`/`lieAt` calls against a live
 * AvatarMotionController. CoupleHugCoordinator.ts separately uses the
 * hug-specific constants/pickers below — hug is a coordinated TWO-avatar
 * interaction, deliberately not one of the weighted `AvatarActivityKind`
 * choices a single avatar can pick on its own (see CoupleHugCoordinator.ts's
 * doc comment for why it's a separate system).
 *
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

export type AvatarActivityKind = 'wander' | 'sit-couch' | 'sit-desk-chair' | 'lie-bed'

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
   * sitAt/lieAt), which may sit a little further onto the couch/chair/bed
   * than the walkable `approach` point itself. Deliberately NOT required
   * to pass `isWithinWalkableArea` — it's not a walking destination, it's
   * where the seated/lying illustration rests on the furniture. */
  posePosition?: WorldPoint
  /** Only meaningful alongside `posePosition` — passed straight through to
   * AvatarMotionController's sitAt/lieAt as pose-specific rig scale/
   * rotation (see FurnitureInteractionPoint below for why this exists). */
  poseScaleMultiplier?: number
  poseRotation?: number
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

/**
 * Centralized metadata for one furniture pose interaction — the shape
 * couch sitting originally proved out, now shared by desk-chair sitting
 * and bed lying too (per the approved plan: "reuse the architecture
 * already proven by couch sitting" / "define centralized interaction
 * metadata"). `scaleMultiplier`/`rotation` are pose-specific rig
 * adjustments applied ON TOP of the avatar's own standing container scale
 * (see AvatarMotionController's sitAt/lieAt) — NEVER by changing
 * TARGET_BODY_HEIGHT_WORLD_UNITS/relativeScale (avatarConfigs.ts), which
 * would also silently change standing scale and the male:female ratio.
 * Couch/desk-chair keep the default 1/0 (their sitting art already reads
 * correctly at the standing rig's own scale); bed lying is the one that
 * needs a multiplier — see BED_ACTIVITY_POINTS below.
 */
export interface FurnitureInteractionPoint {
  approach: WorldPoint
  pose: WorldPoint
  /** Multiplier on the rig's own container scale while in this pose.
   * Defaults to 1 (no change) when omitted by a caller that doesn't need
   * one — bed lying is the only V1 point that sets this to something
   * else. */
  scaleMultiplier: number
  /** Container rotation, in radians, while in this pose. Every V1
   * furniture point leaves this at 0 — the sitting/lying production art
   * already depicts the correct orientation on its own, and adding a
   * rotation on top with no real reference to calibrate against would be
   * the same mistake the walking lean was (see avatarBehavior.ts).
   * Present so a future piece of furniture that genuinely needs an angled
   * placement (e.g. a diagonal chair) doesn't need an architecture
   * change, only a nonzero value here. */
  rotation: number
}

// --- Authored furniture interaction points -------------------------------
// V1 scope, per the approved plan: one seat per sittable piece, one lying
// spot — explicit authored points, not generic "any avatar near any
// furniture" understanding.
export const COUCH_ACTIVITY_POINTS: FurnitureInteractionPoint = {
  approach: { x: 744, y: 665 },
  pose: { x: 744, y: 615 },
  scaleMultiplier: 1,
  rotation: 0,
}

/**
 * The workstation chair (roomAssets.ts's `chair`, bottom-center-anchored
 * at 664,410) — reuses the exact same `sitting` pose/asset couch sitting
 * does; only the position (and, if manual inspection calls for it, scale)
 * differ, per the approved "reuse the architecture" direction.
 *
 * `approach` is offset to the RIGHT of the chair, not straight below it:
 * the combined desk+chair obstacle (walkableArea.ts's
 * `{x0:604,y0:326,x1:864,y1:440}`) sits almost directly above the coffee
 * table's own obstacle (`{x0:420,y0:450,x1:700,y1:560}`) in this flat
 * coordinate scheme — their x-ranges overlap from 604 to 700, leaving only
 * a 10-unit sliver (y440 to y450) directly below the chair, nowhere near
 * enough clearance for a real approach point. x=730 clears the coffee
 * table's own x1=700 entirely while still sitting outside the desk+chair
 * obstacle's y-range. `pose` is roughly the chair's own seat height above
 * its floor anchor, tuned against the real art.
 */
export const DESK_CHAIR_ACTIVITY_POINTS: FurnitureInteractionPoint = {
  approach: { x: 730, y: 460 },
  pose: { x: 664, y: 372 },
  scaleMultiplier: 1,
  rotation: 0,
}

/**
 * The bed (roomAssets.ts's `bed`, bottom-center-anchored at 1092,398).
 * `scaleMultiplier` is the fix for the reported "lying avatar reads much
 * too small against the bed": `body_lying`'s production art wasn't drawn
 * at the same apparent physical scale as `body_base` (they're independent
 * illustrations, not cropped from one consistent reference the way the
 * shared-canvas furniture batch was — see roomAssets.ts), so applying the
 * rig's ordinary standing container scale to it produces a technically-
 * correct-by-formula but visually undersized figure. Rather than touch
 * TARGET_BODY_HEIGHT_WORLD_UNITS (which would also resize standing AND
 * sitting, and both characters' whole rig calibration with it — explicitly
 * ruled out by the approved plan), this multiplier scales ONLY the
 * container while lying, preserving the male:female ratio exactly (it's
 * the same number for both genders — see AvatarMotionController's
 * applyContainerScale). Chosen by live visual comparison against the bed
 * sprite's own rendered size, not computed from any texture metric.
 */
export const BED_ACTIVITY_POINTS: FurnitureInteractionPoint = {
  approach: { x: 1100, y: 415 },
  // Nudged up and left from the approach point's own x/y (rather than
  // directly above it) after live visual inspection — the bed's own
  // pillow/mattress area reads center-left of its bottom-center anchor
  // (1092, 398 in roomAssets.ts), so a lying position placed straight
  // above the approach point sat too far toward the bed's near-right
  // corner/edge instead of its visible sleeping surface.
  pose: { x: 1060, y: 350 },
  scaleMultiplier: 1.9,
  rotation: 0,
}

// --- Couple hug ------------------------------------------------------------
// A separate system from the solo per-avatar activities above (see
// CoupleHugCoordinator.ts) — kept here anyway because it's the same kind
// of authored-point-plus-duration-range metadata as everything else in
// this file, and centralizing it avoids a second place to look for "where
// did this number come from."
//
// One authored point in the open floor near the couch/living-area
// grouping (roomAssets.ts's couch is centered at x=744; the coffee table
// in front of it occupies y450-560, the couch itself y555-645) — placed
// far enough right and below both to sit on clear rug rather than
// overlapping either, comfortably clear of the lamp (x=520, ~280 world
// units away) as required, and not directly on the couch itself (below
// its own floor edge, in front of it, not on top of it).
export const HUG_INTERACTION_POINT: WorldPoint = { x: 800, y: 700 }

// Each avatar walks to their OWN point a small, fixed offset either side
// of the shared interaction point — "coordinated convergence points," not
// one shared destination both would otherwise need to fight over/overlap
// mid-walk. Small enough that switching from "two rigs standing here" to
// "one combined sprite centered at the midpoint" reads as a natural step
// together, not a jump — satisfying "do not teleport them into the hug
// from across the room."
const HUG_CONVERGE_OFFSET_X = 20
export const HUG_CONVERGE_POINTS: { male: WorldPoint; female: WorldPoint } = {
  male: { x: HUG_INTERACTION_POINT.x - HUG_CONVERGE_OFFSET_X, y: HUG_INTERACTION_POINT.y },
  female: { x: HUG_INTERACTION_POINT.x + HUG_CONVERGE_OFFSET_X, y: HUG_INTERACTION_POINT.y },
}

/** The approved combined hug asset — a shared couple sprite, not a
 * per-character texture, so it lives here rather than in
 * avatarConfigs.ts's per-gender AvatarTexturePaths. Never edited/resized —
 * only the runtime RENDER size below changes, same as every other
 * production PNG in this room. */
export const HUG_SPRITE_TEXTURE_PATH = '/room/interactions/interaction_hug_couple.png'

// The production interaction_hug_couple.png's own width:height proportion
// (from its optimized runtime dimensions — see
// scripts/optimize-room-assets.mjs) — fixed by the art itself, never a
// tunable. Kept as its own named constant so HUG_SPRITE_WORLD_SIZE below
// reads as "reference height * scale, at the art's real proportion,"
// not an unexplained width number.
const HUG_SPRITE_ASPECT_RATIO = 373 / 559

/**
 * The dedicated, configurable knob for the hug sprite's size — the
 * approved plan's own words ("a dedicated configurable hug scale constant
 * ... instead of a magic number scattered in rendering code"). A first
 * pass authored a flat `{width: 63, height: 95}` world-unit size, which
 * manual inspection found read as a visible shrink the moment the hug
 * began — smaller than the two independent avatars had just been
 * standing at. 1.4 closed most of that gap, but a later manual pass found
 * the hug sprite still read meaningfully smaller than the normal avatars
 * it replaces — an approved ~30% further increase (1.4 -> 1.82) is what
 * actually matched it: rendered directly against a standing avatar at the
 * couch (not guessed), comparing the hug sprite's apparent size to the
 * two real avatars it replaces until the transition stopped reading as a
 * size drop. Meaningfully larger than 1.0 (a single standing body's own
 * height) is expected and correct here — the art depicts TWO people
 * embracing, not one, so matching a single body's height would still read
 * small for what's effectively two avatars' worth of visual mass.
 */
export const HUG_SPRITE_SCALE_MULTIPLIER = 1.82

/** Explicit world-unit render size, the same "authored size, not derived
 * from whatever pixel resolution the runtime PNG ships at" contract
 * roomAssets.ts's FurniturePlacement uses — but DERIVED from
 * HUG_SPRITE_SCALE_MULTIPLIER above and the taller partner's own standing
 * body height (TARGET_BODY_HEIGHT_WORLD_UNITS * MALE_RELATIVE_SCALE, the
 * same "how tall does a person read in this room" reference every other
 * avatar-adjacent scale in this room already uses), rather than a second,
 * disconnected magic number — retuning the multiplier alone keeps both
 * dimensions correctly proportioned to the room without this needing a
 * second edit. */
export const HUG_SPRITE_WORLD_SIZE = (() => {
  const height = TARGET_BODY_HEIGHT_WORLD_UNITS * MALE_RELATIVE_SCALE * HUG_SPRITE_SCALE_MULTIPLIER
  return { width: height * HUG_SPRITE_ASPECT_RATIO, height }
})()

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

// Wander is favored heavily over the furniture activities — an avatar
// should read as mostly standing/walking around the room, occasionally
// settling onto a piece of furniture, not a couple that sits or lies down
// every other choice. Exported (not just a private module constant) so
// tests can compute expected weighted-choice bands from the real weights
// instead of hand-duplicating them as magic numbers that go stale the
// moment a weight changes.
export const ACTIVITY_KIND_WEIGHTS: ReadonlyArray<WeightedOption<AvatarActivityKind>> = [
  { value: 'wander', weight: 6 },
  { value: 'sit-couch', weight: 2 },
  { value: 'sit-desk-chair', weight: 2 },
  { value: 'lie-bed', weight: 1 },
]

function buildActivity(kind: AvatarActivityKind, random: RandomSource): AvatarActivity {
  if (kind === 'sit-couch') {
    return {
      kind,
      approach: COUCH_ACTIVITY_POINTS.approach,
      arrivalState: 'sitting',
      posePosition: COUCH_ACTIVITY_POINTS.pose,
      poseScaleMultiplier: COUCH_ACTIVITY_POINTS.scaleMultiplier,
      poseRotation: COUCH_ACTIVITY_POINTS.rotation,
    }
  }
  if (kind === 'sit-desk-chair') {
    return {
      kind,
      approach: DESK_CHAIR_ACTIVITY_POINTS.approach,
      arrivalState: 'sitting',
      posePosition: DESK_CHAIR_ACTIVITY_POINTS.pose,
      poseScaleMultiplier: DESK_CHAIR_ACTIVITY_POINTS.scaleMultiplier,
      poseRotation: DESK_CHAIR_ACTIVITY_POINTS.rotation,
    }
  }
  if (kind === 'lie-bed') {
    return {
      kind,
      approach: BED_ACTIVITY_POINTS.approach,
      arrivalState: 'lying',
      posePosition: BED_ACTIVITY_POINTS.pose,
      poseScaleMultiplier: BED_ACTIVITY_POINTS.scaleMultiplier,
      poseRotation: BED_ACTIVITY_POINTS.rotation,
    }
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
// Couple hug: dwell is short (a hug, not a long cuddle — "do not create
// advanced cuddle animation yet"); the cooldown is what actually keeps it
// "occasional... less frequent than normal solo activities" — long enough
// that it can't repeat every time the couple's independent idle timers
// happen to line up, which on their own would otherwise recur every
// minute or so.
export const HUG_DWELL_RANGE_SECONDS = { min: 4, max: 7 }
export const HUG_COOLDOWN_RANGE_SECONDS = { min: 60, max: 120 }

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

/** How long a couple hug lasts once both avatars have converged. */
export function pickHugDwellDuration(random: RandomSource): number {
  return pickInRange(HUG_DWELL_RANGE_SECONDS, random)
}

/** How long to wait after one hug ends before another becomes eligible. */
export function pickHugCooldownDuration(random: RandomSource): number {
  return pickInRange(HUG_COOLDOWN_RANGE_SECONDS, random)
}

/** True if every authored WALKING destination this module can choose
 * (wander spots and every furniture approach point — NOT the furniture
 * `pose` positions, which are deliberately not walking destinations, see
 * AvatarActivity's doc comment) is a real, walkable floor point. Exported
 * so avatarActivities.test.ts can assert it directly rather than
 * duplicating this list by hand. */
export function allApproachPointsAreWalkable(): boolean {
  const points = [
    ...WANDER_POINTS,
    COUCH_ACTIVITY_POINTS.approach,
    DESK_CHAIR_ACTIVITY_POINTS.approach,
    BED_ACTIVITY_POINTS.approach,
  ]
  return points.every((point) => isWithinWalkableArea(point.x, point.y))
}
