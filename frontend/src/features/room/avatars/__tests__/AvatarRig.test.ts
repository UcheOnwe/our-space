import { Sprite, Texture, TextureSource } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { AvatarRig } from '../AvatarRig'
import type { AvatarTextures } from '../AvatarRig'
import { FEMALE_AVATAR_CONFIG, MALE_AVATAR_CONFIG } from '../avatarConfigs'

const FAKE_BASE_SCALE = 1

// Texture.WHITE/Texture.EMPTY are real, always-available PixiJS textures —
// no network, no renderer, no GPU needed to construct them — used purely
// to prove the rig's STRUCTURE and WIRING. The actual attachment math is
// already covered by rigGeometry.test.ts with realistic numbers; giving
// headIdle/headSad genuinely different textures here (rather than the same
// one twice) is what makes the expression-swap test below meaningful.
function fakeTextures(bodyBase: Texture = Texture.WHITE): AvatarTextures {
  return {
    headIdle: Texture.WHITE,
    headSad: Texture.EMPTY,
    bodyBase,
    arm: Texture.WHITE,
    leg: Texture.WHITE,
    // Deliberately distinct real Texture instances (not e.g. reusing
    // Texture.WHITE for both) — same reasoning as headIdle/headSad above:
    // makes the setPose body-swap tests below meaningful by construction,
    // not by coincidence.
    bodySitting: new Texture({ source: new TextureSource({ width: 10, height: 10 }) }),
    bodyLying: new Texture({ source: new TextureSource({ width: 10, height: 10 }) }),
  }
}

/** A real Texture with a controlled, non-default size — no renderer/GPU
 * needed to construct one, just like Texture.WHITE. Used to reproduce the
 * exact production bug this rig had to be fixed for: male and female body
 * art aren't cropped to matching canvas sizes. */
function sizedTexture(width: number, height: number): Texture {
  return new Texture({ source: new TextureSource({ width, height }) })
}

function findByLabel(rig: AvatarRig, label: string): Sprite {
  const found = rig.container.children.find((child) => child.label === label)
  if (!found) throw new Error(`No child labeled "${label}" — rig assembly is missing a piece`)
  return found as Sprite
}

describe('AvatarRig', () => {
  it('assembles exactly six children in the fixed back-to-front order', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const labels = rig.container.children.map((child) => child.label)
    expect(labels).toEqual(['left-leg', 'right-leg', 'body', 'left-arm', 'right-arm', 'head'])
  })

  it('mirrors arms and legs on opposite sides, per their opposite measured bulge directions', () => {
    // Arms: right stays unmirrored (the authored orientation), left gets
    // the flip. Legs: the opposite — left stays unmirrored, right gets the
    // flip. See rigGeometry.ts for the measured-art reasoning. Female has
    // no leg art asymmetry, so she uses this general default as-is.
    const rig = new AvatarRig(FEMALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    expect(findByLabel(rig, 'right-arm').scale.x).toBe(1)
    expect(findByLabel(rig, 'left-arm').scale.x).toBe(-1)
    expect(findByLabel(rig, 'left-leg').scale.x).toBe(1)
    expect(findByLabel(rig, 'right-leg').scale.x).toBe(-1)
  })

  it("inverts the male's leg mirroring for his leg art's one-sided cargo pocket", () => {
    // male_leg's cargo pocket is only drawn on the raw texture's own right
    // side; MALE_AVATAR_CONFIG sets legMirrorInverted so the pocket lands
    // on each leg's OUTER thigh instead of the general default's inner
    // thigh. Arms are unaffected — the override is leg-specific.
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    expect(findByLabel(rig, 'left-leg').scale.x).toBe(-1)
    expect(findByLabel(rig, 'right-leg').scale.x).toBe(1)
    expect(findByLabel(rig, 'right-arm').scale.x).toBe(1)
    expect(findByLabel(rig, 'left-arm').scale.x).toBe(-1)
  })

  it('applies baseScale * relativeScale to the whole assembled rig', () => {
    const maleRig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const femaleRig = new AvatarRig(FEMALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    expect(maleRig.container.scale.x).toBeCloseTo(FAKE_BASE_SCALE * MALE_AVATAR_CONFIG.relativeScale)
    expect(femaleRig.container.scale.x).toBeCloseTo(FAKE_BASE_SCALE * FEMALE_AVATAR_CONFIG.relativeScale)
    expect(maleRig.container.scale.x).toBeGreaterThan(femaleRig.container.scale.x)
  })

  it('preserves the relativeScale ratio even when the two characters’ body textures are different sizes', () => {
    // This is the exact production bug this constructor contract exists to
    // prevent: if baseScale were derived separately from each character's
    // OWN body texture (rather than passed in as one shared value), a
    // taller/narrower male texture and a shorter/wider female texture
    // would each get independently normalized to the same target height —
    // silently cancelling out MALE_RELATIVE_SCALE instead of applying it.
    const sharedBaseScale = 0.05
    const maleRig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(sizedTexture(3435, 4122)), sharedBaseScale)
    const femaleRig = new AvatarRig(FEMALE_AVATAR_CONFIG, fakeTextures(sizedTexture(3834, 3690)), sharedBaseScale)

    const ratio = maleRig.container.scale.x / femaleRig.container.scale.x
    expect(ratio).toBeCloseTo(MALE_AVATAR_CONFIG.relativeScale / FEMALE_AVATAR_CONFIG.relativeScale, 5)
  })

  it('swaps the head texture on setExpression without moving, resizing, or re-anchoring it', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const head = findByLabel(rig, 'head')
    expect(head.texture).toBe(Texture.WHITE)
    const positionBefore = { x: head.position.x, y: head.position.y }
    const anchorBefore = { x: head.anchor.x, y: head.anchor.y }

    rig.setExpression('sad')
    expect(head.texture).toBe(Texture.EMPTY)
    expect(head.position.x).toBe(positionBefore.x)
    expect(head.position.y).toBe(positionBefore.y)
    expect(head.anchor.x).toBe(anchorBefore.x)
    expect(head.anchor.y).toBe(anchorBefore.y)

    rig.setExpression('idle')
    expect(head.texture).toBe(Texture.WHITE)
  })

  it('rotates only the named limbs, leaving others untouched, around their own pivot', () => {
    // MALE_AVATAR_CONFIG carries a static legStanceRotation, so the legs'
    // untouched baseline here is that constant, not 0 — an arm-only call
    // must leave it exactly as constructed.
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const legStanceRotation = MALE_AVATAR_CONFIG.legStanceRotation ?? 0
    rig.setLimbAngles({ leftArm: 0.2, rightArm: -0.2 })

    expect(findByLabel(rig, 'left-arm').rotation).toBeCloseTo(0.2)
    expect(findByLabel(rig, 'right-arm').rotation).toBeCloseTo(-0.2)
    expect(findByLabel(rig, 'left-leg').rotation).toBeCloseTo(legStanceRotation)
    expect(findByLabel(rig, 'right-leg').rotation).toBeCloseTo(-legStanceRotation)

    rig.setLimbAngles({ leftLeg: 0.1 })
    expect(findByLabel(rig, 'left-leg').rotation).toBeCloseTo(0.1)
    // Previously-set arm angles aren't reset by an unrelated call.
    expect(findByLabel(rig, 'left-arm').rotation).toBeCloseTo(0.2)
  })

  it('applies legStanceRotation to both legs in opposing directions as their static rest pose', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    const legStanceRotation = MALE_AVATAR_CONFIG.legStanceRotation
    expect(legStanceRotation).toBeTruthy()
    expect(findByLabel(rig, 'left-leg').rotation).toBeCloseTo(legStanceRotation as number)
    expect(findByLabel(rig, 'right-leg').rotation).toBeCloseTo(-(legStanceRotation as number))
  })

  it('leaves legs at zero rotation when a config omits legStanceRotation', () => {
    // Female has no stance-rotation override — confirms the field is
    // opt-in, not a universal default that would need undoing per config.
    const rig = new AvatarRig(FEMALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    expect(findByLabel(rig, 'left-leg').rotation).toBe(0)
    expect(findByLabel(rig, 'right-leg').rotation).toBe(0)
  })

  it('destroys the whole container, including its children, without throwing', () => {
    const rig = new AvatarRig(MALE_AVATAR_CONFIG, fakeTextures(), FAKE_BASE_SCALE)
    expect(() => rig.destroy()).not.toThrow()
  })

  describe('setPose', () => {
    it('starts standing, with every limb visible and the standing body texture showing', () => {
      const textures = fakeTextures()
      const rig = new AvatarRig(MALE_AVATAR_CONFIG, textures, FAKE_BASE_SCALE)
      expect(rig.getPose()).toBe('standing')
      expect(findByLabel(rig, 'body').texture).toBe(textures.bodyBase)
      for (const label of ['left-arm', 'right-arm', 'left-leg', 'right-leg']) {
        expect(findByLabel(rig, label).visible).toBe(true)
      }
      expect(findByLabel(rig, 'head').visible).toBe(true)
    })

    it('sitting swaps to the whole seated illustration, hides every limb, and keeps the head visible', () => {
      const textures = fakeTextures()
      const rig = new AvatarRig(MALE_AVATAR_CONFIG, textures, FAKE_BASE_SCALE)

      rig.setPose('sitting')

      expect(rig.getPose()).toBe('sitting')
      expect(findByLabel(rig, 'body').texture).toBe(textures.bodySitting)
      for (const label of ['left-arm', 'right-arm', 'left-leg', 'right-leg']) {
        expect(findByLabel(rig, label).visible).toBe(false)
      }
      expect(findByLabel(rig, 'head').visible).toBe(true)
    })

    it("re-attaches the head at the sitting body's OWN neck point, not the standing one", () => {
      // male_body_sitting isn't cropped to the same canvas as
      // male_body_base — a real production fact this test reproduces with
      // two differently-sized fake textures, so a stale (pre-swap)
      // attachment fraction would visibly disagree with the correct one.
      const textures = fakeTextures(new Texture({ source: new TextureSource({ width: 300, height: 400 }) }))
      textures.bodySitting = new Texture({ source: new TextureSource({ width: 500, height: 200 }) })
      const rig = new AvatarRig(MALE_AVATAR_CONFIG, textures, FAKE_BASE_SCALE)
      const headBefore = findByLabel(rig, 'head').position
      const standingHeadPosition = { x: headBefore.x, y: headBefore.y }

      rig.setPose('sitting')

      const sittingHeadPosition = findByLabel(rig, 'head').position
      expect(sittingHeadPosition.x).not.toBeCloseTo(standingHeadPosition.x)
      expect(sittingHeadPosition.y).not.toBeCloseTo(standingHeadPosition.y)
    })

    it('lying swaps to the whole reclining illustration, hides every limb, and hides the head', () => {
      const textures = fakeTextures()
      const rig = new AvatarRig(MALE_AVATAR_CONFIG, textures, FAKE_BASE_SCALE)

      rig.setPose('lying')

      expect(rig.getPose()).toBe('lying')
      expect(findByLabel(rig, 'body').texture).toBe(textures.bodyLying)
      for (const label of ['left-arm', 'right-arm', 'left-leg', 'right-leg']) {
        expect(findByLabel(rig, label).visible).toBe(false)
      }
      expect(findByLabel(rig, 'head').visible).toBe(false)
    })

    it('returning to standing restores the standing body texture, limb visibility, and neck attachment', () => {
      const textures = fakeTextures()
      const rig = new AvatarRig(MALE_AVATAR_CONFIG, textures, FAKE_BASE_SCALE)
      const headBefore = findByLabel(rig, 'head').position
      const standingHeadPosition = { x: headBefore.x, y: headBefore.y }

      rig.setPose('lying')
      rig.setPose('standing')

      expect(rig.getPose()).toBe('standing')
      expect(findByLabel(rig, 'body').texture).toBe(textures.bodyBase)
      expect(findByLabel(rig, 'head').visible).toBe(true)
      expect(findByLabel(rig, 'head').position.x).toBeCloseTo(standingHeadPosition.x)
      expect(findByLabel(rig, 'head').position.y).toBeCloseTo(standingHeadPosition.y)
      for (const label of ['left-arm', 'right-arm', 'left-leg', 'right-leg']) {
        expect(findByLabel(rig, label).visible).toBe(true)
      }
    })

    it('re-entering the current pose is a no-op', () => {
      const textures = fakeTextures()
      const rig = new AvatarRig(MALE_AVATAR_CONFIG, textures, FAKE_BASE_SCALE)
      rig.setPose('sitting')
      const headBefore = findByLabel(rig, 'head').position
      const positionBefore = { x: headBefore.x, y: headBefore.y }

      rig.setPose('sitting')

      expect(rig.getPose()).toBe('sitting')
      expect(findByLabel(rig, 'head').position.x).toBeCloseTo(positionBefore.x)
      expect(findByLabel(rig, 'head').position.y).toBeCloseTo(positionBefore.y)
    })
  })
})
