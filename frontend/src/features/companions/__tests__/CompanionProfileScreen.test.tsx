import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CompanionProfileScreen } from '../CompanionProfileScreen'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubFetch(initialProfile: { companion_type: string; color_variant: string }, patchOverride?: () => Response) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    if (url.endsWith('/api/companions/profile/') && (init?.method ?? 'GET') === 'GET') {
      return Promise.resolve(jsonResponse(200, { ...initialProfile, updated_at: '2026-01-01T00:00:00Z' }))
    }
    if (url.endsWith('/api/companions/profile/') && init?.method === 'PATCH') {
      if (patchOverride) return Promise.resolve(patchOverride())
      const body = JSON.parse(init.body as string)
      return Promise.resolve(
        jsonResponse(200, {
          companion_type: body.companion_type,
          color_variant: body.color_variant,
          updated_at: '2026-01-02T00:00:00Z',
        }),
      )
    }
    throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('CompanionProfileScreen', () => {
  it('loads the current selection and renders all four Companion choices', async () => {
    stubFetch({ companion_type: 'cosmic_blob', color_variant: 'olive' })

    render(<CompanionProfileScreen />)

    expect(await screen.findByRole('button', { name: /Cosmic Blob/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cosmic Flyer/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mini UFO/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Star Wisp/ })).toBeInTheDocument()
  })

  it('marks the currently-equipped Companion with an "Equipped" badge', async () => {
    stubFetch({ companion_type: 'mini_ufo', color_variant: 'silver' })

    render(<CompanionProfileScreen />)

    const ufoCard = await screen.findByRole('button', { name: /Mini UFO/ })
    expect(ufoCard).toHaveTextContent('Equipped')
    const blobCard = screen.getByRole('button', { name: /Cosmic Blob/ })
    expect(blobCard).not.toHaveTextContent('Equipped')
  })

  it('disables Save when nothing has changed from the loaded selection', async () => {
    stubFetch({ companion_type: 'cosmic_blob', color_variant: 'olive' })

    render(<CompanionProfileScreen />)
    await screen.findByRole('button', { name: /Cosmic Blob/ })

    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled()
    expect(screen.getByText('Up to date')).toBeInTheDocument()
  })

  it('switching Companion falls back to that Companion’s own default color when the current color is not valid for it', async () => {
    stubFetch({ companion_type: 'cosmic_blob', color_variant: 'olive' })
    const user = userEvent.setup()

    render(<CompanionProfileScreen />)
    await screen.findByRole('button', { name: /Cosmic Blob/ })

    // "olive" is not curated for mini_ufo.
    await user.click(screen.getByRole('button', { name: /Mini UFO/ }))

    expect(screen.getByRole('button', { name: 'Silver' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('enables Save once the draft differs from the loaded selection, and saves both fields together', async () => {
    const fetchMock = stubFetch({ companion_type: 'cosmic_blob', color_variant: 'olive' })
    const user = userEvent.setup()

    render(<CompanionProfileScreen />)
    await screen.findByRole('button', { name: /Cosmic Blob/ })

    await user.click(screen.getByRole('button', { name: /Star Wisp/ }))
    const saveButton = screen.getByRole('button', { name: /Save/ })
    expect(saveButton).toBeEnabled()

    await user.click(saveButton)

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      const body = JSON.parse((patchCall![1] as RequestInit).body as string)
      expect(body).toEqual({ companion_type: 'star_wisp', color_variant: 'starlight' })
    })

    // After a successful save, the newly-saved selection is what's marked equipped.
    expect(await screen.findByText('Up to date')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Star Wisp/ })).toHaveTextContent('Equipped')
  })

  it('shows an error message if saving fails, without losing the current draft', async () => {
    stubFetch({ companion_type: 'cosmic_blob', color_variant: 'olive' }, () =>
      jsonResponse(400, { color_variant: ['"midnight" is not an available color for this Companion.'] }),
    )
    const user = userEvent.setup()

    render(<CompanionProfileScreen />)
    await screen.findByRole('button', { name: /Cosmic Blob/ })

    await user.click(screen.getByRole('button', { name: /Mini UFO/ }))
    await user.click(screen.getByRole('button', { name: /Save/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/not an available color/)
    // The draft selection (Mini UFO) is still what's shown, not reverted.
    expect(screen.getByRole('button', { name: 'Silver' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows an error if the initial profile fails to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(500, { detail: 'Server error.' }))),
    )

    render(<CompanionProfileScreen />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Server error.')
  })
})
