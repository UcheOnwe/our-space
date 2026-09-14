import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CompanionSetupScreen } from '../CompanionSetupScreen'

describe('CompanionSetupScreen', () => {
  it('renders the companion introduction/hero copy', () => {
    render(<CompanionSetupScreen />)

    expect(screen.getByRole('heading', { name: 'Our Space Companion' })).toBeInTheDocument()
    expect(
      screen.getByText('Our Space Companion brings your shared space onto supported websites.'),
    ).toBeInTheDocument()
  })

  it('communicates that only YouTube is supported for this POC', () => {
    render(<CompanionSetupScreen />)
    expect(screen.getByText(/only/i).textContent).toMatch(/YouTube/)
  })

  it('communicates the desktop-only limitation', () => {
    render(<CompanionSetupScreen />)
    expect(screen.getByRole('heading', { name: 'Desktop required' })).toBeInTheDocument()
    expect(screen.getByText(/aren't available on mobile browsers/i)).toBeInTheDocument()
  })

  it('provides development installation instructions, clearly labeled as such', () => {
    render(<CompanionSetupScreen />)

    expect(screen.getByText('Development / Beta')).toBeInTheDocument()
    expect(screen.getByText('chrome://extensions')).toBeInTheDocument()
    expect(screen.getByText(/Load unpacked/)).toBeInTheDocument()
  })

  it('leaves a future-safe, clearly disabled slot for the eventual Chrome Web Store button', () => {
    render(<CompanionSetupScreen />)

    const storeButton = screen.getByRole('button', { name: /Chrome Web Store/ })
    expect(storeButton).toBeDisabled()
  })

  describe('Open YouTube action', () => {
    beforeEach(() => {
      vi.stubGlobal('open', vi.fn())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('opens YouTube in a new tab when clicked', async () => {
      const user = userEvent.setup()
      render(<CompanionSetupScreen />)

      await user.click(screen.getByRole('button', { name: 'Open YouTube' }))

      expect(window.open).toHaveBeenCalledWith('https://www.youtube.com', '_blank', 'noopener,noreferrer')
    })
  })

  describe('copyable chrome://extensions URL', () => {
    it('copies the URL to the clipboard when "Copy" is clicked', async () => {
      // `userEvent.setup()` installs its OWN clipboard stub as part of
      // setup — defining ours first would just get overwritten, so this
      // has to run after `setup()`, not before it. jsdom also has no real
      // `navigator.clipboard` at all, and the property is otherwise
      // get-only, hence `defineProperty` rather than a plain assignment.
      const user = userEvent.setup()
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      })

      render(<CompanionSetupScreen />)
      await user.click(screen.getByRole('button', { name: 'Copy' }))

      expect(writeText).toHaveBeenCalledWith('chrome://extensions')
      expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument()
    })
  })
})
