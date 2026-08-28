import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../../auth/AuthContext'
import { CoupleProvider, useCouple } from '../CoupleContext'
import { InviteCodeDisplay } from '../InviteCodeDisplay'

function jsonResponse(status: number, body: unknown): Response {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function Probe() {
  const { status: authStatus } = useAuth()
  const { status: coupleStatus } = useCouple()
  return (
    <div>
      <p data-testid="auth-status">{authStatus}</p>
      <p data-testid="couple-status">{coupleStatus}</p>
    </div>
  )
}

const CSRF_URL = '/api/auth/csrf/'
const USER_PROFILE_URL = '/api/auth/user-profile/'
const LOGOUT_URL = '/api/auth/logout/'
const STATUS_URL = '/api/couples/couple-status/'
const CANCEL_URL = '/api/couples/cancel-pending-pairing/'

beforeEach(() => {
  vi.restoreAllMocks()
})

/** Simulates both backends at once: starts authenticated + waiting for a partner. */
function mockBackend() {
  let cancelled = false
  let loggedOut = false
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url.endsWith(CSRF_URL)) return Promise.resolve(jsonResponse(200, { detail: 'ok' }))

    if (url.endsWith(USER_PROFILE_URL)) {
      return loggedOut
        ? Promise.resolve(jsonResponse(403, { detail: 'Forbidden' }))
        : Promise.resolve(jsonResponse(200, { id: 1, username: 'alice', email: '' }))
    }

    if (url.endsWith(STATUS_URL)) {
      return cancelled
        ? Promise.resolve(jsonResponse(200, { status: 'none' }))
        : Promise.resolve(
            jsonResponse(200, {
              status: 'waiting',
              couple: { id: 1, members: [{ id: 1, username: 'alice', email: '' }] },
              invite: { code: 'AB2C3D' },
            }),
          )
    }

    if (url.endsWith(CANCEL_URL) && method === 'POST') {
      cancelled = true
      return Promise.resolve(jsonResponse(204, null))
    }

    if (url.endsWith(LOGOUT_URL) && method === 'POST') {
      loggedOut = true
      return Promise.resolve(jsonResponse(204, null))
    }

    throw new Error(`Unexpected fetch to ${url} (${method})`)
  })
}

async function renderWaitingScreen() {
  render(
    <AuthProvider>
      <CoupleProvider>
        <Probe />
        <InviteCodeDisplay />
      </CoupleProvider>
    </AuthProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('couple-status').textContent).toBe('waiting'))
}

describe('InviteCodeDisplay', () => {
  it('"Cancel pairing" returns couple state to "none"', async () => {
    vi.stubGlobal('fetch', mockBackend())
    const user = userEvent.setup()
    await renderWaitingScreen()

    await user.click(screen.getByRole('button', { name: 'Cancel pairing' }))

    await waitFor(() => expect(screen.getByTestId('couple-status').textContent).toBe('none'))
  })

  it('"Log out" clears auth state from the waiting screen', async () => {
    vi.stubGlobal('fetch', mockBackend())
    const user = userEvent.setup()
    await renderWaitingScreen()

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(screen.getByTestId('auth-status').textContent).toBe('unauthenticated'))
  })
})
