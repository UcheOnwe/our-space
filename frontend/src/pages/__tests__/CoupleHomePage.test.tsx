import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../features/auth/AuthContext'
import { CoupleProvider } from '../../features/couples/CoupleContext'
import { PresenceProvider } from '../../features/presence/PresenceContext'
import { FakeWebSocket } from '../../features/presence/__tests__/fakeWebSocket'
import { CoupleHomePage } from '../CoupleHomePage'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.restoreAllMocks()
  FakeWebSocket.instances.length = 0
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.endsWith('/api/auth/csrf/')) return Promise.resolve(jsonResponse(200, { detail: 'ok' }))
      if (url.endsWith('/api/auth/user-profile/')) {
        return Promise.resolve(jsonResponse(200, { id: 1, username: 'alice', email: '' }))
      }
      if (url.endsWith('/api/couples/couple-status/')) {
        return Promise.resolve(
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
      }
      throw new Error(`Unexpected fetch to ${url}`)
    }),
  )
})

describe('CoupleHomePage', () => {
  it('exposes a working entry into Watch Together through the left menu, not a page-level button', async () => {
    const onOpenWatch = vi.fn()
    const user = userEvent.setup()

    render(
      <AuthProvider>
        <CoupleProvider>
          <PresenceProvider feature="home">
            <CoupleHomePage onOpenWatch={onOpenWatch} />
          </PresenceProvider>
        </CoupleProvider>
      </AuthProvider>,
    )

    // The old always-visible fallback button is gone — Watch Together now
    // lives behind the hamburger menu (see CoupleHomeSidebar.tsx).
    expect(screen.queryByRole('button', { name: 'Start Watching' })).not.toBeInTheDocument()

    const menuToggle = await screen.findByRole('button', { name: 'Open menu' })
    await user.click(menuToggle)

    const watchTogether = await screen.findByRole('button', { name: 'Watch Together' })
    await user.click(watchTogether)

    expect(onOpenWatch).toHaveBeenCalledOnce()
    // Selecting it closes the drawer again.
    expect(screen.queryByRole('button', { name: 'Watch Together' })).not.toBeInTheDocument()
  })
})
