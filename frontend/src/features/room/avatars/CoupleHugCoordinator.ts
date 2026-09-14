import type { AvatarAutonomyDirector } from './AvatarAutonomyDirector'
import type { AvatarMotionController } from './AvatarMotionController'
import type { AvatarRig } from './AvatarRig'
import type { WorldPoint } from './avatarBehavior'
import { HUG_CONVERGE_POINTS, pickHugCooldownDuration, pickHugDwellDuration } from './avatarActivities'
import type { RandomSource } from './avatarActivities'

/**
 * The couple-hug interaction: a coordinated, TWO-avatar behavior, kept as
 * its own system rather than a fourth entry in avatarActivities.ts's
 * per-avatar `AvatarActivityKind` — a solo avatar's AvatarAutonomyDirector
 * can decide entirely on its own to sit or lie down, but it has no way to
 * know whether the OTHER avatar is even available for a hug, so "choose
 * eligible activity" for hug can't live at that per-avatar layer at all.
 * This class is the eligibility/coordination layer instead: it watches
 * both avatars' AvatarMotionControllers, and when both are simply `idle`
 * (never interrupting a seated/lying/walking avatar — see `isEligible`)
 * and its own cooldown has elapsed, it PAUSES both AvatarAutonomyDirectors
 * (see AvatarAutonomyDirector.pause — this is exactly what stops each
 * solo director from also independently choosing an activity while a hug
 * is under way), walks both avatars to their own authored convergence
 * point (avatarActivities.ts's HUG_CONVERGE_POINTS — never teleporting),
 * waits for BOTH to actually arrive, then hides both independent rigs and
 * hands control to whatever renders the shared `interaction_hug_couple`
 * sprite (see RoomCanvas.tsx's `onHugVisibleChange` callback). After a
 * short dwell it reverses all of that: hides the combined sprite, shows
 * both rigs again, and resumes both directors — each starting a fresh
 * idle wait, so neither immediately re-picks an activity the instant the
 * hug ends.
 *
 * This is explicitly NOT the Mouse Spirit presence `interaction.hug` event
 * system (PresenceOverlay.tsx) — that's a realtime, backend-driven,
 * partner-triggered interaction over WebSockets; this is a local,
 * frontend-only, autonomous behavior with no server involvement at all
 * (see the approved plan's "Do NOT reuse the Mouse Spirit
 * interaction.hug event architecture" / "No backend/realtime sync yet").
 *
 * Deliberately knows nothing about PixiJS beyond the AvatarMotionController/
 * AvatarRig/AvatarAutonomyDirector public APIs it's given — unit-testable
 * the same GPU-free way the rest of this feature is, with a seeded/mock
 * RandomSource for the cooldown/dwell durations (see avatarActivities.ts).
 */
export type HugPhase = 'idle' | 'converging' | 'hugging'

export interface HugParticipant {
  motion: AvatarMotionController
  director: AvatarAutonomyDirector
  rig: AvatarRig
}

// Close enough to the converge point to count as "arrived" — matches the
// granularity avatarBehavior.ts's own ARRIVAL_THRESHOLD_WORLD_UNITS uses
// for ordinary walking, not a separate/looser tolerance.
const HUG_ARRIVAL_THRESHOLD_WORLD_UNITS = 4

export class CoupleHugCoordinator {
  private readonly male: HugParticipant
  private readonly female: HugParticipant
  private readonly random: RandomSource
  private readonly onHugVisibleChange: (visible: boolean) => void

  private phase: HugPhase = 'idle'
  private cooldownSecondsRemaining: number
  private dwellSecondsRemaining = 0

  constructor(
    male: HugParticipant,
    female: HugParticipant,
    onHugVisibleChange: (visible: boolean) => void,
    random: RandomSource = Math.random,
  ) {
    this.male = male
    this.female = female
    this.onHugVisibleChange = onHugVisibleChange
    this.random = random
    // Starts on cooldown, not immediately eligible — the couple shouldn't
    // hug within the first few seconds of the room loading, before either
    // of them has done anything else yet.
    this.cooldownSecondsRemaining = pickHugCooldownDuration(random)
  }

  getPhase(): HugPhase {
    return this.phase
  }

  /** Both avatars simply standing idle — not walking, not already seated
   * or lying down. The one eligibility rule the approved plan asks for:
   * hug must wait (never interrupt) a non-interruptible furniture
   * activity, and must not snatch a walking avatar mid-stride either. */
  private bothIdle(): boolean {
    return this.male.motion.getState() === 'idle' && this.female.motion.getState() === 'idle'
  }

  private hasArrived(motion: AvatarMotionController, target: WorldPoint): boolean {
    if (motion.getState() !== 'idle') return false
    const position = motion.getPosition()
    return Math.hypot(position.x - target.x, position.y - target.y) <= HUG_ARRIVAL_THRESHOLD_WORLD_UNITS
  }

  /**
   * Call once per ticker tick, AFTER both avatars' own
   * AvatarAutonomyDirector.update() calls (see RoomCanvas.tsx) — this
   * only ever reads their resulting state/position, or (while paused)
   * drives their motion directly, so the order relative to a PAUSED
   * director's own now-inert update() doesn't matter, only relative to an
   * unpaused one still making its own decisions.
   */
  update(deltaSeconds: number): void {
    if (this.phase === 'idle') {
      this.cooldownSecondsRemaining -= deltaSeconds
      if (this.cooldownSecondsRemaining > 0) return
      if (!this.bothIdle()) return
      this.startConverging()
      return
    }

    if (this.phase === 'converging') {
      const maleArrived = this.hasArrived(this.male.motion, HUG_CONVERGE_POINTS.male)
      const femaleArrived = this.hasArrived(this.female.motion, HUG_CONVERGE_POINTS.female)
      if (maleArrived && femaleArrived) this.startHugging()
      return
    }

    // phase === 'hugging'
    this.dwellSecondsRemaining -= deltaSeconds
    if (this.dwellSecondsRemaining <= 0) this.endHug()
  }

  private startConverging(): void {
    this.phase = 'converging'
    // Pausing FIRST, then commanding the walk directly — once paused, a
    // director's own update() no longer overrides moveTo calls with its
    // own choices, so this ordering is what guarantees the walk actually
    // sticks the very first tick.
    this.male.director.pause()
    this.female.director.pause()
    this.male.motion.moveTo(HUG_CONVERGE_POINTS.male)
    this.female.motion.moveTo(HUG_CONVERGE_POINTS.female)
  }

  private startHugging(): void {
    this.phase = 'hugging'
    this.male.rig.setVisible(false)
    this.female.rig.setVisible(false)
    this.onHugVisibleChange(true)
    this.dwellSecondsRemaining = pickHugDwellDuration(this.random)
  }

  private endHug(): void {
    this.phase = 'idle'
    this.onHugVisibleChange(false)
    this.male.rig.setVisible(true)
    this.female.rig.setVisible(true)
    this.male.director.resume()
    this.female.director.resume()
    this.cooldownSecondsRemaining = pickHugCooldownDuration(this.random)
  }
}
