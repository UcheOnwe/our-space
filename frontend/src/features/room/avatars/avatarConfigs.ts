import type { AvatarAttachmentConfig, AvatarPivotConfig, AvatarRigConfig } from './avatarTypes'

/**
 * The approved visual height rule: male ≈ 6'5"/196cm, female ≈ 5'7"/170cm.
 * Female is the 1.0 baseline; only the male carries a multiplier, so the
 * relationship has a single source of truth instead of two numbers that
 * could drift apart independently. This is a stylized visual scale, not a
 * realistic anatomical simulation — both characters keep their large-
 * head/small-body proportions untouched; only the whole assembled rig's
 * overall size differs between them.
 */
export const MALE_RELATIVE_SCALE = 1.15
export const FEMALE_RELATIVE_SCALE = 1.0

// Production art is captured at print/upscale resolution — thousands of
// pixels per piece, not pre-sized to the room's world units. This is the
// target "how tall should the reference character's torso art read in
// world units" — the ONE knob that changes when the room (not the rig)
// demands a different overall scale. Used with the FEMALE's own body
// texture as the one shared reference for converting pixels to world units
// (see RoomCanvas.tsx) — deliberately not recomputed separately per
// character, since the male and female body art aren't cropped to matching
// canvas sizes, and doing so would silently cancel out MALE_RELATIVE_SCALE
// instead of preserving it.
//
// Calibrated down three times now, each time because the assembled rigs
// still read oversized against the real production room once it was in
// place: 130 -> 114 -> 99, then a further ~19% here (99 -> 80) after
// checking against the entry door specifically as the visual scale
// reference. Still just the one shared knob — it scales both complete
// assembled rigs uniformly, so MALE_RELATIVE_SCALE/FEMALE_RELATIVE_SCALE
// and everything about the rig itself (pivots, attachments, leg stance,
// mirroring) stay untouched.
export const TARGET_BODY_HEIGHT_WORLD_UNITS = 80

// A prior pass tried a single HEAD_SCALE_MULTIPLIER applied to every pose
// alike (0.83, then 0.70 — see git history), chasing a "heads read too
// large" impression. Manual review of the approved room found that
// impression was wrong for standing/walking and sitting — their head size
// was already the approved look and reducing it changed avatar appearance
// that wasn't supposed to change — so both are restored to their native,
// pre-reduction scale here. A single shared knob can't tell "standing"
// and "lying" apart, which is exactly what went wrong; per-pose constants
// below can, even where the values happen to currently agree.
//
// AvatarRig.ts's `setPose` applies these to the head SPRITE's own scale
// only, never to TARGET_BODY_HEIGHT_WORLD_UNITS or either RELATIVE_SCALE
// above — those govern the whole assembled rig (body + head + limbs
// together) and would also resize the body if touched.
export const STANDING_HEAD_SCALE = 1
export const SITTING_HEAD_SCALE = 1
// Confirmed live at this scale against the real lying art per character —
// the lyingNeck/lyingHeadRotation attachment math above was originally
// measured and approved at this exact scale (before either global
// multiplier existed), so 1 here reproduces that same approved look
// rather than introducing a new one.
export const LYING_HEAD_SCALE = 1

/**
 * Every attachment/pivot below is a FRACTION of the relevant texture's own
 * width/height, not a hardcoded pixel offset — see avatarTypes.ts.
 *
 * The alpha-content bounding box (scanning for the outermost non-
 * transparent pixel) got the rig's first pass close, but a second manual
 * visual calibration pass found it isn't a reliable stand-in for the
 * actual anatomy in every case:
 *
 * - The female head texture's alpha bounds extend well past her actual
 *   neck, because her long hair drapes down over where the shoulders/torso
 *   would be. Anchoring the head at the bottom of that bounding box (as
 *   the first pass did) put her real chin/neck far above the body's neck
 *   attachment — a large visible gap. `FEMALE_PIVOTS.head` is now set from
 *   the actual jaw/chin row in the art instead (found by direct visual
 *   inspection against a labeled grid overlay of the texture, not another
 *   bounding-box scan), letting the hair drape naturally over the torso
 *   below that point, the way it does anatomically.
 * - `MALE_ATTACHMENTS.neck` needed a small downward nudge for the same
 *   reason on a smaller scale — his short hair's bounding box sits very
 *   close to his true chin, but not quite close enough to fully close the
 *   gap against the body's collar.
 * - Both `leg` pivots were measured from the single topmost alpha row,
 *   which on both characters' leg art lands on a narrow waistband/belt-
 *   loop detail rather than the visually natural hip/waist centerline a
 *   few rows down — visibly off-center once mirrored per limb (see
 *   rigGeometry.ts's `limbMirrorScaleX`), producing the reported crotch
 *   gap (male) and crossed/converging legs (female). Recentered on the
 *   actual visual mass of the leg's top edge instead.
 * - `FEMALE_ATTACHMENTS.hipLeft/hipRight.y` needed a much bigger rethink,
 *   not just a number tweak: `female_body_base` isn't a torso-only sprite —
 *   its own art already draws the rounded upper-pants/pelvis shape (both
 *   legs merged into one poofy silhouette, the way baggy pants naturally
 *   bunch at the top). `female_leg` is a *complete* leg on its own,
 *   waistband cuff included — so attaching it at the body's actual hip/
 *   waist row (the first pass's anatomical assumption) rendered that
 *   second waistband cuff BELOW the body's already-complete pants shape:
 *   a visible seam that read as a skirt layered over pants, with the
 *   doubled-up geometry crossing in the middle. There's no anatomical hip
 *   joint to calibrate against here — the two pieces are a layered asset,
 *   not a skeleton. The fix is compositional: keep `FEMALE_PIVOTS.leg`
 *   anchored at the leg piece's own top edge (its natural reference frame,
 *   left as originally measured), but move `hipLeft`/`hipRight.y` from the
 *   body's actual waistline (~0.97) up into the solidly-opaque interior of
 *   its pants shape (~0.80). Since `body` still renders after (on top of)
 *   the legs, that tucks the leg's redundant waistband/thigh art behind
 *   the body's own pants silhouette instead of shortening the leg — only
 *   the portion below the body's rounded hem (knee down) shows, reading as
 *   one continuous pair of pants. Confirmed against the real textures
 *   composited together at this exact math (not just eyeballed) before
 *   landing on these numbers.
 *
 * - `MALE_ATTACHMENTS.hipLeft/hipRight.x` went through two rounds for two
 *   different reasons, ending somewhere neither round predicted alone.
 *   Round one (0.3/0.7 → 0.25/0.75) treated the crossing as pure spacing
 *   and widened the stance, under the general bend-direction mirroring
 *   default (see `limbMirrorScaleX`). Round two found the actual root
 *   cause: `male_leg`'s cargo pocket is only drawn on the RAW texture's
 *   own right side, and that general default put the raw texture on the
 *   right leg — landing the pocket on the *inner* right thigh instead of
 *   the outer one it's obviously meant for (confirmed by inspecting the
 *   real texture, not assumed). Fixing that required inverting which side
 *   gets mirrored for this character specifically (`legMirrorInverted`,
 *   below) — but that inversion also flips the leg art's natural bend
 *   direction, so the round-one widening (tuned for the OLD, pocket-wrong
 *   mirroring) way overshot once the pockets were corrected, bowing both
 *   legs outward into a wishbone stance. With the pocket-correct mirroring
 *   in place, the hip X spread needed to come back in, further than either
 *   prior value (0.25/0.75 → 0.38/0.62) — confirmed by compositing the
 *   real textures at each candidate spread under the corrected mirroring,
 *   not by re-guessing from the old (now-superseded) reasoning.
 *
 * Male and female stay measured and configured separately on purpose —
 * their source art isn't cropped to matching canvases, so a shared guess
 * was never going to fit both.
 */
const MALE_PIVOTS: AvatarPivotConfig = {
  arm: { x: 0.434, y: 0.04 },
  leg: { x: 0.41, y: 0.026 },
  head: { x: 0.499, y: 0.945 },
}

const FEMALE_PIVOTS: AvatarPivotConfig = {
  arm: { x: 0.436, y: 0.069 },
  leg: { x: 0.574, y: 0.033 },
  head: { x: 0.543, y: 0.7 },
}

const MALE_ATTACHMENTS: AvatarAttachmentConfig = {
  neck: { x: 0.5, y: 0.16 },
  shoulderLeft: { x: 0.182, y: 0.214 },
  shoulderRight: { x: 0.82, y: 0.214 },
  hipLeft: { x: 0.38, y: 0.78 },
  hipRight: { x: 0.62, y: 0.78 },
  // Measured directly off male_body_sitting's own collar opening (a
  // visual read against the real texture, same measurement approach as
  // every other attachment above — not derived from `neck` above, since
  // that's a fraction of a completely different image/crop).
  sittingNeck: { x: 0.454, y: 0.124 },
  // Measured off male_body_lying's own visible neck opening (between the
  // crossed arms), confirmed by rendering the real head against it at
  // several candidate points/rotations until the join looked natural (no
  // gap, no torso overlap) — same "confirm against the composited real
  // art" standard as every other attachment in this file. See
  // MALE_AVATAR_CONFIG.lyingHeadRotation for the matching rotation this
  // point alone doesn't capture.
  lyingNeck: { x: 0.305, y: 0.3 },
}

const FEMALE_ATTACHMENTS: AvatarAttachmentConfig = {
  neck: { x: 0.499, y: 0.079 },
  shoulderLeft: { x: 0.23, y: 0.188 },
  shoulderRight: { x: 0.771, y: 0.188 },
  hipLeft: { x: 0.309, y: 0.8 },
  hipRight: { x: 0.677, y: 0.8 },
  // Measured directly off female_body_sitting's own collar opening.
  sittingNeck: { x: 0.527, y: 0.098 },
  // Measured off female_body_lying's own visible neck/collar opening,
  // confirmed by rendering the real head against it — her hair (baked
  // into the head texture) naturally drapes over most of the seam either
  // way, the same female hair-covers-shoulder rule the standing rig
  // already relies on. See FEMALE_AVATAR_CONFIG.lyingHeadRotation for the
  // matching rotation.
  lyingNeck: { x: 0.365, y: 0.335 },
}

export const MALE_AVATAR_CONFIG: AvatarRigConfig = {
  gender: 'male',
  relativeScale: MALE_RELATIVE_SCALE,
  textures: {
    headIdle: '/room/avatars/male/male_head_idle.png',
    headSad: '/room/avatars/male/male_head_sad.png',
    bodyBase: '/room/avatars/male/male_body_base.png',
    arm: '/room/avatars/male/male_arm.png',
    leg: '/room/avatars/male/male_leg.png',
    bodySitting: '/room/avatars/male/male_body_sitting.png',
    bodyLying: '/room/avatars/male/male_body_lying.png',
  },
  attachments: MALE_ATTACHMENTS,
  pivots: MALE_PIVOTS,
  // The cargo pocket on male_leg is only drawn on the raw texture's own
  // right side — a fixed design detail, not something the general bend-
  // direction mirroring default (limbMirrorScaleX) can know about. Without
  // this, the default puts the pocket on the inner thigh of one leg. See
  // rigGeometry.ts and the hip-X comment above for the full reasoning.
  legMirrorInverted: true,
  // With the pocket-correct mirroring/hip-X above, the leg art's own bend
  // still reads as a bit more outward-splayed at the ankles than a relaxed
  // stance calls for. A small opposing rotation (confirmed against the
  // real textures composited at a few candidate magnitudes, not guessed)
  // closes that without touching the hip attachment or crotch coverage
  // it took two rounds to get right.
  legStanceRotation: 0.04,
  // male_body_lying reclines at a diagonal (head at upper-left, feet at
  // lower-right) — confirmed by rendering the real head against the real
  // body at several candidate rotations until it matched the body's own
  // reclined angle with no gap or overlap (see MALE_ATTACHMENTS.lyingNeck).
  lyingHeadRotation: -0.4,
}

export const FEMALE_AVATAR_CONFIG: AvatarRigConfig = {
  gender: 'female',
  relativeScale: FEMALE_RELATIVE_SCALE,
  textures: {
    headIdle: '/room/avatars/female/female_head_idle.png',
    headSad: '/room/avatars/female/female_head_sad.png',
    bodyBase: '/room/avatars/female/female_body_base.png',
    arm: '/room/avatars/female/female_arm.png',
    leg: '/room/avatars/female/female_leg.png',
    bodySitting: '/room/avatars/female/female_body_sitting.png',
    bodyLying: '/room/avatars/female/female_body_lying.png',
  },
  attachments: FEMALE_ATTACHMENTS,
  pivots: FEMALE_PIVOTS,
  // female_body_lying reclines at her own angle, independently measured
  // and confirmed against the real render — a genuinely different pose
  // from the male's (legs bent up rather than extended in a straight
  // diagonal), not a mirrored copy of his.
  lyingHeadRotation: -0.55,
}

export const AVATAR_CONFIGS = {
  male: MALE_AVATAR_CONFIG,
  female: FEMALE_AVATAR_CONFIG,
} as const
