import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WatchProvider, useWatch } from '../WatchContext'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function WatchProbe() {
  const { status, videoLoaded, session, loadVideo } = useWatch()
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="loaded">{videoLoaded ? 'yes' : 'no'}</p>
      <p data-testid="video-id">{session?.provider_video_id ?? ''}</p>
      <button onClick={() => loadVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}>Load</button>
    </div>
  )
}

const LOAD_URL = '/api/watch/load-video/'

const LOADED_SESSION = {
  video_loaded: true,
  session: {
    provider: 'youtube',
    provider_video_id: 'dQw4w9WgXcQ',
    playback_status: 'paused',
    position_seconds: 0,
    updated_by: 'alice',
    updated_at: '2026-01-01T00:00:00Z',
  },
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('WatchProvider bootstrap', () => {
  it('reports no video loaded initially', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, { video_loaded: false, session: null }))))

    render(
      <WatchProvider>
        <WatchProbe />
      </WatchProvider>,
    )

    expect(screen.getByTestId('status').textContent).toBe('loading')
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'))
    expect(screen.getByTestId('loaded').textContent).toBe('no')
  })

  it('restores an already-loaded video', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, LOADED_SESSION))))

    render(
      <WatchProvider>
        <WatchProbe />
      </WatchProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('yes'))
    expect(screen.getByTestId('video-id').textContent).toBe('dQw4w9WgXcQ')
  })
})

describe('loadVideo', () => {
  it('updates state after a successful load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        const method = (init?.method ?? 'GET').toUpperCase()
        if (url.endsWith(LOAD_URL) && method === 'POST') {
          return Promise.resolve(jsonResponse(201, LOADED_SESSION))
        }
        return Promise.resolve(jsonResponse(200, { video_loaded: false, session: null }))
      }),
    )
    const user = userEvent.setup()

    render(
      <WatchProvider>
        <WatchProbe />
      </WatchProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'))

    await user.click(screen.getByRole('button', { name: 'Load' }))

    await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('yes'))
  })
})

describe('polling', () => {
  it('picks up a partner-initiated change on the next tick', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        callCount += 1
        return Promise.resolve(
          jsonResponse(200, {
            video_loaded: true,
            session: { ...LOADED_SESSION.session, playback_status: callCount === 1 ? 'paused' : 'playing' },
          }),
        )
      }),
    )

    function PlaybackProbe() {
      const { session } = useWatch()
      return <p data-testid="playback">{session?.playback_status ?? ''}</p>
    }

    render(
      <WatchProvider>
        <PlaybackProbe />
      </WatchProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('playback').textContent).toBe('paused'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    await waitFor(() => expect(screen.getByTestId('playback').textContent).toBe('playing'))
    vi.useRealTimers()
  })
})
