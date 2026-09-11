/**
 * Shared type vocabulary for the Room Avatar rig. Kept separate from
 * avatarConfigs.ts/AvatarRig.ts so the shape of a rig is defined in exactly
 * one place, regardless of which module needs to reference it.
 */

export type AvatarGender = 'male' | 'female'
export type AvatarExpression = 'idle' | 'sad'
export type AvatarSide = 'left' | 'right'

/** A point expressed as a FRACTION of some texture's own width/height
 * (0-1 on each axis), not a pixel offset. Every attachment/pivot in this
 * rig is normalized this way specifically because the actual production
 * PNGs aren't loaded yet when this config is written — a fraction
 * resamples correctly against whatever the real texture's pixel
 * dimensions turn out to be, where a hardcoded pixel number would not. */
export interface NormalizedPoint {
  x: number
  y: number
}

export interface AvatarTexturePaths {
  headIdle: string
  headSad: string
  bodyBase: string
  arm: string
  leg: string
  /** A whole seated-pose illustration (torso/arms/legs/feet all baked
   * into one image, the same headless-at-the-neck convention as
   * `bodyBase`) — NOT a limb-rig pose. Swapped in wholesale, with the
   * standing rig's separate arm/leg sprites hidden, rather than rotating
   * the existing limbs into a seated angle — see AvatarRig.ts's
   * `setPose`. */
  bodySitting: string
  /** A whole reclining-pose illustration, same "one complete image"
   * convention as `bodySitting` — see AvatarRig.ts's `setPose` for why
   * this pose renders with no separate head sprite at all. */
  bodyLying: string
}

/** Where each limb/head attaches, expressed as a fraction of the BODY
 * texture's own dimensions — "the left shoulder is here on the body art." */
export interface AvatarAttachmentConfig {
  neck: NormalizedPoint
  shoulderLeft: NormalizedPoint
  shoulderRight: NormalizedPoint
  hipLeft: NormalizedPoint
  hipRight: NormalizedPoint
  /** The neck point on `bodySitting`'s OWN image — a fraction of ITS
   * dimensions, not `bodyBase`'s (the two aren't the same crop). Only
   * `neck` needs a per-pose variant: `bodySitting` still shows a normal
   * upright neck/collar a head sprite can attach to the usual way, unlike
   * `bodyLying` (no per-pose point at all — see AvatarRig.ts's `setPose`
   * for why lying renders with no separate head). */
  sittingNeck: NormalizedPoint
}

/** Where each limb/head's OWN rotation pivot sits, expressed as a fraction
 * of that piece's own texture dimensions — "the sleeve rotates from its
 * own top-center," independent of where it's attached on the body. */
export interface AvatarPivotConfig {
  arm: NormalizedPoint
  leg: NormalizedPoint
  head: NormalizedPoint
}

export interface AvatarRigConfig {
  gender: AvatarGender
  /** Visual scale relative to the OTHER character — encodes the approved
   * ~1.15 male:female height rule. Not a real-world unit; a plain
   * multiplier applied to the whole assembled rig. */
  relativeScale: number
  textures: AvatarTexturePaths
  attachments: AvatarAttachmentConfig
  pivots: AvatarPivotConfig
  /** Flips which side (left/right) gets the raw vs. mirrored leg texture
   * from `limbMirrorScaleX`'s general geometric default (see
   * rigGeometry.ts). That default is derived from the leg art's measured
   * bend direction alone — it has no way to know about a design detail
   * like a cargo pocket that's only authored on one side of the source
   * texture. When an asset like that exists, which side reads as "outer
   * thigh" for the pocket is the authority, not the bend heuristic — so a
   * character whose leg art has such a detail sets this to override the
   * default instead of the default silently mirroring the pocket onto the
   * wrong leg. Omit (or leave false) for leg art with no such asymmetry —
   * the bend-direction default already produces a natural outward stance. */
  legMirrorInverted?: boolean
  /** Small constant rotation, in radians, applied to both legs as part of
   * their STATIC neutral pose — not the (currently disabled) idle-swing
   * animation. Left gets +value, right gets -value, so the pair rotates in
   * opposing directions around each leg's own configured pivot, closing
   * the outward splay the leg art's natural bend otherwise reads as at the
   * bottom of the stance. Omit (or leave 0/undefined) for leg art whose
   * default bend already stands naturally. A future limb-animation slice
   * that resumes calling `setLimbAngles` will overwrite this baseline
   * entirely (it sets rotation outright, not additively) — that's fine
   * while animation stays off, but worth remembering when it comes back. */
  legStanceRotation?: number
}

export interface LimbAngles {
  leftArm?: number
  rightArm?: number
  leftLeg?: number
  rightLeg?: number
}
