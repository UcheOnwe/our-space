import type { AvatarRig } from './AvatarRig'
import {
  DEFAULT_WALK_SPEED_WORLD_UNITS_PER_SECOND,
  SETTLE_DURATION_SECONDS,
  computeWalkLimbAngles,
  deriveNeutralLimbAngles,
  settleTowardNeutral,
  stepTowards,
  transition,
} from './avatarBehavior'
import type { AvatarBehaviorState, NeutralLimbAngles, WorldPoint } from './avatarBehavior'
import type { AvatarRigConfig, LimbAngles } from './avatarTypes'
import { computeRoute } from '../walkableArea'

/**
 * The PixiJS-facing half of Room Avatar movement — owns one AvatarRig's
 * world position/pose and drives its container/limbs from a ticker, using
 * only the pure state/math in avatarBehavior.ts (movement, walk-cycle) and
 * walkableArea.ts (destination clamping, obstacle routing) to decide WHAT
 * to do each frame. This class is deliberately "dumb": it holds no
 * behavior rules of its own — no idea WHEN to walk somewhere or sit down,
 * or for how long — just wiring those modules' outputs (plus the simple
 * sit/lie/stand primitives below) onto a real rig. The decision logic
 * stays unit-testable without a renderer, per the approved plan, and this
 * class's own tests (AvatarMotionController.test.ts) only need to check
 * that wiring, with the same GPU-free fake textures AvatarRig.test.ts
 * already uses. AvatarAutonomyDirector.ts is the layer that actually
 * decides when to call `moveTo`/`sitAt`/`lieAt`/`standUp`.
 *
 * Deliberately does NOT rotate or vertically offset the container while
 * walking — a whole-body travel lean and a footstep bob were both tried
 * and then removed after manual inspection (see avatarBehavior.ts): the
 * bob read as a shake/vibration, and the lean looked like falling over
 * rather than walking, since the rig only has front-facing art and
 * nothing to justify tilting it. The container only ever moves (position)
 * and mirrors (scale.x, for left/right facing) — see setFacing below.
 */
export class AvatarMotionController {
  private readonly rig: AvatarRig
  private readonly neutral: NeutralLimbAngles
  private readonly speedWorldUnitsPerSecond: number
  /** The rig's OWN unmirrored container scale magnitude, captured once at
   * construction — facing changes flip this container's scale.x sign
   * without ever touching its magnitude (baseScale * relativeScale, see
   * AvatarRig's constructor), so the approved male:female height ratio
   * can't drift no matter how many times an avatar turns around. */
  private readonly unsignedContainerScaleX: number

  private state: AvatarBehaviorState = 'idle'
  private position: WorldPoint
  /** The remaining waypoints to walk through in order — see
   * walkableArea.ts's computeRoute. `route[0]` is the current leg's
   * target; arriving at it just advances to `route[1]` (still `walking`,
   * no idle/settle in between) until the LAST waypoint, which triggers
   * the normal arrived->settle->idle sequence. Empty means "not walking." */
  private route: WorldPoint[] = []
  private facing: 'left' | 'right' = 'right'
  private walkElapsedSeconds = 0
  private settleElapsedSeconds = 0
  private settlingFromLimbs: LimbAngles | null = null

  constructor(
    rig: AvatarRig,
    config: Pick<AvatarRigConfig, 'legStanceRotation'>,
    initialPosition: WorldPoint,
    speedWorldUnitsPerSecond: number = DEFAULT_WALK_SPEED_WORLD_UNITS_PER_SECOND,
  ) {
    this.rig = rig
    this.neutral = deriveNeutralLimbAngles(config)
    this.speedWorldUnitsPerSecond = speedWorldUnitsPerSecond
    this.position = { ...initialPosition }
    this.unsignedContainerScaleX = Math.abs(rig.container.scale.x)
    this.rig.container.position.set(this.position.x, this.position.y)
  }

  getState(): AvatarBehaviorState {
    return this.state
  }

  getPosition(): WorldPoint {
    return { ...this.position }
  }

  /** Requests a walk to `destination`. The actual route (one direct leg,
   * or one detour waypoint plus the destination — see
   * walkableArea.ts's computeRoute) is computed once here, not
   * re-evaluated every frame; safe to call again mid-walk, which simply
   * re-routes from wherever the avatar currently is and restarts the
   * walk-cycle phase so the new leg swing always starts from the same
   * point. Also the way OUT of sitting/lying, same as any other state —
   * see `transition`'s doc comment on why SIT/LIE/STAND/MOVE_TO don't gate
   * on the current state themselves; standing the rig back up first is
   * AvatarAutonomyDirector's job (call `standUp()` before this), not
   * something this method infers on your behalf. */
  moveTo(destination: WorldPoint): void {
    this.route = computeRoute(this.position, destination)
    this.walkElapsedSeconds = 0
    this.settlingFromLimbs = null
    this.state = transition(this.state, { type: 'MOVE_TO', destination: this.route[0] })
  }

  /**
   * Sits the rig at `position` — used once an avatar has already WALKED to
   * a furniture activity's authored approach point (see
   * avatarActivities.ts); this method itself never moves the avatar there,
   * it only applies the final pose/position for the last small step onto
   * the couch, which may differ slightly from the walkable approach point
   * itself (see AvatarRig.ts's `setPose` for why sitting is a whole
   * separate illustration, not a rotated stand). Clears any in-progress
   * walk/settle state outright rather than letting it keep animating limbs
   * `setPose` is about to hide anyway.
   */
  sitAt(position: WorldPoint): void {
    this.route = []
    this.settlingFromLimbs = null
    this.position = { ...position }
    this.rig.container.position.set(this.position.x, this.position.y)
    this.rig.setPose('sitting')
    this.state = transition(this.state, { type: 'SIT' })
  }

  /** Lies the rig down at `position` — the lying counterpart to `sitAt`,
   * same "already walked to the approach point, this is the final
   * placement" contract. See AvatarRig.ts's `setPose` for why lying shows
   * no separate head sprite. */
  lieAt(position: WorldPoint): void {
    this.route = []
    this.settlingFromLimbs = null
    this.position = { ...position }
    this.rig.container.position.set(this.position.x, this.position.y)
    this.rig.setPose('lying')
    this.state = transition(this.state, { type: 'LIE' })
  }

  /** Returns to standing, in place, from sitting or lying — the ONLY way
   * out of either (there's no direct sitting->lying or lying->sitting;
   * AvatarAutonomyDirector always stands up first, same as a real person
   * would). Resets limbs to their neutral standing angles so a later walk
   * doesn't briefly show whatever mid-stride angles happened to be set
   * before the avatar sat down. */
  standUp(): void {
    this.rig.setPose('standing')
    this.rig.setLimbAngles(this.neutral)
    this.state = transition(this.state, { type: 'STAND' })
  }

  /** Advances the walk/settle animation by `deltaSeconds` (real elapsed
   * time, e.g. PixiJS's `ticker.deltaMS / 1000` — NOT `ticker.deltaTime`,
   * which is frame-rate-normalized rather than a true seconds value) and
   * applies the result to the underlying rig. Call once per ticker tick. */
  update(deltaSeconds: number): void {
    if (this.state === 'walking' && this.route.length > 0) {
      const target = this.route[0]
      this.walkElapsedSeconds += deltaSeconds

      const step = stepTowards(this.position, target, this.speedWorldUnitsPerSecond, deltaSeconds)
      this.position = step.position
      if (step.facing) this.setFacing(step.facing)

      this.rig.container.position.set(this.position.x, this.position.y)

      const walkAngles = computeWalkLimbAngles(this.walkElapsedSeconds, this.neutral)
      this.rig.setLimbAngles(walkAngles)

      if (step.arrived) {
        this.route = this.route.slice(1)
        if (this.route.length > 0) {
          // Mid-route waypoint — keep walking straight through to the
          // next leg without settling, so a detour reads as one
          // continuous walk, not a stop-start.
          return
        }
        this.settlingFromLimbs = walkAngles
        this.settleElapsedSeconds = 0
        this.state = transition(this.state, { type: 'ARRIVED' })
      }
      return
    }

    if (this.settlingFromLimbs) {
      this.settleElapsedSeconds += deltaSeconds
      const t = this.settleElapsedSeconds / SETTLE_DURATION_SECONDS
      if (t >= 1) {
        this.rig.setLimbAngles(this.neutral)
        this.settlingFromLimbs = null
      } else {
        this.rig.setLimbAngles(settleTowardNeutral(this.settlingFromLimbs, this.neutral, t))
      }
    }
  }

  private setFacing(facing: 'left' | 'right'): void {
    if (this.facing === facing) return
    this.facing = facing
    // Whole-container mirroring (see avatarConfigs.ts's rig for how each
    // LIMB's own left/right mirroring already works) — flips the fully
    // assembled character around its own vertical centerline. Safe here
    // specifically because every child sprite's position is measured
    // relative to the body's own bottom-center anchor (x=0 in the
    // container's local space — see AvatarRig's toLocal), so mirroring the
    // container never touches individual limb mirroring, Z-order, or the
    // female hair-covers-shoulder rule, all of which are internal to the
    // container and unaffected by its own overall sign.
    this.rig.container.scale.x = facing === 'left' ? -this.unsignedContainerScaleX : this.unsignedContainerScaleX
  }
}
