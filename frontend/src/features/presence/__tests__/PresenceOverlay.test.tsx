import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PresenceProvider } from '../PresenceContext'
import { PresenceOverlay } from '../PresenceOverlay'
import { FakeWebSocket } from './fakeWebSocket'

beforeEach(() => {
  FakeWebSocket.instances.length = 0
  vi.stubGlobal('WebSocket', FakeWebSocket)
  // jsdom reports an all-zero rect by default, which would make every
  // normalized coordinate compute as NaN. A fixed, non-zero size makes the
  // click/position math in these tests deterministic.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 200,
    width: 200,
    height: 200,
    toJSON: () => {},
  })
})

function currentSocket() {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
}

function sentMessages(): { type: string; [key: string]: unknown }[] {
  return currentSocket().sent.map((raw) => JSON.parse(raw))
}

async function renderWithConnectedPartner(children: ReactNode) {
  render(
    <PresenceProvider feature="home">
      <PresenceOverlay>{children}</PresenceOverlay>
    </PresenceProvider>,
  )
  act(() => currentSocket().simulateOpen())
  act(() =>
    currentSocket().simulateMessage({
      type: 'presence.state',
      self: { userId: 1, avatar: 'A' },
      partner: { userId: 2, avatar: 'B', online: true, x: 0.5, y: 0.5, visible: true, currentFeature: null },
    }),
  )
  await waitFor(() => expect(screen.getByRole('button', { name: /hug/i })).toBeInTheDocument())
}

/** Renders PresenceOverlay wired to a real, mounted video-zone element —
 * the same callback-ref-to-state pattern WatchTogetherScreen.tsx uses, so
 * PresenceOverlay's suppress-zone effect actually sees the element instead
 * of `null` on first render. */
function VideoZoneHarness() {
  const [videoEl, setVideoEl] = useState<HTMLDivElement | null>(null)
  return (
    <PresenceOverlay suppressZoneElement={videoEl}>
      <div data-testid="video" ref={setVideoEl} style={{ width: 200, height: 200 }} />
    </PresenceOverlay>
  )
}

async function renderWithConnectedPartnerAndVideoZone() {
  render(
    <PresenceProvider feature="watch">
      <VideoZoneHarness />
    </PresenceProvider>,
  )
  act(() => currentSocket().simulateOpen())
  act(() =>
    currentSocket().simulateMessage({
      type: 'presence.state',
      self: { userId: 1, avatar: 'A' },
      partner: { userId: 2, avatar: 'B', online: true, x: 0.5, y: 0.5, visible: true, currentFeature: null },
    }),
  )
  await waitFor(() => expect(screen.getByRole('button', { name: /hug/i })).toBeInTheDocument())
}

describe('PresenceOverlay', () => {
  it('shows a connecting notice before the socket opens', () => {
    render(
      <PresenceProvider feature="home">
        <PresenceOverlay>{null}</PresenceOverlay>
      </PresenceProvider>,
    )
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
  })

  it('clicking the partner avatar sends a hug, never a click ripple', async () => {
    const user = userEvent.setup()
    await renderWithConnectedPartner(<div data-testid="empty-space" style={{ width: 200, height: 200 }} />)

    await user.click(screen.getByRole('button', { name: /hug/i }))

    const sent = sentMessages()
    expect(sent).toContainEqual({ type: 'interaction.hug' })
    // Note: a presence.move may still appear here — userEvent.click()
    // realistically moves the pointer toward the target before clicking,
    // and continuous desktop tracking is always-on regardless of what's
    // under the cursor. What must NEVER happen is a click ripple from this
    // gesture — that's the actual guarantee this test protects.
    expect(sent.some((m) => m.type === 'presence.click')).toBe(false)
  })

  it('clicking real Couple Home UI still fires its own action and also shows the click ripple', async () => {
    const onStartWatching = vi.fn()
    const user = userEvent.setup()
    await renderWithConnectedPartner(<button onClick={onStartWatching}>Start Watching</button>)

    await user.click(screen.getByRole('button', { name: 'Start Watching' }))

    expect(onStartWatching).toHaveBeenCalledOnce()
    const sent = sentMessages()
    expect(sent.some((m) => m.type === 'presence.click')).toBe(true)
    expect(sent.some((m) => m.type === 'presence.move')).toBe(true)
  })

  it('clicking empty Couple Home space moves the avatar and shows a ripple', async () => {
    const user = userEvent.setup()
    await renderWithConnectedPartner(<div data-testid="empty-space" style={{ width: 200, height: 200 }} />)

    await user.click(screen.getByTestId('empty-space'))

    const sent = sentMessages()
    expect(sent.some((m) => m.type === 'presence.click')).toBe(true)
    expect(sent.some((m) => m.type === 'presence.move')).toBe(true)
  })

  it('ignores a keyboard-activated click (no real pointer position to act on)', async () => {
    await renderWithConnectedPartner(<button>Focusable</button>)
    const button = screen.getByRole('button', { name: 'Focusable' })

    // event.detail is 0 for a keyboard-triggered click (e.g. pressing
    // Enter), unlike a real pointer click.
    fireEvent.click(button, { detail: 0 })

    const sent = sentMessages()
    expect(sent.some((m) => m.type === 'presence.click' || m.type === 'presence.move')).toBe(false)
  })

  it('Hug: a distant self avatar (the mobile case) visually converges to a shared anchor, then returns', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await renderWithConnectedPartner(<div data-testid="empty-space" style={{ width: 200, height: 200 }} />)

    // Simulates the exact mobile scenario this fix addresses: no
    // continuous pointer tracking, so selfPos is wherever the user's last
    // unrelated tap landed — here, deliberately far from the partner
    // (who's at the default 0.5, 0.5).
    fireEvent.click(screen.getByTestId('empty-space'), { clientX: 10, clientY: 10, detail: 1 })

    const selfAvatar = screen.getByRole('img', { name: 'You' }).parentElement as HTMLElement
    const partnerButton = screen.getByRole('button', { name: /hug/i })

    await waitFor(() => expect(selfAvatar.style.left).toBe('5%'))
    expect(partnerButton.style.left).toBe('50%')

    // A hug arrives — same code path whether it was triggered locally or
    // by the partner; this only tests the rendering response to it.
    act(() => currentSocket().simulateMessage({ type: 'interaction.hug', fromUserId: 2 }))

    await waitFor(() => {
      expect(selfAvatar.style.left).toBe(partnerButton.style.left)
      expect(selfAvatar.style.top).toBe(partnerButton.style.top)
    })
    expect(selfAvatar.style.left).not.toBe('5%') // it actually moved, not left in place

    const moveMessagesDuringHug = sentMessages().filter((m) => m.type === 'presence.move').length

    // HUG_DURATION_MS in PresenceContext.tsx.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800)
    })

    await waitFor(() => expect(selfAvatar.style.left).toBe('5%'))
    expect(partnerButton.style.left).toBe('50%')
    // The convergence and return were purely visual — no extra
    // presence.move messages were sent as a side effect of hugging.
    expect(sentMessages().filter((m) => m.type === 'presence.move')).toHaveLength(moveMessagesDuringHug)

    vi.useRealTimers()
  })

  it('desktop mouse movement anywhere on the page updates the local avatar', async () => {
    await renderWithConnectedPartner(<div data-testid="empty-space" style={{ width: 200, height: 200 }} />)

    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 150, clientY: 20 }),
      )
    })

    await waitFor(() => {
      const sent = sentMessages()
      expect(sent.some((m) => m.type === 'presence.move')).toBe(true)
    })
  })

  it('shows a location label above a sleeping partner who is in a different feature', async () => {
    await renderWithConnectedPartner(<div data-testid="empty-space" style={{ width: 200, height: 200 }} />)

    act(() => currentSocket().simulateMessage({ type: 'presence.leave', userId: 2 }))
    act(() => currentSocket().simulateMessage({ type: 'presence.location', userId: 2, feature: 'watch' }))

    expect(await screen.findByText('Watch Together')).toBeInTheDocument()
  })

  it('shows no location label while both partners are active in the same feature', async () => {
    await renderWithConnectedPartner(<div data-testid="empty-space" style={{ width: 200, height: 200 }} />)

    expect(screen.queryByText('Couple Home')).not.toBeInTheDocument()
    expect(screen.queryByText('Watch Together')).not.toBeInTheDocument()
  })

  it('shows no location label when the partner is genuinely disconnected and their location is unknown', async () => {
    await renderWithConnectedPartner(<div data-testid="empty-space" style={{ width: 200, height: 200 }} />)

    // A plain disconnect, with no presence.location update — currentFeature
    // stays null, per the server never inventing a location it doesn't know.
    act(() => currentSocket().simulateMessage({ type: 'presence.leave', userId: 2 }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Partner is offline' })).toBeInTheDocument(),
    )
    expect(screen.queryByText('Couple Home')).not.toBeInTheDocument()
    expect(screen.queryByText('Watch Together')).not.toBeInTheDocument()
  })

  it('a remote video-hidden dissolves the partner avatar without showing the sleeping/offline appearance', async () => {
    await renderWithConnectedPartner(<div data-testid="empty-space" style={{ width: 200, height: 200 }} />)

    act(() => currentSocket().simulateMessage({ type: 'presence.visibility', userId: 2, state: 'video-hidden' }))

    // Still "online" — the accessible label must stay the active one, not
    // flip to the offline/sleeping label. See PresenceOverlay.tsx's
    // deliberate separation of `partnerDissolved` from `partner.online`.
    const partnerButton = await screen.findByRole('button', { name: 'Hug your partner' })
    expect(partnerButton.className).toMatch(/avatarDissolved/)
    expect(screen.queryByText('Couple Home')).not.toBeInTheDocument()
    expect(screen.queryByText('Watch Together')).not.toBeInTheDocument()

    act(() => currentSocket().simulateMessage({ type: 'presence.visibility', userId: 2, state: 'visible' }))
    await waitFor(() => expect(partnerButton.className).not.toMatch(/avatarDissolved/))
  })

  it('dissolves the local avatar ~1s after the pointer enters the video zone, and reforms it on leave', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await renderWithConnectedPartnerAndVideoZone()

    const selfAvatarEl = screen.getByRole('img', { name: 'You' }).parentElement as HTMLElement
    expect(selfAvatarEl.className).not.toMatch(/avatarDissolved/)

    const video = screen.getByTestId('video')
    act(() => fireEvent.pointerEnter(video))

    // Not yet — the ~1s delay exists specifically so a cursor passing
    // through doesn't cause an instant flicker.
    act(() => vi.advanceTimersByTime(500))
    expect(selfAvatarEl.className).not.toMatch(/avatarDissolved/)

    act(() => vi.advanceTimersByTime(600))
    expect(selfAvatarEl.className).toMatch(/avatarDissolved/)

    act(() => fireEvent.pointerLeave(video))
    expect(selfAvatarEl.className).not.toMatch(/avatarDissolved/)

    vi.useRealTimers()
  })

  it('a click inside the video zone never produces a presence.click ripple — the player owns that click', async () => {
    const user = userEvent.setup()
    await renderWithConnectedPartnerAndVideoZone()

    await user.click(screen.getByTestId('video'))

    // Same caveat as the avatar-click test above: userEvent.click() moves
    // the pointer first, and continuous cursor tracking is always-on, so a
    // presence.move is expected here. What must never happen from a click
    // landing on the actual video is a ripple — that would visually
    // obstruct the player the exact thing "video controls always win"
    // exists to prevent.
    const sent = sentMessages()
    expect(sent.some((m) => m.type === 'presence.click')).toBe(false)
  })
})
