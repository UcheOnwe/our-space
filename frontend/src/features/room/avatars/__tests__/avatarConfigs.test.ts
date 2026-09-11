import { describe, expect, it } from 'vitest'
import { AVATAR_CONFIGS, FEMALE_RELATIVE_SCALE, MALE_RELATIVE_SCALE } from '../avatarConfigs'

describe('relative scale rule', () => {
  it('locks the male:female height ratio to the approved ~1.15', () => {
    expect(MALE_RELATIVE_SCALE / FEMALE_RELATIVE_SCALE).toBeCloseTo(1.15, 2)
  })

  it('keeps the female scale at the 1.0 baseline', () => {
    expect(FEMALE_RELATIVE_SCALE).toBe(1)
  })

  it('makes the male visibly larger than the female', () => {
    expect(MALE_RELATIVE_SCALE).toBeGreaterThan(FEMALE_RELATIVE_SCALE)
  })
})

describe('AVATAR_CONFIGS completeness', () => {
  const requiredTextureKeys = ['headIdle', 'headSad', 'bodyBase', 'arm', 'leg', 'bodySitting', 'bodyLying'] as const
  const requiredAttachmentKeys = [
    'neck',
    'shoulderLeft',
    'shoulderRight',
    'hipLeft',
    'hipRight',
    'sittingNeck',
  ] as const
  const requiredPivotKeys = ['arm', 'leg', 'head'] as const

  for (const gender of ['male', 'female'] as const) {
    describe(gender, () => {
      const config = AVATAR_CONFIGS[gender]

      it('declares every required texture path, scoped to this character', () => {
        for (const key of requiredTextureKeys) {
          expect(config.textures[key]).toBeTruthy()
          expect(config.textures[key]).toContain(`${gender}_`)
        }
      })

      it('declares every required attachment point within the normalized 0-1 range', () => {
        for (const key of requiredAttachmentKeys) {
          const point = config.attachments[key]
          expect(point.x).toBeGreaterThanOrEqual(0)
          expect(point.x).toBeLessThanOrEqual(1)
          expect(point.y).toBeGreaterThanOrEqual(0)
          expect(point.y).toBeLessThanOrEqual(1)
        }
      })

      it('declares every required pivot point within the normalized 0-1 range', () => {
        for (const key of requiredPivotKeys) {
          const point = config.pivots[key]
          expect(point.x).toBeGreaterThanOrEqual(0)
          expect(point.x).toBeLessThanOrEqual(1)
          expect(point.y).toBeGreaterThanOrEqual(0)
          expect(point.y).toBeLessThanOrEqual(1)
        }
      })

      it('has a positive relative scale', () => {
        expect(config.relativeScale).toBeGreaterThan(0)
      })
    })
  }

  it('places left attachments to the left of right attachments (shoulders and hips)', () => {
    for (const gender of ['male', 'female'] as const) {
      const { shoulderLeft, shoulderRight, hipLeft, hipRight } = AVATAR_CONFIGS[gender].attachments
      expect(shoulderLeft.x).toBeLessThan(shoulderRight.x)
      expect(hipLeft.x).toBeLessThan(hipRight.x)
    }
  })
})
