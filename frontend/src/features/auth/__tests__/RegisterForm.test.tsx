import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../AuthContext'
import { RegisterForm } from '../RegisterForm'

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
  const { status, user } = useAuth()
  return (
    <>
      <p data-testid="status">{status}</p>
      <p data-testid="username">{user?.username ?? ''}</p>
    </>
  )
}

const CSRF_URL = '/api/auth/csrf/'
const USER_PROFILE_URL = '/api/auth/user-profile/'
const REGISTER_URL = '/api/auth/register/'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockBackend() {
  let registeredUsername: string | null = null
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url.endsWith(CSRF_URL)) return Promise.resolve(jsonResponse(200, { detail: 'ok' }))

    if (url.endsWith(USER_PROFILE_URL)) {
      return registeredUsername
        ? Promise.resolve(jsonResponse(200, { id: 1, username: registeredUsername, email: '' }))
        : Promise.resolve(jsonResponse(403, { detail: 'Forbidden' }))
    }

    if (url.endsWith(REGISTER_URL) && method === 'POST') {
      const body = JSON.parse(init!.body as string)
      if (body.username === 'taken') {
        return Promise.resolve(
          jsonResponse(400, { username: ['A user with that username already exists.'] }),
        )
      }
      registeredUsername = body.username
      return Promise.resolve(jsonResponse(201, { id: 1, username: body.username, email: '' }))
    }

    throw new Error(`Unexpected fetch to ${url} (${method})`)
  })
}

async function renderRegisterForm() {
  render(
    <AuthProvider>
      <AuthProbe />
      <RegisterForm onSwitchToLogin={() => {}} />
    </AuthProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'))
}

describe('RegisterForm', () => {
  it('transitions to authenticated state on successful registration', async () => {
    vi.stubGlobal('fetch', mockBackend())
    const user = userEvent.setup()
    await renderRegisterForm()

    await user.type(screen.getByLabelText('Username'), 'newuser')
    await user.type(screen.getByLabelText('Password'), 'a-strong-password-1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))
    expect(screen.getByTestId('username').textContent).toBe('newuser')
  })

  it('shows a field-level error and stays signed out for a duplicate username', async () => {
    vi.stubGlobal('fetch', mockBackend())
    const user = userEvent.setup()
    await renderRegisterForm()

    await user.type(screen.getByLabelText('Username'), 'taken')
    await user.type(screen.getByLabelText('Password'), 'a-strong-password-1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A user with that username already exists.')
    expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
  })
})
