import { act, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PresenceProvider, usePresence } from '../PresenceContext'
import { FakeWebSocket } from './fakeWebSocket'

beforeEach(() => {
  FakeWebSocket.instances.length = 0
  vi.stubGlobal('WebSocket', FakeWebSocket)
})

function currentSocket() {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
}

function Probe() {
  const { connectionStatus, selfAvatar, partner, activeInteraction, ripples } = usePresence()
  return (
    <div>
      <p data-testid="status">{connectionStatus}</p>
      <p data-testid="self-avatar">{selfAvatar ?? ''}</p>
      <p data-testid="partner-online">{partner ? String(partner.online) : ''}</p>
      <p data-testid="partner-pos">{partner ? `${partner.x},${partner.y}` : ''}</p>
      <p data-testid="partner-visible">{partner ? String(partner.visible) : ''}</p>
      <p data-testid="partner-feature">{partner?.currentFeature ?? ''}</p>
      <p data-testid="interaction">{activeInteraction?.kind ?? ''}</p>
      <p data-testid="ripple-count">{ripples.length}</p>
    </div>
  )
}

const INITIAL_STATE_MESSAGE = {
  type: 'presence.state' as const,
  self: { userId: 1, avatar: 'A' as const },
  partner: {
    userId: 2,
    avatar: 'B' as const,
    online: true,
    x: 0.3,
    y: 0.4,
    visible: true,
    currentFeature: null,
  },
}

describe('PresenceProvider', () => {
  it('reports "connecting" immediately, then applies presence.state once open', async () => {
    render(
      <PresenceProvider feature="home">
        <Probe />
      </PresenceProvider>,
    )
    expect(screen.getByTestId('status').textContent).toBe('connecting')

    act(() => currentSocket().simulateOpen())
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('open'))

    act(() => currentSocket().simulateMessage(INITIAL_STATE_MESSAGE))

    expect(screen.getByTestId('self-avatar').textContent).toBe('A')
    expect(screen.getByTestId('partner-online').textContent).toBe('true')
    expect(screen.getByTestId('partner-pos').textContent).toBe('0.3,0.4')
  })

  it('presence.move updates the partner position', () => {
    render(
      <PresenceProvider feature="home">
        <Probe />
      </PresenceProvider>,
    )
    act(() => currentSocket().simulateOpen())
    act(() => currentSocket().simulateMessage(INITIAL_STATE_MESSAGE))

    act(() => currentSocket().simulateMessage({ type: 'presence.move', userId: 2, avatar: 'B', x: 0.9, y: 0.1 }))

    expect(screen.getByTestId('partner-pos').textContent).toBe('0.9,0.1')
  })

  it('presence.leave marks the partner offline without losing their identity', () => {
    render(
      <PresenceProvider feature="home">
        <Probe />
      </PresenceProvider>,
    )
    act(() => currentSocket().simulateOpen())
    act(() => currentSocket().simulateMessage(INITIAL_STATE_MESSAGE))

    act(() => currentSocket().simulateMessage({ type: 'presence.leave', userId: 2 }))

    expect(screen.getByTestId('partner-online').textContent).toBe('false')
  })

  it('presence.join marks a previously-offline partner online again', () => {
    render(
      <PresenceProvider feature="home">
        <Probe />
      </PresenceProvider>,
    )
    act(() => currentSocket().simulateOpen())
    act(() => currentSocket().simulateMessage(INITIAL_STATE_MESSAGE))
    act(() => currentSocket().simulateMessage({ type: 'presence.leave', userId: 2 }))

    act(() => currentSocket().simulateMessage({ type: 'presence.join', userId: 2, avatar: 'B' }))

    expect(screen.getByTestId('partner-online').textContent).toBe('true')
  })

  it('a hug interaction appears immediately and auto-clears after its duration', () => {
    vi.useFakeTimers()
    render(
      <PresenceProvider feature="home">
        <Probe />
      </PresenceProvider>,
    )
    act(() => currentSocket().simulateOpen())

    act(() => currentSocket().simulateMessage({ type: 'interaction.hug', fromUserId: 2 }))
    expect(screen.getByTestId('interaction').textContent).toBe('hug')

    act(() => vi.advanceTimersByTime(1800))
    expect(screen.getByTestId('interaction').textContent).toBe('')

    vi.useRealTimers()
  })

  it('an incoming presence.click shows a ripple that auto-clears after its duration', () => {
    vi.useFakeTimers()
    render(
      <PresenceProvider feature="home">
        <Probe />
      </PresenceProvider>,
    )
    act(() => currentSocket().simulateOpen())

    act(() => currentSocket().simulateMessage({ type: 'presence.click', x: 0.4, y: 0.6 }))
    expect(screen.getByTestId('ripple-count').textContent).toBe('1')

    act(() => vi.advanceTimersByTime(550))
    expect(screen.getByTestId('ripple-count').textContent).toBe('0')

    vi.useRealTimers()
  })

  it('sendClick shows the ripple locally, without waiting for a server echo', () => {
    vi.useFakeTimers()
    const sendClickHolder: { current: ((x: number, y: number) => void) | null } = { current: null }
    function Capture() {
      const { sendClick } = usePresence()
      useEffect(() => {
        sendClickHolder.current = sendClick
      })
      return null
    }

    render(
      <PresenceProvider feature="home">
        <Probe />
        <Capture />
      </PresenceProvider>,
    )
    act(() => currentSocket().simulateOpen())

    act(() => sendClickHolder.current?.(0.2, 0.8))

    expect(screen.getByTestId('ripple-count').textContent).toBe('1')
    expect(currentSocket().sent).toContainEqual(JSON.stringify({ type: 'presence.click', x: 0.2, y: 0.8 }))

    vi.useRealTimers()
  })

  it('throttles outgoing move messages to roughly 20/second', () => {
    vi.useFakeTimers()
    // A holder object, not a reassigned outer variable: only its `.current`
    // property is mutated during render, the same pattern a ref uses.
    const sendMoveHolder: { current: ((x: number, y: number) => void) | null } = { current: null }
    function Capture() {
      const { sendMove } = usePresence()
      // Assigning in an effect (a side effect), not during render, is what
      // keeps this the sanctioned pattern rather than a render-time mutation.
      useEffect(() => {
        sendMoveHolder.current = sendMove
      })
      return null
    }

    render(
      <PresenceProvider feature="home">
        <Capture />
      </PresenceProvider>,
    )
    act(() => currentSocket().simulateOpen())

    act(() => {
      sendMoveHolder.current?.(0.1, 0.1)
      sendMoveHolder.current?.(0.2, 0.2) // sent within the same 50ms window — must be dropped
    })
    expect(currentSocket().sent).toHaveLength(1)

    act(() => vi.advanceTimersByTime(60))
    act(() => sendMoveHolder.current?.(0.3, 0.3))
    expect(currentSocket().sent).toHaveLength(2)

    vi.useRealTimers()
  })

  it('connects to the feature-scoped WebSocket URL for the given feature', () => {
    render(
      <PresenceProvider feature="watch">
        <Probe />
      </PresenceProvider>,
    )
    expect(currentSocket().url).toContain('/ws/presence/watch/')
  })

  it('presence.visibility updates partner.visible without touching online', () => {
    render(
      <PresenceProvider feature="watch">
        <Probe />
      </PresenceProvider>,
    )
    act(() => currentSocket().simulateOpen())
    act(() => currentSocket().simulateMessage(INITIAL_STATE_MESSAGE))

    act(() => currentSocket().simulateMessage({ type: 'presence.visibility', userId: 2, state: 'video-hidden' }))

    expect(screen.getByTestId('partner-visible').textContent).toBe('false')
    expect(screen.getByTestId('partner-online').textContent).toBe('true')

    act(() => currentSocket().simulateMessage({ type: 'presence.visibility', userId: 2, state: 'visible' }))
    expect(screen.getByTestId('partner-visible').textContent).toBe('true')
  })

  it('presence.location updates partner.currentFeature, which presence.join/leave never touch', () => {
    render(
      <PresenceProvider feature="home">
        <Probe />
      </PresenceProvider>,
    )
    act(() => currentSocket().simulateOpen())
    act(() => currentSocket().simulateMessage(INITIAL_STATE_MESSAGE))

    act(() => currentSocket().simulateMessage({ type: 'presence.location', userId: 2, feature: 'watch' }))
    expect(screen.getByTestId('partner-feature').textContent).toBe('watch')

    // Going offline in THIS feature must not erase the (still valid) fact
    // that they were last known to be in Watch Together.
    act(() => currentSocket().simulateMessage({ type: 'presence.leave', userId: 2 }))
    expect(screen.getByTestId('partner-feature').textContent).toBe('watch')
  })

  it('sendVisibility sends a typed presence.visibility message with no identity fields', () => {
    const sendVisibilityHolder: { current: ((state: 'visible' | 'video-hidden') => void) | null } = {
      current: null,
    }
    function Capture() {
      const { sendVisibility } = usePresence()
      useEffect(() => {
        sendVisibilityHolder.current = sendVisibility
      })
      return null
    }

    render(
      <PresenceProvider feature="watch">
        <Capture />
      </PresenceProvider>,
    )
    act(() => currentSocket().simulateOpen())

    act(() => sendVisibilityHolder.current?.('video-hidden'))

    expect(currentSocket().sent).toContainEqual(JSON.stringify({ type: 'presence.visibility', state: 'video-hidden' }))
  })
})
