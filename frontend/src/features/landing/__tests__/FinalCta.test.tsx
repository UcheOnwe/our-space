import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FinalCta } from '../FinalCta'

describe('FinalCta', () => {
  it('calls onGetStarted and onLogin from their respective buttons', async () => {
    const onLogin = vi.fn()
    const onGetStarted = vi.fn()
    const user = userEvent.setup()
    render(<FinalCta onLogin={onLogin} onGetStarted={onGetStarted} />)

    await user.click(screen.getByRole('button', { name: 'Enter Our Space' }))
    expect(onGetStarted).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(onLogin).toHaveBeenCalledTimes(1)
  })
})
