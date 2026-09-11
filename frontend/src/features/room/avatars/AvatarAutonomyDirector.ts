import type { AvatarMotionController } from './AvatarMotionController'
import { chooseNextActivity, pickIdleDuration, pickLieDuration, pickSitDuration } from './avatarActivities'
import type { AvatarActivity, AvatarActivityKind, RandomSource } from './avatarActivities'

/**
 * The "believable behavior loop" itself: idle → choose eligible activity →
 * walk if necessary → perform activity → remain there for a reasonable
 * duration → choose another eligible activity. This is the layer the
 * approved plan calls "extend the existing state-machine-style behavior
 * architecture" — it sits ABOVE AvatarMotionController (which stays
 * "dumb": it knows how to walk/sit/lie, never when or why — see its own
 * doc comment) and drives one real AvatarMotionController over time using
 * only avatarActivities.ts's pure eligibility/weighted-choice/duration
 * functions to decide what happens next. RoomCanvas.tsx owns exactly one
 * of these per avatar and calls `update()` from the room's ticker instead
 * of calling the motion controller directly.
 *
 * Deliberately knows nothing about PixiJS itself (only AvatarMotionController's
 * own public API — moveTo/sitAt/lieAt/standUp/getState/update) — so this
 * class is unit-testable the same GPU-free way AvatarMotionController.test.ts
 * already is, and with a seeded/mock RandomSource (see avatarActivities.ts)
 * its exact sequence of choices is fully reproducible in a test rather than
 * flaky.
 */
export class AvatarAutonomyDirector {
  private readonly motion: AvatarMotionController
  private readonly random: RandomSource

  /** The activity currently being walked toward — applied (sitAt/lieAt, or
   * just a fresh idle wait for a plain wander) the moment the walk
   * finishes. `null` means "not walking anywhere for a chosen activity,"
   * i.e. currently idle/sitting/lying and just counting down. */
  private pendingActivity: AvatarActivity | null = null
  /** What the avatar was just doing, so the next choice can exclude it —
   * see avatarActivities.ts's `chooseNextActivity`. `null` only before the
   * very first choice this director ever makes. */
  private lastActivityKind: AvatarActivityKind | null = null
  /** Counts down whatever the current stable state's (idle/sitting/lying)
   * duration is; the wait/choose logic in `update` only ever fires once
   * this reaches zero. */
  private waitSecondsRemaining: number

  constructor(motion: AvatarMotionController, random: RandomSource = Math.random) {
    this.motion = motion
    this.random = random
    // Starts idle for a bit before ever choosing an activity — an avatar
    // that immediately walked off the instant the room loaded would read
    // as restless, not like someone who's already comfortably in their
    // own space.
    this.waitSecondsRemaining = pickIdleDuration(random)
  }

  getLastActivityKind(): AvatarActivityKind | null {
    return this.lastActivityKind
  }

  getPendingActivityKind(): AvatarActivityKind | null {
    return this.pendingActivity?.kind ?? null
  }

  /** Advances the underlying motion controller, then applies exactly one
   * behavior decision if one is due this tick — never more than one, so a
   * very large `deltaSeconds` (e.g. a slow frame) can't cascade through
   * several activities at once. Call once per ticker tick, per avatar. */
  update(deltaSeconds: number): void {
    this.motion.update(deltaSeconds)
    const state = this.motion.getState()

    // Still mid-walk toward whatever `pendingActivity` (or nothing, for a
    // walk requested some other way) is — nothing to decide yet.
    if (state === 'walking') return

    // Just arrived at a chosen destination — apply what that activity
    // actually means: sit/lie onto the furniture, or, for a plain wander,
    // simply start a fresh idle wait right here.
    if (this.pendingActivity) {
      const activity = this.pendingActivity
      this.pendingActivity = null
      this.lastActivityKind = activity.kind

      if (activity.arrivalState === 'sitting' && activity.posePosition) {
        this.motion.sitAt(activity.posePosition)
        this.waitSecondsRemaining = pickSitDuration(this.random)
      } else if (activity.arrivalState === 'lying' && activity.posePosition) {
        this.motion.lieAt(activity.posePosition)
        this.waitSecondsRemaining = pickLieDuration(this.random)
      } else {
        this.waitSecondsRemaining = pickIdleDuration(this.random)
      }
      return
    }

    // Counting down the current idle/sitting/lying period.
    this.waitSecondsRemaining -= deltaSeconds
    if (this.waitSecondsRemaining > 0) return

    if (state === 'sitting' || state === 'lying') {
      // Stand up first, in place — never a direct sitting->lying jump or
      // vice versa, the same way a real person would get up before
      // walking anywhere else. The NEXT tick's idle countdown (started
      // here) is what actually picks where to go next.
      this.motion.standUp()
      this.waitSecondsRemaining = pickIdleDuration(this.random)
      return
    }

    // Idle and done waiting — choose what to do next and start walking
    // there. `pendingActivity` records it so arrival (above) knows what
    // to apply.
    const activity = chooseNextActivity(this.random, this.lastActivityKind)
    this.pendingActivity = activity
    this.motion.moveTo(activity.approach)
  }
}
