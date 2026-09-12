import { describe, expect, it } from 'vitest'
import { limbMirrorScaleX, normalizedToLocal, selectHeadTexture } from '../rigGeometry'

describe('normalizedToLocal', () => {
  it('converts a fraction into local coordinates relative to a bottom-center anchor', () => {
    const result = normalizedToLocal({ x: 0.32, y: 0.92 }, 200, 300, { x: 0.5, y: 1 })
    expect(result.x).toBeCloseTo((0.32 - 0.5) * 200)
    expect(result.y).toBeCloseTo((0.92 - 1) * 300)
  })

  it('returns the origin when the point matches the anchor exactly', () => {
    const result = normalizedToLocal({ x: 0.5, y: 1 }, 400, 500, { x: 0.5, y: 1 })
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
  })

  it('scales with the given width/height independently of each other', () => {
    const result = normalizedToLocal({ x: 1, y: 0 }, 100, 50, { x: 0, y: 0 })
    expect(result.x).toBe(100)
    expect(result.y).toBe(0)
  })
})

describe('limbMirrorScaleX', () => {
  // Arms and legs bulge in OPPOSITE directions in the source art (measured
  // from the actual production textures, not assumed), so they need
  // opposite mirroring conventions — see rigGeometry.ts for the full
  // measurement reasoning.
  describe('arms', () => {
    it('leaves the right arm (the authored orientation) unmirrored', () => {
      expect(limbMirrorScaleX('right', 'arm')).toBe(1)
    })

    it('mirrors the left arm', () => {
      expect(limbMirrorScaleX('left', 'arm')).toBe(-1)
    })
  })

  describe('legs', () => {
    it('leaves the left leg (the authored orientation) unmirrored by default', () => {
      expect(limbMirrorScaleX('left', 'leg')).toBe(1)
    })

    it('mirrors the right leg by default', () => {
      expect(limbMirrorScaleX('right', 'leg')).toBe(-1)
    })

    // The default above is a general geometric heuristic (bend direction),
    // not an anatomical fact — it has no way to know about a one-sided
    // design detail like male_leg's cargo pocket. `invert` lets a specific
    // character's config override it when the art demands it (see
    // AvatarRigConfig.legMirrorInverted).
    it('inverts the assignment when invert is true', () => {
      expect(limbMirrorScaleX('left', 'leg', true)).toBe(-1)
      expect(limbMirrorScaleX('right', 'leg', true)).toBe(1)
    })

    it('leaves arms unaffected by invert — the override is leg-specific', () => {
      expect(limbMirrorScaleX('right', 'arm', true)).toBe(1)
      expect(limbMirrorScaleX('left', 'arm', true)).toBe(-1)
    })
  })
})

describe('selectHeadTexture', () => {
  const textures = { headIdle: 'idle-texture', headSad: 'sad-texture' }

  it('selects the idle texture by default', () => {
    expect(selectHeadTexture(textures, 'idle')).toBe('idle-texture')
  })

  it('selects the sad texture when sad', () => {
    expect(selectHeadTexture(textures, 'sad')).toBe('sad-texture')
  })
})
