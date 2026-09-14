import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CompanionSetupPage } from '../CompanionSetupPage'

describe('CompanionSetupPage', () => {
  it('renders the page title and the setup content', () => {
    render(<CompanionSetupPage onBack={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Space Companion', level: 1 })).toBeInTheDocument()
    // The richer screen content (hero/install steps/etc.) is this page's
    // body — confirming just one piece of it here is enough to prove the
    // wiring; CompanionSetupScreen's own tests cover its content in depth.
    expect(screen.getByRole('button', { name: 'Open YouTube' })).toBeInTheDocument()
  })

  it('calls onBack when the back button is clicked', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(<CompanionSetupPage onBack={onBack} />)

    await user.click(screen.getByRole('button', { name: '← Our Space' }))

    expect(onBack).toHaveBeenCalledOnce()
  })
})
