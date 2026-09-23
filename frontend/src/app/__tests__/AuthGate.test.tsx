import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../features/auth/AuthContext'
import { AuthGate } from '../AuthGate'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubFetchAsSignedOut() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.endsWith('/api/auth/csrf/')) return Promise.resolve(jsonResponse(200, { detail: 'ok' }))
      if (url.endsWith('/api/auth/user-profile/')) return Promise.resolve(jsonResponse(401, { detail: 'not authenticated' }))
      throw new Error(`Unexpected fetch to ${url}`)
    }),
  )
}

function stubFetchAsAuthenticated() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.endsWith('/api/auth/csrf/')) return Promise.resolve(jsonResponse(200, { detail: 'ok' }))
      if (url.endsWith('/api/auth/user-profile/')) {
        return Promise.resolve(jsonResponse(200, { id: 1, username: 'alice', email: '' }))
      }
      if (url.endsWith('/api/couples/couple-status/')) return Promise.resolve(jsonResponse(200, { status: 'none' }))
      throw new Error(`Unexpected fetch to ${url}`)
    }),
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  // The signed-out default view is now LandingPage, which portals its whole
  // subtree into `#landing-root` (see its own doc comment) — index.html
  // provides that node in the real app, so the test environment must too.
  const portalTarget = document.createElement('div')
  portalTarget.id = 'landing-root'
  document.body.appendChild(portalTarget)
})

afterEach(() => {
  document.getElementById('landing-root')?.remove()
})

describe('AuthGate — the landing page is the new default signed-out experience', () => {
  it('shows the landing page (not the login form) by default for a signed-out visitor', async () => {
    stubFetchAsSignedOut()
    render(
      <AuthProvider>
        <AuthGate />
      </AuthProvider>,
    )

    expect(await screen.findByRole('heading', { level: 1, name: /your space/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  })

  it('"Enter Our Space" on the landing page opens the existing Register flow — no new auth logic', async () => {
    stubFetchAsSignedOut()
    const user = userEvent.setup()
    render(
      <AuthProvider>
        <AuthGate />
      </AuthProvider>,
    )

    await screen.findByRole('heading', { level: 1, name: /your space/i })
    await user.click(screen.getAllByRole('button', { name: 'Enter Our Space' })[0])

    expect(await screen.findByRole('button', { name: 'Create account' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Back to Our Space/ })).toBeInTheDocument()
  })

  it('"Log in" on the landing page opens the existing Login flow, and "Back to Our Space" returns to the landing page', async () => {
    stubFetchAsSignedOut()
    const user = userEvent.setup()
    render(
      <AuthProvider>
        <AuthGate />
      </AuthProvider>,
    )

    await screen.findByRole('heading', { level: 1, name: /your space/i })
    await user.click(screen.getAllByRole('button', { name: 'Log in' })[0])

    expect(await screen.findByLabelText('Username')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Back to Our Space/ }))
    expect(await screen.findByRole('heading', { level: 1, name: /your space/i })).toBeInTheDocument()
  })

  it('an already-authenticated visitor never sees the landing page at all', async () => {
    stubFetchAsAuthenticated()
    render(
      <AuthProvider>
        <AuthGate />
      </AuthProvider>,
    )

    // Reaches the couple-pairing flow (real app content) directly —
    // never the landing page's own hero headline.
    await screen.findByText(/pair with your partner/i)
    expect(screen.queryByRole('heading', { level: 1, name: /your space/i })).not.toBeInTheDocument()
  })
})
