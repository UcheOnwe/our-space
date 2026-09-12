import type { AvatarExpression, AvatarSide, NormalizedPoint } from './avatarTypes'

export type LimbKind = 'arm' | 'leg'

/**
 * Converts a normalized attachment point (a fraction of some texture's own
 * width/height) into local coordinates relative to a given anchor on that
 * same texture — e.g. "where does the shoulder point sit, measured from
 * the body sprite's own bottom-center anchor."
 *
 * Pure and Pixi-independent on purpose: this is the one piece of rig
 * geometry math fully covered by unit tests instead of manual/browser
 * verification, the same role camera.ts's fit/pan math already plays for
 * the room's camera.
 */
export function normalizedToLocal(
  point: NormalizedPoint,
  width: number,
  height: number,
  anchor: NormalizedPoint,
): { x: number; y: number } {
  return {
    x: (point.x - anchor.x) * width,
    y: (point.y - anchor.y) * height,
  }
}

/**
 * Which horizontal scale sign turns the single source limb texture into
 * the opposite side's mirror image.
 *
 * Determined by measuring the actual production art, not assumed — and
 * arms and legs bulge in OPPOSITE directions, so they need opposite
 * conventions:
 *
 * The source ARM texture's elbow bulges toward larger X going from
 * shoulder to hand (measured top-row vs bottom-row center: ~0.435 →
 * ~0.456). That reads as a natural outward bend on the RIGHT side, so the
 * raw texture is used unmirrored for the right arm, mirrored for the left.
 *
 * The source LEG texture's knee/shin drifts toward SMALLER X going from
 * hip to foot (measured top-row vs bottom-row center: ~0.55 → ~0.43 —
 * confirmed on both characters). Raw and unmirrored, that drift reads as
 * the foot landing outward (away from center) when the leg is used
 * unmirrored on the LEFT hip, and inward/crossing when reused unmirrored
 * on the right — the opposite of the arm case. So the DEFAULT is legs
 * mirrored for the RIGHT side and left raw for the left.
 *
 * That bend-direction default is a purely geometric heuristic, though, and
 * it has no way to know about a one-sided design detail baked into a
 * specific leg texture — e.g. the male leg art's cargo pocket, which only
 * exists on the RAW texture's own right side. Used unmirrored on the right
 * leg (the bend-direction default), that pocket lands on the *inner*
 * right thigh instead of the outer one it's clearly meant for. A visible,
 * asset-specific detail like that overrides the geometric default — see
 * `AvatarRigConfig.legMirrorInverted`, which flips the assignment for a
 * character whose leg art needs it, without changing the general default
 * that still holds for leg art with no such asymmetry.
 *
 * One texture, instantiated twice per limb, per the approved architecture
 * — only which side gets the flip changes, per limb kind and, for legs
 * specifically, per character when the art demands it. `invert` only ever
 * applies to legs — arms have no per-character override, so passing it
 * for an arm is a no-op rather than a footgun.
 */
export function limbMirrorScaleX(side: AvatarSide, kind: LimbKind, invert = false): 1 | -1 {
  const base: 1 | -1 = kind === 'leg' ? (side === 'right' ? -1 : 1) : side === 'left' ? -1 : 1
  const shouldInvert = invert && kind === 'leg'
  return shouldInvert ? ((-base) as 1 | -1) : base
}

/**
 * Picks which head texture to display for a given expression. This is the
 * entire "expression system" for this slice: a whole-head swap, not a
 * sub-face rig — deliberately generic over T so it's testable with plain
 * values, without needing a real PixiJS Texture at all.
 */
export function selectHeadTexture<T>(
  textures: { headIdle: T; headSad: T },
  expression: AvatarExpression,
): T {
  return expression === 'sad' ? textures.headSad : textures.headIdle
}
