import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CompanionShowcase } from '../CompanionShowcase'

describe('CompanionShowcase', () => {
  it('shows all 5 real registry Companions by name, Cosmic Blob included as the primary one', () => {
    render(<CompanionShowcase />)
    expect(screen.getByText('Cosmic Blob')).toBeInTheDocument()
    expect(screen.getByText('Cosmic Flyer')).toBeInTheDocument()
    expect(screen.getByText('Mini UFO')).toBeInTheDocument()
    expect(screen.getByText('Star Wisp')).toBeInTheDocument()
    expect(screen.getByText('Nova Guardian')).toBeInTheDocument()
  })
})
