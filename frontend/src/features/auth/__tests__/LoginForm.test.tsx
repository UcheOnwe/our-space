import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../AuthContext'
import { LoginForm } from '../LoginForm'

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

function AuthProbe() {
  const { status } = useAuth()
  return <p data-testid="status">{status}</p>
}

const CSRF_URL = '/api/auth/csrf/'
const USER_PROFILE_URL = '/api/auth/user-profile/'
const LOGIN_URL = '/api/auth/login/'

beforeEach(() => {
  vi.restoreAllMocks()
})

/** Simulates the backend: starts signed out, accepts one known credential pair. */
function mockBackend() {
  let loggedIn = false
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url.endsWith(CSRF_URL)) return Promise.resolve(jsonResponse(200, { detail: 'ok' }))

    if (url.endsWith(USER_PROFILE_URL)) {
      return loggedIn
        ? Promise.resolve(jsonResponse(200, { id: 1, username: 'alice', email: '' }))
        : Promise.resolve(jsonResponse(403, { detail: 'Forbidden' }))
    }

    if (url.endsWith(LOGIN_URL) && method === 'POST') {
      const body = JSON.parse(init!.body as string)
      if (body.username === 'alice' && body.password === 'correct-password') {
        loggedIn = true
        return Promise.resolve(jsonResponse(200, { id: 1, username: 'alice', email: '' }))
      }
      return Promise.resolve(jsonResponse(400, { detail: 'Invalid credentials.' }))
    }

    throw new Error(`Unexpected fetch to ${url} (${method})`)
  })
}

async function renderLoginForm() {
  render(
    <AuthProvider>
      <AuthProbe />
      <LoginForm onSwitchToRegister={() => {}} />
    </AuthProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'))
}

describe('LoginForm', () => {
  it('transitions to authenticated state on successful login', async () => {
    vi.stubGlobal('fetch', mockBackend())
    const user = userEvent.setup()
    await renderLoginForm()

    await user.type(screen.getByLabelText('Username'), 'alice')
    await user.type(screen.getByLabelText('Password'), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))
  })

  it('shows an error and stays signed out on invalid credentials', async () => {
    vi.stubGlobal('fetch', mockBackend())
    const user = userEvent.setup()
    await renderLoginForm()

    await user.type(screen.getByLabelText('Username'), 'alice')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials.')
    expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
  })
})
