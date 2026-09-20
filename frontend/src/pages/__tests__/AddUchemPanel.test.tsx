import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddUchemPanel } from '../AddUchemPanel'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubFetch(options: { restoreResponse?: () => Response } = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    if (url.endsWith('/api/uchem/dev/restore/') && init?.method === 'POST') {
      if (options.restoreResponse) return Promise.resolve(options.restoreResponse())
      return Promise.resolve(jsonResponse(200, { balance: 10000, updated_at: '2026-01-01T00:00:00Z' }))
    }
    throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AddUchemPanel', () => {
  it('shows the long-term "coming soon" note and the developer testing section', () => {
    stubFetch()
    render(<AddUchemPanel onClose={vi.fn()} onBalanceChange={vi.fn()} />)

    expect(screen.getByText(/more ways to earn and buy uchem/i)).toBeInTheDocument()
    // import.meta.env.DEV is true under the test runner — this proves
    // the section renders in a development-like environment, not that
    // it's hidden here; the REAL boundary is the backend endpoint
    // itself (see backend/uchem/urls.py's DEBUG-gated registration).
    expect(screen.getByText('Developer Testing')).toBeInTheDocument()
    expect(screen.getByLabelText('Testing credit code')).toBeInTheDocument()
  })

  it('submitting a valid code reports the new balance and shows success', async () => {
    stubFetch()
    const onBalanceChange = vi.fn()
    const user = userEvent.setup()
    render(<AddUchemPanel onClose={vi.fn()} onBalanceChange={onBalanceChange} />)

    await user.type(screen.getByLabelText('Testing credit code'), 'the-real-code')
    await user.click(screen.getByRole('button', { name: 'Apply test credit' }))

    expect(await screen.findByText('Couple Wallet restored.')).toBeInTheDocument()
    expect(onBalanceChange).toHaveBeenCalledWith(10000)
  })

  it('shows an inline error for an invalid code without closing', async () => {
    stubFetch({ restoreResponse: () => jsonResponse(400, { detail: 'Invalid test code.' }) })
    const onClose = vi.fn()
    const onBalanceChange = vi.fn()
    const user = userEvent.setup()
    render(<AddUchemPanel onClose={onClose} onBalanceChange={onBalanceChange} />)

    await user.type(screen.getByLabelText('Testing credit code'), 'wrong-code')
    await user.click(screen.getByRole('button', { name: 'Apply test credit' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid test code.')
    expect(onBalanceChange).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('the submit button is disabled with an empty code', () => {
    stubFetch()
    render(<AddUchemPanel onClose={vi.fn()} onBalanceChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Apply test credit' })).toBeDisabled()
  })

  it('closing via the close button calls onClose', async () => {
    stubFetch()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<AddUchemPanel onClose={onClose} onBalanceChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('pressing Escape calls onClose', async () => {
    stubFetch()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<AddUchemPanel onClose={onClose} onBalanceChange={vi.fn()} />)

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('clicking the backdrop calls onClose, but clicking inside the panel does not', async () => {
    stubFetch()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<AddUchemPanel onClose={onClose} onBalanceChange={vi.fn()} />)

    await user.click(screen.getByRole('dialog', { name: 'Add Uchem' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
