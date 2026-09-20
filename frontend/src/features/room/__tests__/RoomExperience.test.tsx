import { useRef, useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomExperience } from '../RoomExperience'
import type { RoomExperienceHandle } from '../RoomExperience'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const BASE_GALLERY = [
  { room_type: 'couple_home', display_name: 'Couple Home', order: 0, price: 0, is_owned: true, is_active: true },
  { room_type: 'cozy_loft', display_name: 'Cozy Loft', order: 1, price: 2500, is_owned: false, is_active: false },
]

function stubFetch(options: {
  gallery?: typeof BASE_GALLERY
  purchaseResponse?: () => Response
  selectResponse?: () => Response
}) {
  const gallery = options.gallery ?? BASE_GALLERY
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const method = init?.method ?? 'GET'
    if (url.endsWith('/api/rooms/gallery/') && method === 'GET') {
      return Promise.resolve(jsonResponse(200, gallery))
    }
    if (url.endsWith('/api/uchem/couple/') && method === 'GET') {
      return Promise.resolve(jsonResponse(200, { balance: 5000, updated_at: '2026-01-01T00:00:00Z' }))
    }
    if (url.endsWith('/api/rooms/purchase/') && method === 'POST') {
      if (options.purchaseResponse) return Promise.resolve(options.purchaseResponse())
      return Promise.resolve(
        jsonResponse(
          200,
          gallery.map((room) => (room.room_type === 'cozy_loft' ? { ...room, is_owned: true, is_active: true } : { ...room, is_active: false })),
        ),
      )
    }
    if (url.endsWith('/api/rooms/select-active/') && method === 'POST') {
      if (options.selectResponse) return Promise.resolve(options.selectResponse())
      const body = JSON.parse(init?.body as string)
      return Promise.resolve(jsonResponse(200, gallery.map((room) => ({ ...room, is_active: room.room_type === body.room_type }))))
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Stands in for CoupleHomeNav: holds the ref and mirrors the two report
 * callbacks — RoomExperience no longer renders its own trigger/HUD UI, so
 * its tests drive it the same way the real nav does. */
function Harness() {
  const ref = useRef<RoomExperienceHandle>(null)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)

  return (
    <div>
      <button type="button" onClick={() => ref.current?.toggleGallery()}>
        {isGalleryOpen ? 'Close' : 'Switch Room'}
      </button>
      <button type="button" onClick={() => ref.current?.closeGallery()}>
        Branding
      </button>
      <button type="button" onClick={() => ref.current?.returnToActiveRoom()}>
        Home
      </button>
      <div>Balance: {balance === null ? '—' : balance}</div>
      <RoomExperience ref={ref} onOpenWatch={vi.fn()} onModeChange={setIsGalleryOpen} onBalanceChange={setBalance} />
    </div>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('RoomExperience', () => {
  it('shows the currently active room full-screen by default', async () => {
    stubFetch({})

    render(<Harness />)

    // No error/loading state left showing — nothing else to assert on
    // the room itself here (RoomCanvas/CozyLoftRoom rendering is covered
    // by their own tests); this just confirms the gallery isn't shown.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Switch Room' })).toBeInTheDocument())
  })

  it('opens the browser via the imperative handle, showing both owned and locked rooms', async () => {
    stubFetch({})
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(await screen.findByRole('button', { name: 'Switch Room' }))

    expect(await screen.findByText('Couple Home')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Cozy Loft' })).toBeInTheDocument()
  })

  it('reports the open state via onModeChange', async () => {
    stubFetch({})
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(await screen.findByRole('button', { name: 'Switch Room' }))
    expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(await screen.findByRole('button', { name: 'Switch Room' })).toBeInTheDocument()
  })

  it('closeGallery (the "branding click" path) closes without confirming and is a no-op when already closed', async () => {
    const fetchMock = stubFetch({})
    const user = userEvent.setup()
    render(<Harness />)

    // No-op while already in room mode.
    await user.click(await screen.findByRole('button', { name: 'Branding' }))
    expect(screen.getByRole('button', { name: 'Switch Room' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Switch Room' }))
    await user.click(await screen.findByRole('button', { name: 'Branding' }))

    expect(screen.getByRole('button', { name: 'Switch Room' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/purchase/'), expect.anything())
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/select-active/'), expect.anything())
  })

  it('purchasing a locked room unlocks it, reports the new balance, and returns to the full-screen room', async () => {
    stubFetch({})
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(await screen.findByRole('button', { name: 'Switch Room' }))
    await user.click(await screen.findByRole('button', { name: 'Show Cozy Loft' }))
    await user.click(await screen.findByRole('button', { name: /Unlock for 2,500 Uchem/ }))

    expect(await screen.findByRole('button', { name: 'Switch Room' })).toBeInTheDocument()
    expect(await screen.findByText('Balance: 5000')).toBeInTheDocument()
  })

  it('shows an inline error and stays in the browser on insufficient Uchem', async () => {
    stubFetch({ purchaseResponse: () => jsonResponse(400, { detail: 'This Couple Wallet does not have enough Uchem for this operation.' }) })
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(await screen.findByRole('button', { name: 'Switch Room' }))
    await user.click(await screen.findByRole('button', { name: 'Show Cozy Loft' }))
    await user.click(await screen.findByRole('button', { name: /Unlock for 2,500 Uchem/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('does not have enough Uchem')
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('returnToActiveRoom (the universal "Home" action) leaves an active Cozy Loft hotspot close-up', async () => {
    const gallery = [
      { room_type: 'couple_home', display_name: 'Couple Home', order: 0, price: 0, is_owned: true, is_active: false },
      { room_type: 'cozy_loft', display_name: 'Cozy Loft', order: 1, price: 2500, is_owned: true, is_active: true },
    ]
    stubFetch({ gallery })
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(await screen.findByRole('button', { name: 'Watch' }))
    await screen.findByRole('button', { name: /Continue with YouTube/ })

    await user.click(screen.getByRole('button', { name: 'Home' }))
    expect(await screen.findByRole('button', { name: 'Watch' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Continue with YouTube/ })).not.toBeInTheDocument()
  })

  it('selecting an already-owned room calls select-active, not purchase, and does not report a balance change', async () => {
    const gallery = [
      { room_type: 'couple_home', display_name: 'Couple Home', order: 0, price: 0, is_owned: true, is_active: true },
      { room_type: 'cozy_loft', display_name: 'Cozy Loft', order: 1, price: 2500, is_owned: true, is_active: false },
    ]
    const fetchMock = stubFetch({ gallery })
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(await screen.findByRole('button', { name: 'Switch Room' }))
    await user.click(await screen.findByRole('button', { name: 'Show Cozy Loft' }))
    await user.click(await screen.findByRole('button', { name: /Enter Cozy Loft/ }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/select-active/'), expect.objectContaining({ method: 'POST' }))
    })
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/purchase/'), expect.anything())
    const balanceCalls = fetchMock.mock.calls.filter(([url]) => url.toString().endsWith('/api/uchem/couple/'))
    expect(balanceCalls).toHaveLength(0)
  })
})
