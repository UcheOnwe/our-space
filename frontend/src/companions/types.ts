/**
 * The canonical Companion identifiers — shared, framework-neutral, and
 * consumed identically by the main React app AND the Chrome extension
 * (see vite.extension.config.ts: both Vite builds compile straight from
 * this same `frontend/src` tree, so a plain module with no React/DOM-only
 * import is automatically importable by both, no build config needed).
 *
 * These string values MUST match backend/companions/models.py's
 * CompanionProfile.CompanionType/ColorVariant TextChoices exactly — the
 * backend persists/validates these identifiers, this registry owns what
 * they look like and how they animate. That's one contract expressed on
 * both sides of the Python/TypeScript boundary (unavoidable — there's no
 * way to share code across that boundary), not the kind of duplication
 * decision #5 asks this module to avoid, which is specifically about
 * never having a SECOND, independent TypeScript copy of this registry for
 * the extension.
 */
export type CompanionTypeId = 'cosmic_blob' | 'cosmic_flyer' | 'mini_ufo' | 'star_wisp' | 'nova_guardian'

export type ColorVariantId =
  | 'default'
  | 'olive'
  | 'blush'
  | 'starlight'
  | 'lavender'
  | 'sunset'
  | 'mint'
  | 'midnight'
  | 'silver'

/** A generic direction/velocity vector — kept here (not imported from
 * companionMovement.ts) so this module has zero dependency on the
 * extension's own movement engine; both companionMovement.ts and
 * novaGuardianPose.ts independently use this same shape. */
export interface Vector2 {
  x: number
  y: number
}
