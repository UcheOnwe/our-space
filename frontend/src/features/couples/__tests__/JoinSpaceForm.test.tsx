import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CoupleProvider, useCouple } from '../CoupleContext'
import { JoinSpaceForm } from '../JoinSpaceForm'

function jsonResponse(status: number, body: unknown): Response {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function CoupleProbe() {
  const { status } = useCouple()
  return <p data-testid="status">{status}</p>
}

const STATUS_URL = '/api/couples/couple-status/'
const JOIN_URL = '/api/couples/join/'

beforeEach(() => {
  vi.restoreAllMocks()
})

/** Simulates the backend: starts unpaired, accepts one known code. */
function mockBackend() {
  let paired = false
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url.endsWith(STATUS_URL)) {
      return paired
        ? Promise.resolve(
            jsonResponse(200, {
              status: 'paired',
              couple: {
                id: 1,
                members: [
                  { id: 1, username: 'alice', email: '' },
                  { id: 2, username: 'bob', email: '' },
                ],
              },
            }),
          )
        : Promise.resolve(jsonResponse(200, { status: 'none' }))
    }

    if (url.endsWith(JOIN_URL) && method === 'POST') {
      const body = JSON.parse(init!.body as string)
      if (body.code === 'AB2C3D') {
        paired = true
        return Promise.resolve(jsonResponse(200, { couple: { id: 1, members: [] } }))
      }
      return Promise.resolve(
        jsonResponse(400, { detail: 'This invite code is invalid or has already been used.' }),
      )
    }

    throw new Error(`Unexpected fetch to ${url} (${method})`)
  })
}

async function renderForm() {
  render(
    <CoupleProvider>
      <CoupleProbe />
      <JoinSpaceForm onBack={() => {}} />
    </CoupleProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('none'))
}

describe('JoinSpaceForm', () => {
  it('transitions to paired state on a valid code', async () => {
    vi.stubGlobal('fetch', mockBackend())
    const user = userEvent.setup()
    await renderForm()

    // Lowercase input, confirming case-insensitive entry works end-to-end.
    await user.type(screen.getByLabelText('Invite code'), 'ab2c3d')
    await user.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('paired'))
  })

  it('shows an error and stays unpaired for an invalid code', async () => {
    vi.stubGlobal('fetch', mockBackend())
    const user = userEvent.setup()
    await renderForm()

    await user.type(screen.getByLabelText('Invite code'), 'ZZZZZZ')
    await user.click(screen.getByRole('button', { name: 'Join' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This invite code is invalid or has already been used.',
    )
    expect(screen.getByTestId('status').textContent).toBe('none')
  })
})
