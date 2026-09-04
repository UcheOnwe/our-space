import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../auth/AuthContext'
import { CoupleProvider } from '../../couples/CoupleContext'
import { PresenceProvider } from '../../presence/PresenceContext'
import { FakeWebSocket } from '../../presence/__tests__/fakeWebSocket'
import { WatchProvider } from '../WatchContext'
import { WatchTogetherScreen } from '../WatchTogetherScreen'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.restoreAllMocks()
  FakeWebSocket.instances.length = 0
  vi.stubGlobal('WebSocket', FakeWebSocket)
  // WatchTogetherScreen renders PartnerBadge, which reads auth + couple
  // context — in the real app it's always nested inside both (via
  // CoupleGate), so the test mirrors that nesting rather than mocking it away.
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
      if (url.endsWith('/api/watch/watch-session-status/')) {
        return Promise.resolve(jsonResponse(200, { video_loaded: false, session: null }))
      }
      throw new Error(`Unexpected fetch to ${url}`)
    }),
  )
})

describe('WatchTogetherScreen', () => {
  // Deliberately does not exercise a loaded video: that path mounts
  // YouTubePlayer, which talks to the real youtube.com IFrame script — best
  // proven manually (see the Slice 3 test plan), not with a jsdom mock of a
  // third-party global.
  it('shows an empty state and the load form when no video has been loaded', async () => {
    render(
      <AuthProvider>
        <CoupleProvider>
          <WatchProvider>
            <PresenceProvider feature="watch">
              <WatchTogetherScreen />
            </PresenceProvider>
          </WatchProvider>
        </CoupleProvider>
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText(/No video loaded yet/i)).toBeInTheDocument())
    expect(screen.getByLabelText(/YouTube URL/i)).toBeInTheDocument()
  })
})
