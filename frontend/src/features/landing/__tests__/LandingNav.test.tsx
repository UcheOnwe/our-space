import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LandingNav } from '../LandingNav'

describe('LandingNav', () => {
  it('renders the Our Space brand and calls the right callback for each primary action', async () => {
    const onLogin = vi.fn()
    const onGetStarted = vi.fn()
    const user = userEvent.setup()
    render(<LandingNav onLogin={onLogin} onGetStarted={onGetStarted} />)

    expect(screen.getByText('Our Space')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(onLogin).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Enter Our Space' }))
    expect(onGetStarted).toHaveBeenCalledTimes(1)
  })

  it('never links to GitHub, LinkedIn, or a repository — this is a product landing page, not a portfolio', () => {
    const { container } = render(<LandingNav onLogin={vi.fn()} onGetStarted={vi.fn()} />)
    const links = Array.from(container.querySelectorAll('a'))
    expect(links.some((a) => /github|linkedin/i.test(a.href))).toBe(false)
  })

  it('the mobile hamburger reveals a "Log in" action', async () => {
    const onLogin = vi.fn()
    const user = userEvent.setup()
    render(<LandingNav onLogin={onLogin} onGetStarted={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const loginButtons = screen.getAllByRole('button', { name: 'Log in' })
    await user.click(loginButtons[loginButtons.length - 1])
    expect(onLogin).toHaveBeenCalledTimes(1)
  })
})
