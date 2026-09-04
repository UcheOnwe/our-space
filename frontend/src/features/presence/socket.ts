import type { ClientMessage, ServerMessage } from './types'

// 0.5s -> 1s -> 2s -> 4s -> capped at 8s, per the approved reconnect scope.
const INITIAL_RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 8000

export type ConnectionStatus = 'connecting' | 'open' | 'closed'

interface PresenceSocketHandlers {
  onStatusChange: (status: ConnectionStatus) => void
  onMessage: (message: ServerMessage) => void
}

/**
 * Wraps the browser's native WebSocket with automatic reconnection. This is
 * the one place in the app that touches the raw WebSocket API — the same
 * role api/client.ts plays for fetch — so PresenceContext never has to
 * think about reconnect timing itself.
 */
export class PresenceSocket {
  private readonly url: string
  private readonly handlers: PresenceSocketHandlers
  private socket: WebSocket | null = null
  private retryDelayMs = INITIAL_RETRY_DELAY_MS
  private reconnectTimeoutId: number | null = null
  private closedByCaller = false

  constructor(url: string, handlers: PresenceSocketHandlers) {
    this.url = url
    this.handlers = handlers
  }

  connect(): void {
    this.closedByCaller = false
    this.openSocket()
  }

  private openSocket(): void {
    this.handlers.onStatusChange('connecting')
    const socket = new WebSocket(this.url)
    this.socket = socket

    socket.onopen = () => {
      this.retryDelayMs = INITIAL_RETRY_DELAY_MS
      this.handlers.onStatusChange('open')
    }

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage
        this.handlers.onMessage(message)
      } catch {
        // A malformed frame shouldn't crash the whole presence feature.
      }
    }

    socket.onclose = () => {
      this.handlers.onStatusChange('closed')
      if (!this.closedByCaller) {
        this.scheduleReconnect()
      }
    }

    socket.onerror = () => {
      // The browser always follows an error with a close event, so
      // reconnect scheduling stays in one place (onclose) rather than
      // being duplicated here.
      socket.close()
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimeoutId = window.setTimeout(() => {
      this.openSocket()
    }, this.retryDelayMs)
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, MAX_RETRY_DELAY_MS)
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message))
    }
  }

  /** Closes the connection permanently — no further reconnect attempts. */
  close(): void {
    this.closedByCaller = true
    if (this.reconnectTimeoutId !== null) {
      window.clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
    this.socket?.close()
    this.socket = null
  }
}
