import type { AvatarRigConfig, LimbAngles } from './avatarTypes'

/**
 * The Room Avatar behavior foundation — pure state/math, no PixiJS. Kept
 * separate from AvatarMotionController.ts (which drives a real AvatarRig
 * off a ticker) the same way rigGeometry.ts stays separate from
 * AvatarRig.ts: this is the one piece of behavior logic fully covered by
 * fast unit tests instead of manual/browser verification.
 *
 * `idle`/`walking`/`sitting`/`lying` — a standing/moving avatar, or one
 * performing a furniture pose (see AvatarRig.ts's `setPose` for what
 * sitting/lying actually swap on screen). The shape is deliberately
 * event-driven (`transition(state, event) -> state`) so later states —
 * interacting, hugging, being dragged, presence reactions — extend this
 * same switch instead of requiring a different architecture.
 *
 * Note what this table deliberately does NOT decide: WHEN to walk
 * somewhere, or WHICH furniture to sit/lie at, or for how long. That's
 * avatarActivities.ts's job (eligibility + weighted choice + duration) and
 * AvatarAutonomyDirector.ts's (orchestrating those choices against a real
 * AvatarMotionController over time) — this module only ever answers "given
 * this state and this event, what's the new state," nothing about why.
 */
export type AvatarBehaviorState = 'idle' | 'walking' | 'sitting' | 'lying'

export interface WorldPoint {
  x: number
  y: number
}

export type AvatarBehaviorEvent =
  | { type: 'MOVE_TO'; destination: WorldPoint }
  | { type: 'ARRIVED' }
  | { type: 'SIT' }
  | { type: 'LIE' }
  | { type: 'STAND' }

/** Pure transition table. Unrecognized events are a no-op (return the same
 * state) rather than an error — a later slice's new event types can pass
 * through here harmlessly until this switch is taught about them.
 *
 * SIT/LIE/STAND are deliberately reachable from ANY state (not gated to
 * "only from idle") — this table only models "what state does the event
 * produce," not "is this a sensible moment to fire it." Guarding sequence
 * (walk there first, don't sit mid-stride) is AvatarAutonomyDirector's
 * job, same division of responsibility MOVE_TO/ARRIVED already had. */
export function transition(state: AvatarBehaviorState, event: AvatarBehaviorEvent): AvatarBehaviorState {
  switch (event.type) {
    case 'MOVE_TO':
      return 'walking'
    case 'ARRIVED':
      return 'idle'
    case 'SIT':
      return 'sitting'
    case 'LIE':
      return 'lying'
    case 'STAND':
      return 'idle'
    default:
      return state
  }
}

/** Within this many world units of the destination counts as arrived —
 * without a threshold, floating-point stepping would overshoot and
 * oscillate around the exact target forever instead of settling. */
export const ARRIVAL_THRESHOLD_WORLD_UNITS = 4

export interface MoveStepResult {
  position: WorldPoint
  arrived: boolean
  /** Which way the step actually moved horizontally, for facing — `null`
   * when there was no horizontal component this step (e.g. purely
   * vertical movement, or arrival), meaning "keep whatever facing the
   * avatar already had" rather than snapping to a default. */
  facing: 'left' | 'right' | null
}

/**
 * Advances `position` toward `destination` by `speedWorldUnitsPerSecond *
 * deltaSeconds` world units, in a straight line (no pathfinding — that's
 * explicitly out of scope for this slice). Expressing speed in world
 * units per second, and taking the real elapsed `deltaSeconds` rather than
 * a fixed per-frame step, is what keeps movement speed identical whether
 * the ticker fires at 30fps or 144fps, and independent of the camera's own
 * scale (that's applied on top, once, when the world container renders —
 * see RoomCanvas.tsx).
 */
export function stepTowards(
  position: WorldPoint,
  destination: WorldPoint,
  speedWorldUnitsPerSecond: number,
  deltaSeconds: number,
): MoveStepResult {
  const dx = destination.x - position.x
  const dy = destination.y - position.y
  const distance = Math.hypot(dx, dy)

  if (distance <= ARRIVAL_THRESHOLD_WORLD_UNITS) {
    return { position: { ...destination }, arrived: true, facing: null }
  }

  const facing: 'left' | 'right' | null = dx === 0 ? null : dx > 0 ? 'right' : 'left'
  const travel = speedWorldUnitsPerSecond * deltaSeconds

  if (travel >= distance) {
    return { position: { ...destination }, arrived: true, facing }
  }

  const ratio = travel / distance
  return {
    position: { x: position.x + dx * ratio, y: position.y + dy * ratio },
    arrived: false,
    facing,
  }
}

/** The rest pose to walk from and settle back to — a character's own
 * calibrated baseline, NOT always zero. Derived from AvatarRigConfig in
 * AvatarMotionController.ts: `legStanceRotation` (male's static stance
 * correction — see avatarConfigs.ts) is the neutral leg baseline, not an
 * animation this slice invented, and arms have no such per-character
 * baseline, so they neutral at 0. */
export interface NeutralLimbAngles {
  leftLeg: number
  rightLeg: number
  leftArm: number
  rightArm: number
}

/** Reads a character's neutral stance straight from its own rig config —
 * male's `legStanceRotation` (see avatarConfigs.ts) opposing-sign pair for
 * legs, 0/0 for arms (no character currently has a static arm stance).
 * Female's config carries no `legStanceRotation`, so this naturally
 * neutrals her legs at 0/0 too, with no character-specific branch here. */
export function deriveNeutralLimbAngles(config: Pick<AvatarRigConfig, 'legStanceRotation'>): NeutralLimbAngles {
  const legStance = config.legStanceRotation ?? 0
  // `|| 0` rather than bare `-legStance`: negating exactly 0 produces -0,
  // which is numerically fine for rendering but trips up strict equality
  // in tests comparing against a plain `0` literal.
  return { leftLeg: legStance, rightLeg: -legStance || 0, leftArm: 0, rightArm: 0 }
}

export interface WalkCycleAmplitudes {
  legRadians: number
  armRadians: number
}

// Deliberately subtle — this is a cute chibi character taking small steps
// around an apartment, not a running animation. Configurable here rather
// than scattered magic numbers through AvatarMotionController.ts.
export const DEFAULT_WALK_AMPLITUDES: WalkCycleAmplitudes = {
  legRadians: 0.16,
  armRadians: 0.1,
}
export const DEFAULT_WALK_FREQUENCY_HZ = 1.7

/**
 * One walk-cycle sample: opposing legs (`sin`/`-sin` around each leg's own
 * neutral), each arm opposing its CORRESPONDING leg (not its own side's
 * neutral sign) — the natural human gait this is modeling swings the left
 * arm forward with the right leg, not with the left leg. `elapsedSeconds`
 * is walk-time only (reset when a new walk begins in
 * AvatarMotionController.ts), not wall-clock time, so a walk always starts
 * from the same phase rather than an arbitrary one.
 */
export function computeWalkLimbAngles(
  elapsedSeconds: number,
  neutral: NeutralLimbAngles,
  amplitudes: WalkCycleAmplitudes = DEFAULT_WALK_AMPLITUDES,
  frequencyHz: number = DEFAULT_WALK_FREQUENCY_HZ,
): LimbAngles {
  const phase = Math.sin(elapsedSeconds * frequencyHz * Math.PI * 2)
  return {
    leftLeg: neutral.leftLeg + phase * amplitudes.legRadians,
    rightLeg: neutral.rightLeg - phase * amplitudes.legRadians,
    leftArm: neutral.leftArm - phase * amplitudes.armRadians,
    rightArm: neutral.rightArm + phase * amplitudes.armRadians,
  }
}

/** Linearly blends a set of limb angles toward the neutral pose — used to
 * settle out of whatever mid-swing angles a walk happened to stop at
 * instead of popping straight to neutral (see AvatarMotionController.ts's
 * settle phase). `t` is clamped so an out-of-range caller can't overshoot
 * past the neutral target. */
export function settleTowardNeutral(from: LimbAngles, neutral: NeutralLimbAngles, t: number): LimbAngles {
  const clampedT = Math.min(1, Math.max(0, t))
  // Exact endpoints, not just a t=0/t=1 lerp result — floating-point
  // arithmetic (`a + (b - a) * 1`) doesn't always land back on exactly
  // `b`, and callers (including AvatarMotionController's own settle
  // completion check) rely on t=1 meaning "exactly neutral," not "close to."
  if (clampedT === 0) {
    return {
      leftLeg: from.leftLeg ?? neutral.leftLeg,
      rightLeg: from.rightLeg ?? neutral.rightLeg,
      leftArm: from.leftArm ?? neutral.leftArm,
      rightArm: from.rightArm ?? neutral.rightArm,
    }
  }
  if (clampedT === 1) return { ...neutral }

  const lerp = (a: number, b: number) => a + (b - a) * clampedT
  return {
    leftLeg: lerp(from.leftLeg ?? neutral.leftLeg, neutral.leftLeg),
    rightLeg: lerp(from.rightLeg ?? neutral.rightLeg, neutral.rightLeg),
    leftArm: lerp(from.leftArm ?? neutral.leftArm, neutral.leftArm),
    rightArm: lerp(from.rightArm ?? neutral.rightArm, neutral.rightArm),
  }
}

// How long settling from mid-stride back to neutral takes once a walk
// ends — short enough to read as "arriving," not a lingering animation.
export const SETTLE_DURATION_SECONDS = 0.25

// World units per second — a calm, natural room-walking pace, not a
// sprint. Kept here (not a magic number in the controller) so a later
// slice can retune it in one place. Lowered from an initial 110 once
// manual inspection found that too brisk for a small apartment room.
export const DEFAULT_WALK_SPEED_WORLD_UNITS_PER_SECOND = 55

// A whole-container travel lean and a vertical walk bob were both tried
// here and then explicitly removed after manual inspection: the bob read
// as a rapid shake/vibration rather than footsteps, and the lean —
// without real left/right-facing production art to justify tilting a
// front-facing character — looked like the avatar was falling over
// rather than walking with intent. The rig only has front-facing head/
// body art right now; faking a directional lean on top of that isn't a
// substitute for real directional artwork, which is deferred until
// dedicated runtime assets exist. What's left is exactly the established
// arm/leg walk-cycle swing above (computeWalkLimbAngles) plus the
// existing simple left/right container mirroring in
// AvatarMotionController.ts — no rotation, no vertical offset layered on
// top of either.
