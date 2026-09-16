import { describe, expect, it } from 'vitest'
import {
  COLOR_VARIANTS,
  COMPANION_TYPES,
  DEFAULT_COMPANION_TYPE,
  getCompanionDefinition,
  isColorAllowedForCompanion,
} from '../registry'
import type { CompanionTypeId } from '../types'

const EXPECTED_TYPE_IDS: CompanionTypeId[] = ['cosmic_blob', 'cosmic_flyer', 'mini_ufo', 'star_wisp', 'nova_guardian']

describe('COMPANION_TYPES', () => {
  it('contains exactly the five approved Companion types (four originals + Nova Guardian)', () => {
    expect(Object.keys(COMPANION_TYPES).sort()).toEqual([...EXPECTED_TYPE_IDS].sort())
  })

  it.each(EXPECTED_TYPE_IDS)('%s has every required field, a non-empty color list, and a valid default color', (id) => {
    const definition = COMPANION_TYPES[id]

    expect(definition.id).toBe(id)
    expect(definition.displayName.length).toBeGreaterThan(0)
    expect(definition.description.length).toBeGreaterThan(0)
    expect(definition.allowedColors.length).toBeGreaterThan(0)
    expect(definition.allowedColors).toContain(definition.defaultColor)
    expect(typeof definition.buildSvgMarkup).toBe('function')
  })

  it.each(EXPECTED_TYPE_IDS)('%s renders real SVG markup for its default color', (id) => {
    const definition = COMPANION_TYPES[id]
    const hex = COLOR_VARIANTS[definition.defaultColor].hex

    const markup = definition.buildSvgMarkup(definition.defaultColor, hex)

    expect(markup).toContain('<svg')
  })

  it('Cosmic Blob keeps "Cosmic Blob" as its display name (Nova Guardian is a separate, additional Companion, not a replacement)', () => {
    expect(COMPANION_TYPES.cosmic_blob.displayName).toBe('Cosmic Blob')
  })

  it('Cosmic Flyer still exists and is unchanged in kind (not removed/replaced by Nova Guardian)', () => {
    expect(COMPANION_TYPES.cosmic_flyer.displayName).toBe('Cosmic Flyer')
  })

  it('does not give every Companion the exact same color list — per-Companion availability, not one universal palette', () => {
    const colorLists = EXPECTED_TYPE_IDS.map((id) => COMPANION_TYPES[id].allowedColors.slice().sort().join(','))
    expect(new Set(colorLists).size).toBeGreaterThan(1)
  })

  it('every allowedColors entry refers to a real COLOR_VARIANTS id', () => {
    for (const id of EXPECTED_TYPE_IDS) {
      for (const colorId of COMPANION_TYPES[id].allowedColors) {
        expect(COLOR_VARIANTS[colorId]).toBeDefined()
      }
    }
  })

  it('now curates more than three colors for at least one Companion (expanded beyond the original small set)', () => {
    expect(EXPECTED_TYPE_IDS.some((id) => COMPANION_TYPES[id].allowedColors.length > 3)).toBe(true)
  })
})

describe('Cosmic Blob "Default" style', () => {
  it('has "default" as its own defaultColor, and "default" is one of its allowed colors', () => {
    const blob = COMPANION_TYPES.cosmic_blob
    expect(blob.defaultColor).toBe('default')
    expect(blob.allowedColors).toContain('default')
  })

  it('renders its ORIGINAL two-tone gradient treatment for "default", not a flat single-color fill', () => {
    const markup = COMPANION_TYPES.cosmic_blob.buildSvgMarkup('default', COLOR_VARIANTS.default.hex)

    expect(markup).toContain('linearGradient')
    expect(markup).toContain('url(#our-space-companion-gradient)')
  })

  it('still renders a flat recolor for an explicit non-default color, with no gradient', () => {
    const markup = COMPANION_TYPES.cosmic_blob.buildSvgMarkup('olive', COLOR_VARIANTS.olive.hex)

    expect(markup).not.toContain('linearGradient')
    expect(markup).toContain(COLOR_VARIANTS.olive.hex)
  })

  it('carries the blink-capable eye class on both eyes regardless of style, so the "living" identity survives a recolor', () => {
    const defaultMarkup = COMPANION_TYPES.cosmic_blob.buildSvgMarkup('default', COLOR_VARIANTS.default.hex)
    const recoloredMarkup = COMPANION_TYPES.cosmic_blob.buildSvgMarkup('blush', COLOR_VARIANTS.blush.hex)

    expect((defaultMarkup.match(/our-space-companion-eye/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect((recoloredMarkup.match(/our-space-companion-eye/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('can return to "default" as a real, still-allowed choice (not removed by adding other colors)', () => {
    expect(isColorAllowedForCompanion('cosmic_blob', 'default')).toBe(true)
    expect(isColorAllowedForCompanion('cosmic_blob', 'olive')).toBe(true)
  })
})

describe('Nova Guardian', () => {
  const guardian = COMPANION_TYPES.nova_guardian

  it('defines computeDirectionalPose, unlike the other four Companions', () => {
    expect(typeof guardian.computeDirectionalPose).toBe('function')
    for (const id of EXPECTED_TYPE_IDS.filter((id) => id !== 'nova_guardian')) {
      expect(COMPANION_TYPES[id].computeDirectionalPose).toBeUndefined()
    }
  })

  it('computeDirectionalPose returns a full semantic pose (see novaGuardianPose.ts) for a real direction', () => {
    const pose = guardian.computeDirectionalPose?.({ x: 1, y: 0 })
    expect(pose).toBeDefined()
    expect(pose?.isFlying).toBe(true)
    expect(pose?.poseMode).toBe('side')
    expect(pose?.trailDirection).toEqual({ x: -1, y: 0 })
  })

  it('its rendered markup carries the nested hierarchy setDirectionalPose relies on: mirror > bank > body > lead/trail arm', () => {
    const markup = guardian.buildSvgMarkup(guardian.defaultColor, COLOR_VARIANTS[guardian.defaultColor].hex)

    for (const className of [
      'nova-guardian-mirror',
      'nova-guardian-bank',
      'nova-guardian-body',
      'nova-guardian-lead-arm',
      'nova-guardian-trail-arm',
      'nova-guardian-legs',
    ]) {
      expect(markup).toContain(className)
    }

    // Nesting order matters: mirror wraps bank wraps body wraps the arms
    // — a plain substring check can't verify nesting, so assert the
    // MIRROR class appears before the BODY class in source order (a
    // necessary, if not sufficient, condition for "mirror is an
    // ancestor of body" given how this markup is generated).
    expect(markup.indexOf('nova-guardian-mirror')).toBeLessThan(markup.indexOf('nova-guardian-body'))
    expect(markup.indexOf('nova-guardian-bank')).toBeLessThan(markup.indexOf('nova-guardian-body'))
  })

  it('the cape and wake are NOT nested inside the mirror/bank group — they orient independently from trailDirection', () => {
    const markup = guardian.buildSvgMarkup(guardian.defaultColor, COLOR_VARIANTS[guardian.defaultColor].hex)

    expect(markup.indexOf('nova-guardian-cape')).toBeLessThan(markup.indexOf('nova-guardian-mirror'))
    expect(markup.indexOf('nova-guardian-wake')).toBeLessThan(markup.indexOf('nova-guardian-mirror'))
  })

  it('reuses the shared blink-capable eye class (same one Cosmic Blob uses), not a Guardian-only class', () => {
    const markup = guardian.buildSvgMarkup(guardian.defaultColor, COLOR_VARIANTS[guardian.defaultColor].hex)
    expect((markup.match(/our-space-companion-eye/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('includes a chest crystal and speed-streak elements in its markup', () => {
    const markup = guardian.buildSvgMarkup(guardian.defaultColor, COLOR_VARIANTS[guardian.defaultColor].hex)
    expect(markup).toContain('nova-guardian-crystal')
    expect(markup).toContain('nova-guardian-speed-streak')
  })
})

describe('isColorAllowedForCompanion', () => {
  it('is true for a color actually curated for that Companion', () => {
    expect(isColorAllowedForCompanion('mini_ufo', 'silver')).toBe(true)
  })

  it('is false for a color curated for a DIFFERENT Companion only', () => {
    // "midnight" is not curated for cosmic_blob.
    expect(isColorAllowedForCompanion('cosmic_blob', 'midnight')).toBe(false)
  })

  it('is false for a Nova-Guardian-only color on a different Companion', () => {
    expect(isColorAllowedForCompanion('star_wisp', 'midnight')).toBe(false)
    expect(isColorAllowedForCompanion('nova_guardian', 'midnight')).toBe(true)
  })
})

describe('getCompanionDefinition / DEFAULT_COMPANION_TYPE', () => {
  it('DEFAULT_COMPANION_TYPE resolves to a real, valid registry entry, and is still Cosmic Blob', () => {
    const definition = getCompanionDefinition(DEFAULT_COMPANION_TYPE)
    expect(definition.id).toBe(DEFAULT_COMPANION_TYPE)
    expect(definition.id).toBe('cosmic_blob')
  })
})

describe('COLOR_VARIANTS', () => {
  it('every entry has a real hex value and matching id/label', () => {
    for (const [id, definition] of Object.entries(COLOR_VARIANTS)) {
      expect(definition.id).toBe(id)
      expect(definition.label.length).toBeGreaterThan(0)
      expect(definition.hex).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('includes a "default" entry', () => {
    expect(COLOR_VARIANTS.default).toBeDefined()
  })
})
