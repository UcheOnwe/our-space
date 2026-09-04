import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { PresenceSocket } from './socket'
import type { ConnectionStatus } from './socket'
import type { ActiveInteraction, Avatar, FeatureName, PartnerInfo, ServerMessage, Visibility } from './types'

// ~20 messages/second cap on outgoing movement, per the approved scope.
const MOVE_THROTTLE_MS = 50
const HUG_DURATION_MS = 1800
// Must match ClickRipple.module.css's animation-duration — the ripple is
// removed from state exactly when its CSS animation finishes.
const RIPPLE_DURATION_MS = 550

export interface ClickRippleState {
  id: number
  x: number
  y: number
}

interface PresenceState {
  connectionStatus: ConnectionStatus
  selfAvatar: Avatar | null
  partner: PartnerInfo | null
  activeInteraction: ActiveInteraction | null
  ripples: ClickRippleState[]
}

interface PresenceContextValue extends PresenceState {
  sendMove: (x: number, y: number) => void
  sendClick: (x: number, y: number) => void
  sendHug: () => void
  sendVisibility: (state: Visibility) => void
}

const PresenceContext = createContext<PresenceContextValue | null>(null)

function buildSocketUrl(feature: FeatureName): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/presence/${feature}/`
}

/**
 * Owns the realtime presence connection and the partner's live state for
 * ONE feature room (`feature` — "home" or "watch").
 *
 * Deliberately scoped to wherever it's mounted (Couple Home and Watch
 * Together each get their own instance — see CoupleGate) rather than
 * app-wide like AuthProvider/CoupleProvider. Mounting/unmounting IS what
 * produces the sleeping/grayed-out "partner left this feature" behavior —
 * see presence/consumers.py for why the room itself is scoped by
 * (couple, feature), not just couple.
 */
export function PresenceProvider({ feature, children }: { feature: FeatureName; children: ReactNode }) {
  const [state, setState] = useState<PresenceState>({
    connectionStatus: 'connecting',
    selfAvatar: null,
    partner: null,
    activeInteraction: null,
    ripples: [],
  })
  const socketRef = useRef<PresenceSocket | null>(null)
  const lastMoveSentAtRef = useRef(0)
  const hugTimeoutRef = useRef<number | null>(null)
  const nextRippleIdRef = useRef(0)
  const rippleTimeoutIdsRef = useRef<Set<number>>(new Set())

  // Shared by both the sender (sendClick, optimistic/local) and the
  // receiver (an incoming presence.click message) — one ripple is one
  // ripple regardless of whose click produced it.
  function addRipple(x: number, y: number) {
    const id = nextRippleIdRef.current++
    setState((prev) => ({ ...prev, ripples: [...prev.ripples, { id, x, y }] }))
    const timeoutId = window.setTimeout(() => {
      rippleTimeoutIdsRef.current.delete(timeoutId)
      setState((prev) => ({ ...prev, ripples: prev.ripples.filter((ripple) => ripple.id !== id) }))
    }, RIPPLE_DURATION_MS)
    rippleTimeoutIdsRef.current.add(timeoutId)
  }

  useEffect(() => {
    function handleMessage(message: ServerMessage) {
      switch (message.type) {
        case 'presence.state':
          setState((prev) => ({ ...prev, selfAvatar: message.self.avatar, partner: message.partner }))
          break
        case 'presence.join':
          setState((prev) => ({
            ...prev,
            partner: prev.partner
              ? { ...prev.partner, online: true, visible: true }
              : {
                  userId: message.userId,
                  avatar: message.avatar,
                  online: true,
                  x: 0.5,
                  y: 0.5,
                  visible: true,
                  currentFeature: null,
                },
          }))
          break
        case 'presence.move':
          setState((prev) =>
            prev.partner
              ? { ...prev, partner: { ...prev.partner, x: message.x, y: message.y, online: true } }
              : prev,
          )
          break
        case 'presence.leave':
          setState((prev) =>
            prev.partner ? { ...prev, partner: { ...prev.partner, online: false, visible: true } } : prev,
          )
          break
        case 'presence.click':
          // Only the partner's clicks arrive this way — the server
          // deliberately doesn't echo a click back to its own sender (see
          // presence/consumers.py); sendClick below shows that side
          // optimistically instead of waiting on a round-trip.
          addRipple(message.x, message.y)
          break
        case 'presence.visibility':
          // Video temporarily covering the partner's avatar — NOT a
          // disconnect. Deliberately does not touch `online`.
          setState((prev) =>
            prev.partner
              ? { ...prev, partner: { ...prev.partner, visible: message.state === 'visible' } }
              : prev,
          )
          break
        case 'presence.location':
          // Couple-wide metadata about which feature the partner is
          // currently in — only meaningful while they're not online here.
          setState((prev) =>
            prev.partner ? { ...prev, partner: { ...prev.partner, currentFeature: message.feature } } : prev,
          )
          break
        case 'interaction.hug':
          if (hugTimeoutRef.current !== null) window.clearTimeout(hugTimeoutRef.current)
          setState((prev) => ({
            ...prev,
            activeInteraction: { kind: 'hug', fromUserId: message.fromUserId, startedAt: Date.now() },
          }))
          hugTimeoutRef.current = window.setTimeout(() => {
            setState((prev) => ({ ...prev, activeInteraction: null }))
          }, HUG_DURATION_MS)
          break
      }
    }

    const socket = new PresenceSocket(buildSocketUrl(feature), {
      onStatusChange: (connectionStatus) => setState((prev) => ({ ...prev, connectionStatus })),
      onMessage: handleMessage,
    })
    socketRef.current = socket
    socket.connect()

    const rippleTimeoutIds = rippleTimeoutIdsRef.current
    return () => {
      socket.close()
      if (hugTimeoutRef.current !== null) window.clearTimeout(hugTimeoutRef.current)
      rippleTimeoutIds.forEach((id) => window.clearTimeout(id))
      rippleTimeoutIds.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature])

  function sendMove(x: number, y: number) {
    const now = Date.now()
    if (now - lastMoveSentAtRef.current < MOVE_THROTTLE_MS) return
    lastMoveSentAtRef.current = now
    socketRef.current?.send({ type: 'presence.move', x, y })
  }

  function sendClick(x: number, y: number) {
    socketRef.current?.send({ type: 'presence.click', x, y })
    addRipple(x, y)
  }

  function sendHug() {
    socketRef.current?.send({ type: 'interaction.hug' })
  }

  function sendVisibility(visibilityState: Visibility) {
    socketRef.current?.send({ type: 'presence.visibility', state: visibilityState })
  }

  return (
    <PresenceContext.Provider value={{ ...state, sendMove, sendClick, sendHug, sendVisibility }}>
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence(): PresenceContextValue {
  const context = useContext(PresenceContext)
  if (!context) {
    throw new Error('usePresence must be used within a PresenceProvider')
  }
  return context
}
