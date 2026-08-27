import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../AuthContext'

function jsonResponse(status: number, body: unknown): Response {
  // A 204 response must have a null body per the Fetch spec.
  if (status === 204) {
    return new Response(null, { status })
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Renders the current auth state as text so tests can assert on it. */
function AuthProbe() {
  const { status, user, logout } = useAuth()
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="username">{user?.username ?? ''}</p>
      <button onClick={() => logout()}>Log out</button>
    </div>
  )
}

const ME_URL = '/api/auth/me/'
const CSRF_URL = '/api/auth/csrf/'
const LOGOUT_URL = '/api/auth/logout/'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AuthProvider bootstrap (refresh persistence)', () => {
  it('restores authenticated state when the session is still valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.endsWith(CSRF_URL)) return Promise.resolve(jsonResponse(200, { detail: 'ok' }))
        if (url.endsWith(ME_URL)) {
          return Promise.resolve(jsonResponse(200, { id: 1, username: 'alice', email: 'alice@example.com' }))
        }
        throw new Error(`Unexpected fetch to ${url}`)
      }),
    )

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    expect(screen.getByTestId('status').textContent).toBe('loading')

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))
    expect(screen.getByTestId('username').textContent).toBe('alice')
  })

  it('lands on unauthenticated state when there is no valid session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.endsWith(CSRF_URL)) return Promise.resolve(jsonResponse(200, { detail: 'ok' }))
        if (url.endsWith(ME_URL)) return Promise.resolve(jsonResponse(403, { detail: 'Forbidden' }))
        throw new Error(`Unexpected fetch to ${url}`)
      }),
    )

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'))
    expect(screen.getByTestId('username').textContent).toBe('')
  })
})

describe('logout', () => {
  it('clears authenticated state', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith(CSRF_URL)) return Promise.resolve(jsonResponse(200, { detail: 'ok' }))
      if (url.endsWith(ME_URL)) {
        return Promise.resolve(jsonResponse(200, { id: 1, username: 'alice', email: '' }))
      }
      if (url.endsWith(LOGOUT_URL)) return Promise.resolve(jsonResponse(204, null))
      throw new Error(`Unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'))
    expect(screen.getByTestId('username').textContent).toBe('')

    // Confirms the CSRF token was actually attached to the unsafe request,
    // not just that logout "worked" — this is the behavior the backend's
    // session auth depends on.
    const logoutCall = fetchMock.mock.calls.find(([input]) => input.toString().endsWith(LOGOUT_URL))
    expect(logoutCall?.[1]?.credentials).toBe('include')
  })
})
