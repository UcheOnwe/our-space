import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Hero } from '../Hero'

describe('Hero', () => {
  it('renders the headline and calls onGetStarted from the primary CTA', async () => {
    const onGetStarted = vi.fn()
    const user = userEvent.setup()
    render(<Hero onGetStarted={onGetStarted} />)

    expect(screen.getByRole('heading', { name: /your space.*together, anywhere/is })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enter Our Space' }))
    expect(onGetStarted).toHaveBeenCalledTimes(1)
  })

  it('renders the default Companion (Cosmic Blob) as the hero mascot', () => {
    const { container } = render(<Hero onGetStarted={vi.fn()} />)
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
  })
})
