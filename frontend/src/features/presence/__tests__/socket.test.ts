import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PresenceSocket } from '../socket'
import { FakeWebSocket } from './fakeWebSocket'

beforeEach(() => {
  FakeWebSocket.instances.length = 0
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PresenceSocket', () => {
  it('reports connecting then open', () => {
    const statuses: string[] = []
    const socket = new PresenceSocket('ws://test/presence/', {
      onStatusChange: (s) => statuses.push(s),
      onMessage: () => {},
    })

    socket.connect()
    expect(statuses).toEqual(['connecting'])

    FakeWebSocket.instances[0].simulateOpen()
    expect(statuses).toEqual(['connecting', 'open'])
  })

  it('only sends messages once the connection is open', () => {
    const socket = new PresenceSocket('ws://test/presence/', { onStatusChange: () => {}, onMessage: () => {} })
    socket.connect()

    socket.send({ type: 'interaction.hug' })
    expect(FakeWebSocket.instances[0].sent).toHaveLength(0)

    FakeWebSocket.instances[0].simulateOpen()
    socket.send({ type: 'interaction.hug' })
    expect(FakeWebSocket.instances[0].sent).toEqual([JSON.stringify({ type: 'interaction.hug' })])
  })

  it('parses and forwards incoming messages', () => {
    const received: unknown[] = []
    const socket = new PresenceSocket('ws://test/presence/', {
      onStatusChange: () => {},
      onMessage: (m) => received.push(m),
    })
    socket.connect()
    FakeWebSocket.instances[0].simulateOpen()

    FakeWebSocket.instances[0].simulateMessage({ type: 'presence.leave', userId: 5 })

    expect(received).toEqual([{ type: 'presence.leave', userId: 5 }])
  })

  it('reconnects with exponential backoff after an unexpected close', () => {
    const socket = new PresenceSocket('ws://test/presence/', { onStatusChange: () => {}, onMessage: () => {} })
    socket.connect()
    FakeWebSocket.instances[0].simulateOpen()

    FakeWebSocket.instances[0].simulateClose()
    expect(FakeWebSocket.instances).toHaveLength(1)

    vi.advanceTimersByTime(499)
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(2) // first retry at ~0.5s

    FakeWebSocket.instances[1].simulateClose()
    vi.advanceTimersByTime(999)
    expect(FakeWebSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(3) // second retry at ~1s (doubled)
  })

  it('does not reconnect after an intentional close', () => {
    const socket = new PresenceSocket('ws://test/presence/', { onStatusChange: () => {}, onMessage: () => {} })
    socket.connect()
    FakeWebSocket.instances[0].simulateOpen()

    socket.close()
    vi.advanceTimersByTime(20000)

    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
