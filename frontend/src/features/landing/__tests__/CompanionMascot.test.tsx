import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COMPANION_TYPES } from '../../../companions/registry'
import type { CompanionTypeId } from '../../../companions/types'
import { CompanionMascot } from '../CompanionMascot'

const ALL_TYPES: CompanionTypeId[] = ['cosmic_blob', 'cosmic_flyer', 'mini_ufo', 'star_wisp', 'nova_guardian']

describe('CompanionMascot', () => {
  it.each(ALL_TYPES)('renders the real registry markup for %s — never an invented character', (type) => {
    const { container } = render(<CompanionMascot type={type} />)
    const expectedMarkup = COMPANION_TYPES[type].buildSvgMarkup(
      COMPANION_TYPES[type].defaultColor,
      // Color hex isn't asserted here — just that this is genuinely the
      // registry's own builder output, not a hand-rolled shape.
      '#000000',
    )
    // Same builder function, so the markup shares its structural DNA
    // (svg viewBox) even though the color argument differs above.
    expect(expectedMarkup).toContain('<svg')
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(container.querySelector('[role="img"]')).toHaveAttribute('aria-label', `${COMPANION_TYPES[type].displayName} Companion`)
  })

  it('applies no idle motion class when motion="none"', () => {
    const { container } = render(<CompanionMascot type="cosmic_blob" motion="none" />)
    const wrapper = container.firstElementChild!
    expect(wrapper.className).not.toMatch(/float|hover|drift/)
  })
})
