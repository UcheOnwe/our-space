import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../features/auth/AuthContext'
import { CompanionProfilePage } from '../CompanionProfilePage'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.endsWith('/api/auth/csrf/')) return Promise.resolve(jsonResponse(200, { detail: 'ok' }))
      if (url.endsWith('/api/auth/user-profile/')) {
        return Promise.resolve(jsonResponse(200, { id: 1, username: 'alice', email: '' }))
      }
      if (url.endsWith('/api/companions/profile/')) {
        return Promise.resolve(
          jsonResponse(200, { companion_type: 'cosmic_blob', color_variant: 'olive', updated_at: '2026-01-01T00:00:00Z' }),
        )
      }
      throw new Error(`Unexpected fetch to ${url}`)
    }),
  )
})

describe('CompanionProfilePage', () => {
  it('renders the page title, current-user identity, and the profile screen', async () => {
    render(
      <AuthProvider>
        <CompanionProfilePage onBack={vi.fn()} onOpenCompanionSetup={vi.fn()} />
      </AuthProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Companion Profile', level: 1 })).toBeInTheDocument()
    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Cosmic Blob/ })).toBeInTheDocument()
  })

  it('calls onBack (labeled "Couples Room") when the back button is clicked', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(
      <AuthProvider>
        <CompanionProfilePage onBack={onBack} onOpenCompanionSetup={vi.fn()} />
      </AuthProvider>,
    )

    await user.click(screen.getByRole('button', { name: '← Couples Room' }))

    expect(onBack).toHaveBeenCalledOnce()
  })

  it('calls onOpenCompanionSetup when "Space Companion" is clicked', async () => {
    const onOpenCompanionSetup = vi.fn()
    const user = userEvent.setup()
    render(
      <AuthProvider>
        <CompanionProfilePage onBack={vi.fn()} onOpenCompanionSetup={onOpenCompanionSetup} />
      </AuthProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Space Companion' }))

    expect(onOpenCompanionSetup).toHaveBeenCalledOnce()
  })

  describe('Open YouTube action', () => {
    beforeEach(() => {
      vi.stubGlobal('open', vi.fn())
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('opens YouTube in a new tab', async () => {
      const user = userEvent.setup()
      render(
        <AuthProvider>
          <CompanionProfilePage onBack={vi.fn()} onOpenCompanionSetup={vi.fn()} />
        </AuthProvider>,
      )

      await user.click(screen.getByRole('button', { name: 'Open YouTube' }))

      expect(window.open).toHaveBeenCalledWith('https://www.youtube.com', '_blank', 'noopener,noreferrer')
    })
  })
})
