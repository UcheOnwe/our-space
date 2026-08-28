import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CoupleProvider, useCouple } from '../CoupleContext'

function jsonResponse(status: number, body: unknown): Response {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function CoupleProbe() {
  const { status, invite, couple, cancelPairing } = useCouple()
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="code">{invite?.code ?? ''}</p>
      <p data-testid="members">{couple?.members.map((m) => m.username).join(',') ?? ''}</p>
      <button onClick={() => cancelPairing()}>Cancel</button>
    </div>
  )
}

const CANCEL_URL = '/api/couples/cancel-pending-pairing/'

const WAITING_RESPONSE = {
  status: 'waiting',
  couple: { id: 1, members: [{ id: 1, username: 'alice', email: '' }] },
  invite: { code: 'AB2C3D' },
}

const PAIRED_RESPONSE = {
  status: 'paired',
  couple: {
    id: 1,
    members: [
      { id: 1, username: 'alice', email: '' },
      { id: 2, username: 'bob', email: '' },
    ],
  },
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('CoupleProvider bootstrap (restores state on load)', () => {
  it('restores "none" status', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, { status: 'none' }))))

    render(
      <CoupleProvider>
        <CoupleProbe />
      </CoupleProvider>,
    )

    expect(screen.getByTestId('status').textContent).toBe('loading')
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('none'))
  })

  it('restores "waiting" status with the invite code', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, WAITING_RESPONSE))))

    render(
      <CoupleProvider>
        <CoupleProbe />
      </CoupleProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('waiting'))
    expect(screen.getByTestId('code').textContent).toBe('AB2C3D')
  })

  it('restores "paired" status with both members', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, PAIRED_RESPONSE))))

    render(
      <CoupleProvider>
        <CoupleProbe />
      </CoupleProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('paired'))
    expect(screen.getByTestId('members').textContent).toBe('alice,bob')
  })
})

describe('polling while waiting', () => {
  it('picks up the paired state once the partner joins', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        callCount += 1
        return Promise.resolve(jsonResponse(200, callCount === 1 ? WAITING_RESPONSE : PAIRED_RESPONSE))
      }),
    )

    render(
      <CoupleProvider>
        <CoupleProbe />
      </CoupleProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('waiting'))
    expect(callCount).toBe(1)

    // Advances past the poll interval (see POLL_INTERVAL_MS in CoupleContext).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('paired'))
    expect(callCount).toBe(2)

    vi.useRealTimers()
  })
})

describe('cancelPairing', () => {
  it('returns to "none" after a successful cancellation', async () => {
    let cancelled = false
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        const method = (init?.method ?? 'GET').toUpperCase()
        if (url.endsWith(CANCEL_URL) && method === 'POST') {
          cancelled = true
          return Promise.resolve(jsonResponse(204, null))
        }
        return Promise.resolve(jsonResponse(200, cancelled ? { status: 'none' } : WAITING_RESPONSE))
      }),
    )
    const user = userEvent.setup()

    render(
      <CoupleProvider>
        <CoupleProbe />
      </CoupleProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('waiting'))

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('none'))
  })
})
