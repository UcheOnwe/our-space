import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoLoadForm } from '../VideoLoadForm'
import { WatchProvider, useWatch } from '../WatchContext'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function Probe() {
  const { videoLoaded } = useWatch()
  return <p data-testid="loaded">{videoLoaded ? 'yes' : 'no'}</p>
}

const STATUS_URL = '/api/watch/watch-session-status/'
const LOAD_URL = '/api/watch/load-video/'

beforeEach(() => {
  vi.restoreAllMocks()
})

/** Simulates the backend: starts empty, accepts anything that looks like a YouTube link. */
function mockBackend() {
  let loaded = false
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = (init?.method ?? 'GET').toUpperCase()

    if (url.endsWith(STATUS_URL)) {
      return Promise.resolve(jsonResponse(200, { video_loaded: loaded, session: null }))
    }

    if (url.endsWith(LOAD_URL) && method === 'POST') {
      const body = JSON.parse(init!.body as string)
      if (!String(body.url).includes('youtu')) {
        return Promise.resolve(jsonResponse(400, { detail: "That doesn't look like a valid YouTube link." }))
      }
      loaded = true
      return Promise.resolve(
        jsonResponse(201, {
          video_loaded: true,
          session: {
            provider: 'youtube',
            provider_video_id: 'dQw4w9WgXcQ',
            playback_status: 'paused',
            position_seconds: 0,
            updated_by: 'alice',
            updated_at: '2026-01-01T00:00:00Z',
          },
        }),
      )
    }

    throw new Error(`Unexpected fetch to ${url} (${method})`)
  })
}

async function renderForm() {
  render(
    <WatchProvider>
      <Probe />
      <VideoLoadForm />
    </WatchProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('no'))
}

describe('VideoLoadForm', () => {
  it('loads a valid YouTube URL', async () => {
    vi.stubGlobal('fetch', mockBackend())
    const user = userEvent.setup()
    await renderForm()

    await user.type(screen.getByLabelText(/YouTube URL/i), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    await user.click(screen.getByRole('button', { name: 'Load video' }))

    await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('yes'))
  })

  it('shows an error for an invalid link and stays empty', async () => {
    vi.stubGlobal('fetch', mockBackend())
    const user = userEvent.setup()
    await renderForm()

    await user.type(screen.getByLabelText(/YouTube URL/i), 'not a link')
    await user.click(screen.getByRole('button', { name: 'Load video' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("That doesn't look like a valid YouTube link.")
    expect(screen.getByTestId('loaded').textContent).toBe('no')
  })
})
