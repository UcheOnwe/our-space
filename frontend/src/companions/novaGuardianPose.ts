import type { Vector2 } from './types'

/**
 * Direction-driven posing for Nova Guardian — pure math, no DOM, no
 * knowledge of the extension/React. Kept in its own module per "keep
 * responsibilities separate": Companion shape (companionShapes.ts) is
 * "what it looks like," this is "how a movement direction bends that
 * look into a semantic flying pose," and companionView.ts is the only
 * thing that turns this pose into actual DOM writes.
 *
 * SECOND-ROUND REDESIGN (see PR discussion): the original version of this
 * module rotated the WHOLE character (a front-facing, left/right-
 * symmetric drawing) by an absolute angle covering the full 0-360°
 * range, with arms as separate siblings rotated independently. That
 * technique is fundamentally unable to produce a coherent flying pose —
 * a front-facing head with two centered, symmetric eyes looks IDENTICAL
 * rotated 0° or 180°, so rotation alone can't communicate "which way a
 * symmetric shape is facing," and independently-rotating siblings can't
 * stay visually attached to each other. See companionShapes.ts's own doc
 * comment for the full nested-hierarchy fix; this module only owns the
 * math half.
 *
 * THIS VERSION instead produces a semantic pose:
 * - `facingLeft` MIRRORS the figure (scaleX(-1)) for left/right facing,
 *   rather than rotating it. A mirrored image of a correct "facing
 *   right" pose is a correct "facing left" pose, by construction — this
 *   is what actually fixes "head faces opposite the direction of
 *   travel."
 * - `bankDeg` is a bounded lean (not a full reorientation), computed in
 *   ONE canonical "facing right" reference frame and applied BEFORE the
 *   mirror in the transform stack (see companionView.ts) — mirroring an
 *   already-banked figure automatically flips the bank the correct way
 *   too (a figure banked up-and-right, mirrored, reads as banked
 *   up-and-left), so this module never needs a separate banked-left
 *   value.
 * - `poseMode` distinguishes 'side' flight (used for any direction with
 *   a horizontal component, banked as above) from dedicated
 *   'vertical-up'/'vertical-down' poses (pure vertical travel) — these
 *   are NOT derived by rotating the side pose 90°; they're their own
 *   named mode so the (much more foreshortened, "diving toward/away from
 *   camera") reference art for up/down can be approximated honestly
 *   instead of faked with a rotation that would look wrong.
 * - `leadArmSwingDeg`/`trailArmSwingDeg` are each arm's FULL rotation for
 *   the current pose (not a small delta) — computed here, per pose mode,
 *   so the semantic pose stays the one place arm orientation is decided
 *   and stays fully unit-testable (see this module's own test file).
 * - `trailDirection` is exactly the negated movement direction — what the
 *   cape and movement wake orient toward (see companionShapes.ts's
 *   buildNovaGuardianSvg doc comment for why both are driven directly
 *   from this rather than inheriting the body's own mirror/bank
 *   transform).
 */

export type NovaGuardianPoseMode = 'idle' | 'side' | 'vertical-up' | 'vertical-down'

export interface NovaGuardianPose {
  isFlying: boolean
  poseMode: NovaGuardianPoseMode
  facingLeft: boolean
  bankDeg: number
  leadArmSwingDeg: number
  trailArmSwingDeg: number
  trailDirection: Vector2
}

// A bounded lean, not a reorientation — "controlled bank," per the
// approved plan, for the four diagonals only. Pure horizontal/vertical
// travel uses 0.
const BANK_DEG = 22

// Both arms are DRAWN hanging straight down at rest (companionShapes.ts —
// matches the neutral reference). -90deg is what rotates the lead arm's
// pivot-to-tip axis from "straight down" to "pointing along +x" — i.e.
// exactly the canonical (unmirrored) travel direction for the 'side'
// pose, so the lead arm visibly reaches the way the Guardian is
// traveling rather than an arbitrary angle. The trail arm gets a small
// swing the OTHER way (further back, not mirroring the lead arm), so it
// reads as tucked behind rather than a mirrored copy of the lead arm.
const SIDE_LEAD_ARM_SWING_DEG = -90
const SIDE_TRAIL_ARM_SWING_DEG = 20

// Vertical modes pull BOTH arms the same way (up for climbing, in/down
// for diving) — there's no meaningful "lead vs trail" arm distinction
// when travel has no horizontal component at all, unlike the side pose.
// Smaller magnitudes than the side pose's -90: these arms stay closer to
// the body (a "reaching"/"tucked" adjustment, not a full horizontal
// extension), matching the more compact, foreshortened look of the
// up/down reference art rather than the fully-extended side-flight pose.
const VERTICAL_UP_ARM_SWING_DEG = -50
const VERTICAL_DOWN_ARM_SWING_DEG = 15

export const NOVA_GUARDIAN_IDLE_POSE: NovaGuardianPose = {
  isFlying: false,
  poseMode: 'idle',
  facingLeft: false,
  bankDeg: 0,
  leadArmSwingDeg: 0,
  trailArmSwingDeg: 0,
  trailDirection: { x: 0, y: 0 },
}

/**
 * Turns a movement direction (see companionMovement.ts's
 * `computeDirectionVector` — always exactly -1/0/1 per axis in real
 * usage, but `Math.sign` is applied defensively) into a Nova Guardian
 * pose. See this module's own top-level doc comment for the model.
 */
export function computeNovaGuardianPose(direction: Vector2): NovaGuardianPose {
  const dx = Math.sign(direction.x)
  const dy = Math.sign(direction.y)

  if (dx === 0 && dy === 0) return NOVA_GUARDIAN_IDLE_POSE

  // Always exactly the negated movement direction — see this module's
  // own doc comment. Computed once here rather than re-derived per
  // branch below. `-dx`/`-dy` alone would produce `-0` for a zero axis
  // (e.g. pure vertical travel negating its own zero `x`) — harmless
  // numerically, but `-0 !== 0` under strict equality/toEqual, so `|| 0`
  // normalizes it back to a plain `0`.
  const trailDirection: Vector2 = { x: -dx || 0, y: -dy || 0 }

  if (dx === 0) {
    const poseMode: NovaGuardianPoseMode = dy < 0 ? 'vertical-up' : 'vertical-down'
    const armSwing = dy < 0 ? VERTICAL_UP_ARM_SWING_DEG : VERTICAL_DOWN_ARM_SWING_DEG
    return {
      isFlying: true,
      poseMode,
      facingLeft: false,
      bankDeg: 0,
      leadArmSwingDeg: armSwing,
      trailArmSwingDeg: armSwing,
      trailDirection,
    }
  }

  return {
    isFlying: true,
    poseMode: 'side',
    facingLeft: dx < 0,
    // Computed from the vertical component ONLY, in the canonical
    // (unmirrored) frame — see this module's own doc comment for why
    // the mirror alone correctly handles the left-facing diagonals
    // without this needing its own left/right sign.
    bankDeg: dy < 0 ? -BANK_DEG : dy > 0 ? BANK_DEG : 0,
    leadArmSwingDeg: SIDE_LEAD_ARM_SWING_DEG,
    trailArmSwingDeg: SIDE_TRAIL_ARM_SWING_DEG,
    trailDirection,
  }
}
