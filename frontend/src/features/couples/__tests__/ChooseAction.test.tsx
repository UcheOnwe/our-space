import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChooseAction } from '../ChooseAction'
import { CoupleProvider, useCouple } from '../CoupleContext'

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
const CREATE_URL = '/api/couples/'

beforeEach(() => {
  vi.restoreAllMocks()
})

/** Simulates the backend: starts unpaired, "creates" a couple on POST. */
function mockBackend() {
  let created = false
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url.endsWith(STATUS_URL)) {
      return created
        ? Promise.resolve(
            jsonResponse(200, {
              status: 'waiting',
              couple: { id: 1, members: [{ id: 1, username: 'alice', email: '' }] },
              invite: { code: 'AB2C3D' },
            }),
          )
        : Promise.resolve(jsonResponse(200, { status: 'none' }))
    }

    if (url.endsWith(CREATE_URL) && method === 'POST') {
      created = true
      return Promise.resolve(
        jsonResponse(201, {
          couple: { id: 1, members: [{ id: 1, username: 'alice', email: '' }] },
          invite: { code: 'AB2C3D' },
        }),
      )
    }

    throw new Error(`Unexpected fetch to ${url} (${method})`)
  })
}

describe('ChooseAction', () => {
  it('transitions to waiting state after creating a space', async () => {
    vi.stubGlobal('fetch', mockBackend())
    const user = userEvent.setup()

    render(
      <CoupleProvider>
        <CoupleProbe />
        <ChooseAction onChooseJoin={() => {}} />
      </CoupleProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('none'))

    await user.click(screen.getByRole('button', { name: 'Create Our Space' }))

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('waiting'))
  })

  it('shows an error and stays unpaired if creation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        const method = (init?.method ?? 'GET').toUpperCase()
        if (url.endsWith(STATUS_URL)) return Promise.resolve(jsonResponse(200, { status: 'none' }))
        if (url.endsWith(CREATE_URL) && method === 'POST') {
          return Promise.resolve(jsonResponse(400, { detail: 'You already belong to a couple.' }))
        }
        throw new Error(`Unexpected fetch to ${url} (${method})`)
      }),
    )
    const user = userEvent.setup()

    render(
      <CoupleProvider>
        <CoupleProbe />
        <ChooseAction onChooseJoin={() => {}} />
      </CoupleProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('none'))

    await user.click(screen.getByRole('button', { name: 'Create Our Space' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You already belong to a couple.')
    expect(screen.getByTestId('status').textContent).toBe('none')
  })
})
