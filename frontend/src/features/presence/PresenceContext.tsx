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
  selfUserId: number | null
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
    selfUserId: null,
    selfAvatar: null,
    partner: null,
    activeInteraction: null,
    ripples: [],
  })
  const socketRef = useRef<PresenceSocket | null>(null)
  // Mirrors state.selfUserId for handlers that need a synchronous read
  // outside a setState updater (addRipple below is itself a setState call,
  // so it can't be invoked from inside another updater's function body).
  const selfUserIdRef = useRef<number | null>(null)
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
    // Connection identity is NOT user identity: this same authenticated
    // user can have more than one connection open at once (another
    // device, another tab). The server's own "skip the sender" logic
    // (see presence/consumers.py) only skips the exact connection that
    // sent an event — it deliberately does NOT skip this user's OTHER
    // connections, which legitimately need to know about (say) a
    // disconnect on connection A while connection B stays open. Every
    // "who is this event about" payload therefore always carries a real
    // `userId`, and this is the ONE place that checks it: before this fix,
    // every handler below just assumed "not from my own socket" meant
    // "from my partner," which silently broke the instant a user opened
    // a second connection — their OWN movement from device A would arrive
    // on device B and get written into `partner` (rendered with the
    // partner's avatar/color), because nothing ever compared the event's
    // userId against this client's own. Root cause was entirely here on
    // the frontend: the backend already sent the correct userId on every
    // one of these messages the whole time.
    function isAboutSelf(userId: number, selfUserId: number | null): boolean {
      return selfUserId !== null && userId === selfUserId
    }

    function handleMessage(message: ServerMessage) {
      switch (message.type) {
        case 'presence.state':
          selfUserIdRef.current = message.self.userId
          setState((prev) => ({
            ...prev,
            selfUserId: message.self.userId,
            selfAvatar: message.self.avatar,
            partner: message.partner,
          }))
          break
        case 'presence.join':
          setState((prev) => {
            if (isAboutSelf(message.userId, prev.selfUserId)) return prev
            return {
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
            }
          })
          break
        case 'presence.move':
          setState((prev) => {
            if (isAboutSelf(message.userId, prev.selfUserId)) return prev
            return prev.partner
              ? { ...prev, partner: { ...prev.partner, x: message.x, y: message.y, online: true } }
              : prev
          })
          break
        case 'presence.leave':
          setState((prev) => {
            if (isAboutSelf(message.userId, prev.selfUserId)) return prev
            return prev.partner ? { ...prev, partner: { ...prev.partner, online: false, visible: true } } : prev
          })
          break
        case 'presence.click':
          // Only the partner's clicks should ever produce a ripple here —
          // the server deliberately doesn't echo a click back to its own
          // sending CONNECTION (see presence/consumers.py), but a second
          // connection belonging to the same user is a different
          // connection and would otherwise get this too; sendClick below
          // already shows the local click optimistically, so this must
          // never fire for the user's own click arriving from elsewhere.
          // Reads the ref (not state) since addRipple is itself a setState
          // call, which can't be invoked from inside another updater.
          if (isAboutSelf(message.userId, selfUserIdRef.current)) return
          addRipple(message.x, message.y)
          break
        case 'presence.visibility':
          // Video temporarily covering the partner's avatar — NOT a
          // disconnect. Deliberately does not touch `online`.
          setState((prev) => {
            if (isAboutSelf(message.userId, prev.selfUserId)) return prev
            return prev.partner
              ? { ...prev, partner: { ...prev.partner, visible: message.state === 'visible' } }
              : prev
          })
          break
        case 'presence.location':
          // Couple-wide metadata about which feature the partner is
          // currently in — only meaningful while they're not online here.
          setState((prev) => {
            if (isAboutSelf(message.userId, prev.selfUserId)) return prev
            return prev.partner ? { ...prev, partner: { ...prev.partner, currentFeature: message.feature } } : prev
          })
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
