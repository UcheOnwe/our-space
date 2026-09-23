import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PersonalizeSection } from '../PersonalizeSection'

describe('PersonalizeSection', () => {
  it('frames the fridge/memory imagery as an example, never a promise of default customization', () => {
    render(<PersonalizeSection />)
    expect(screen.getByText(/an example of a personal touch/i)).toBeInTheDocument()
  })
})
