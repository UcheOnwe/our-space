import { Container, Sprite } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { limbMirrorScaleX, normalizedToLocal, selectHeadTexture } from './rigGeometry'
import { LYING_HEAD_SCALE, SITTING_HEAD_SCALE, STANDING_HEAD_SCALE } from './avatarConfigs'
import type { AvatarExpression, AvatarRigConfig, AvatarSide, LimbAngles } from './avatarTypes'

export interface AvatarTextures {
  headIdle: Texture
  headSad: Texture
  bodyBase: Texture
  arm: Texture
  leg: Texture
  bodySitting: Texture
  bodyLying: Texture
}

/** The three whole-body presentations this rig can show. Each is a
 * complete swap of what the body sprite displays and which other sprites
 * are visible — see `setPose` — not a blend or animation between them;
 * whatever plays a walk/settle animation on top (AvatarMotionController)
 * only ever does so while `standing`. */
export type AvatarPose = 'standing' | 'sitting' | 'lying'

// Body anchor is bottom-center — matches the room's own floor-anchor
// convention already used throughout RoomCanvas.tsx/furniture — so every
// attachment fraction in avatarConfigs.ts is measured relative to this
// same point, not the body texture's top-left corner. Every pose's body
// texture (standing/sitting/lying) uses this same anchor convention, so
// swapping `body.texture` in `setPose` never needs to touch `body.anchor`
// itself — only which attachment fractions get read against it.
const BODY_ANCHOR = { x: 0.5, y: 1 }

/**
 * One assembled Room Avatar. Builds a Container from a character's five
 * standing-rig pieces — legs and arms each instantiated twice from one
 * texture, per the approved architecture, no duplicated source files —
 * positioned using the attachment/pivot fractions in avatarConfigs.ts.
 * Also owns the two non-standing whole-body poses (`setPose`): sitting and
 * lying are each a single complete illustration (arms/legs already baked
 * in), not the standing limb-rig re-posed, so entering either hides the
 * standing rig's separate arm/leg sprites rather than rotating them.
 */
export class AvatarRig {
  readonly container: Container

  private readonly config: AvatarRigConfig
  private readonly textures: AvatarTextures
  private readonly body: Sprite
  private readonly head: Sprite
  private readonly leftArm: Sprite
  private readonly rightArm: Sprite
  private readonly leftLeg: Sprite
  private readonly rightLeg: Sprite
  private pose: AvatarPose = 'standing'

  /**
   * @param baseScale Converts source-art pixels to world units. Deliberately
   *   a SHARED value computed once from a single reference texture (see
   *   RoomCanvas.tsx), not derived separately from each character's own
   *   body texture — the male and female source art aren't cropped to
   *   matching canvas sizes (their body textures are a different aspect
   *   ratio and padding from each other), so normalizing each to the same
   *   target height independently would silently cancel out the approved
   *   1.15 male:female ratio instead of preserving it. `relativeScale` is
   *   the ONLY thing allowed to make one character read taller than the
   *   other; baseScale must stay identical for both, in every pose.
   */
  constructor(config: AvatarRigConfig, textures: AvatarTextures, baseScale: number) {
    this.config = config
    this.textures = textures
    this.container = new Container({ label: `avatar-${config.gender}` })
    this.container.scale.set(baseScale * config.relativeScale)

    this.body = new Sprite(textures.bodyBase)
    this.body.label = 'body'
    this.body.anchor.set(BODY_ANCHOR.x, BODY_ANCHOR.y)

    this.leftLeg = this.createLimb(textures.leg, config.pivots.leg, 'left', 'leg', config.legMirrorInverted)
    this.rightLeg = this.createLimb(textures.leg, config.pivots.leg, 'right', 'leg', config.legMirrorInverted)
    this.leftArm = this.createLimb(textures.arm, config.pivots.arm, 'left', 'arm')
    this.rightArm = this.createLimb(textures.arm, config.pivots.arm, 'right', 'arm')

    this.leftLeg.position.copyFrom(this.toLocal(config.attachments.hipLeft))
    this.rightLeg.position.copyFrom(this.toLocal(config.attachments.hipRight))
    this.leftArm.position.copyFrom(this.toLocal(config.attachments.shoulderLeft))
    this.rightArm.position.copyFrom(this.toLocal(config.attachments.shoulderRight))

    // Static neutral-stance correction only (see AvatarRigConfig.legStanceRotation)
    // — opposing signs so the pair rotates toward each other, not the
    // animated idle-swing this slice deliberately has none of right now.
    if (config.legStanceRotation) {
      this.leftLeg.rotation = config.legStanceRotation
      this.rightLeg.rotation = -config.legStanceRotation
    }

    this.head = new Sprite(textures.headIdle)
    this.head.label = 'head'
    this.head.anchor.set(config.pivots.head.x, config.pivots.head.y)
    // Scaled around its own anchor (near the chin — see avatarConfigs.ts's
    // pivots) — never the container's overall scale, so this can't touch
    // the body, the male:female height ratio, or the room's overall avatar
    // scale. The rig starts in `standing` (see the `pose` field default)
    // without `setPose` ever running for that initial state, so the
    // standing scale has to be applied here too, not only in `setPose` —
    // see that method for sitting/lying, and avatarConfigs.ts for why this
    // is per-pose rather than one shared multiplier.
    this.head.scale.set(STANDING_HEAD_SCALE)
    this.head.position.copyFrom(this.toLocal(config.attachments.neck))

    // Fixed back-to-front order for BOTH characters: legs behind the body,
    // arms in front, head always on top. Rendering the head last is also
    // what satisfies the female hair rule from the approved plan — her
    // hair (baked into the head texture, no separate hair layer) then
    // always covers the shoulder/arm attachment regardless of arm
    // rotation, with no character-specific branch needed.
    this.container.addChild(this.leftLeg, this.rightLeg, this.body, this.leftArm, this.rightArm, this.head)
  }

  private createLimb(
    texture: Texture,
    pivot: { x: number; y: number },
    side: AvatarSide,
    kind: 'arm' | 'leg',
    invertMirror = false,
  ): Sprite {
    const sprite = new Sprite(texture)
    sprite.label = `${side}-${kind}`
    sprite.anchor.set(pivot.x, pivot.y)
    sprite.scale.x = limbMirrorScaleX(side, kind, invertMirror)
    return sprite
  }

  /** Converts a normalized attachment point into local coordinates against
   * the BODY sprite's CURRENT texture dimensions — deliberately re-read
   * every call, not captured once at construction, because `setPose` below
   * swaps `body.texture` to a completely different image (sitting/lying
   * aren't cropped to the same canvas as standing's `bodyBase`), so the
   * same attachment fraction means a different pixel offset per pose. */
  private toLocal(point: { x: number; y: number }): { x: number; y: number } {
    return normalizedToLocal(point, this.body.texture.width, this.body.texture.height, BODY_ANCHOR)
  }

  /** Swaps the head texture in place — same position, same pivot, same
   * scale. The whole "expression system" this slice proves. Only
   * meaningful while standing/sitting (lying shows no head at all — see
   * `setPose`); calling it while lying is harmless, it just won't be
   * visible until a later pose change shows the head again. */
  setExpression(expression: AvatarExpression) {
    this.head.texture = selectHeadTexture(this.textures, expression)
  }

  /**
   * Fills in the real "sad" head texture once it's actually finished
   * loading — see createAvatarRig.ts's `loadAvatarTextures`, which starts
   * this rig off with a harmless `Texture.EMPTY` placeholder there instead
   * of blocking the room's very first frame on an expression nothing
   * currently triggers. Also corrects the head sprite in place on the rare
   * chance `setExpression('sad')` was already called before this resolves
   * (nothing does that today, but this keeps the method correct either way
   * rather than relying on call-order luck).
   */
  setHeadSadTexture(texture: Texture) {
    const wasShowingSad = this.head.texture === this.textures.headSad
    this.textures.headSad = texture
    if (wasShowingSad) this.head.texture = texture
  }

  /** Rotates each named limb around its configured pivot. A technical proof
   * only — real idle/walk behavior is a later slice, not this one. Only
   * meaningful in the `standing` pose — sitting/lying hide these sprites
   * entirely (see `setPose`), so calling this while in either is harmless
   * but has no visible effect until standing again. */
  setLimbAngles(angles: LimbAngles) {
    if (angles.leftArm !== undefined) this.leftArm.rotation = angles.leftArm
    if (angles.rightArm !== undefined) this.rightArm.rotation = angles.rightArm
    if (angles.leftLeg !== undefined) this.leftLeg.rotation = angles.leftLeg
    if (angles.rightLeg !== undefined) this.rightLeg.rotation = angles.rightLeg
  }

  getPose(): AvatarPose {
    return this.pose
  }

  /** Shows/hides the WHOLE assembled rig — used only by
   * CoupleHugCoordinator.ts, to hide both avatars' independent rigs while
   * the combined `interaction_hug_couple` sprite stands in for them, then
   * restore them afterward. Deliberately a plain visibility toggle, not a
   * fourth `AvatarPose`: hug isn't a pose this rig itself performs (it
   * shows nothing at all during it), and keeping it out of `setPose`
   * avoids that method needing to know about a whole separate,
   * two-avatar-coordinated system it has no other reason to care about. */
  setVisible(visible: boolean): void {
    this.container.visible = visible
  }

  /**
   * Switches which whole-body presentation this rig shows. `sitting`/
   * `lying` each swap `body.texture` to a complete, already-posed
   * illustration (the production `*_body_sitting`/`*_body_lying` assets —
   * torso, arms, legs, and feet all baked into one image) and hide the
   * standing rig's separate limb sprites, rather than rotating them into a
   * seated/reclining angle the way `setLimbAngles` bends a standing walk
   * cycle. Idempotent — re-entering the current pose is a no-op.
   *
   * Head handling differs per pose, all measured directly off the real
   * production art (not assumed):
   * - `standing`/`sitting` both show a normal upright head (rotation 0) at
   *   `STANDING_HEAD_SCALE`/`SITTING_HEAD_SCALE` respectively, attached at
   *   `config.attachments.neck`/`sittingNeck` — `bodySitting` still draws
   *   an ordinary collar/neck opening a head sprite attaches to the usual
   *   way, just at a different point than `bodyBase`'s (the two aren't the
   *   same crop, so a fresh `toLocal` read against whichever texture is
   *   now current is required — see `toLocal`).
   * - `lying` also shows the head, at `LYING_HEAD_SCALE` and attached at
   *   `attachments.lyingNeck` — but `bodyLying` depicts each character
   *   reclined at an angle, not upright, so the head is ALSO rotated by
   *   `config.lyingHeadRotation` to match that angle at the attachment
   *   point (rotating around the head's own pivot, same as every other
   *   limb rotation in this rig — see `setLimbAngles`). Both the point and
   *   the rotation were measured directly against the real `body_lying`
   *   art per character (the two illustrations recline at different
   *   angles — see avatarConfigs.ts), not assumed or reused from standing.
   *
   * Each branch sets the head's scale explicitly (not just its position/
   * rotation) — see avatarConfigs.ts for why this is three independent
   * per-pose constants rather than one shared multiplier: a previous
   * shared-multiplier pass, changed here to fix lying, silently also
   * changed the already-approved standing/walking appearance.
   */
  setPose(pose: AvatarPose): void {
    if (this.pose === pose) return
    this.pose = pose

    const standing = pose === 'standing'
    this.leftArm.visible = standing
    this.rightArm.visible = standing
    this.leftLeg.visible = standing
    this.rightLeg.visible = standing

    if (pose === 'standing') {
      this.body.texture = this.textures.bodyBase
      this.head.visible = true
      this.head.rotation = 0
      this.head.scale.set(STANDING_HEAD_SCALE)
      this.head.position.copyFrom(this.toLocal(this.config.attachments.neck))
    } else if (pose === 'sitting') {
      this.body.texture = this.textures.bodySitting
      this.head.visible = true
      this.head.rotation = 0
      this.head.scale.set(SITTING_HEAD_SCALE)
      this.head.position.copyFrom(this.toLocal(this.config.attachments.sittingNeck))
    } else {
      this.body.texture = this.textures.bodyLying
      this.head.visible = true
      this.head.rotation = this.config.lyingHeadRotation ?? 0
      this.head.scale.set(LYING_HEAD_SCALE)
      this.head.position.copyFrom(this.toLocal(this.config.attachments.lyingNeck))
    }
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}
