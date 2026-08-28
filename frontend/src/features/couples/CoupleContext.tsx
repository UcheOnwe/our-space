import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { cancelPendingPairing, createCouple, fetchCoupleStatus, joinCouple } from './api'
import type { Couple, CoupleStatus, Invite } from './types'

const POLL_INTERVAL_MS = 4000

interface CoupleState {
  status: CoupleStatus
  couple: Couple | null
  invite: Invite | null
}

interface CoupleContextValue extends CoupleState {
  createSpace: () => Promise<void>
  joinSpace: (code: string) => Promise<void>
  cancelPairing: () => Promise<void>
}

const CoupleContext = createContext<CoupleContextValue | null>(null)

export function CoupleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CoupleState>({ status: 'loading', couple: null, invite: null })

  const refresh = useCallback(async () => {
    const response = await fetchCoupleStatus()
    setState({
      status: response.status,
      couple: response.couple ?? null,
      invite: response.invite ?? null,
    })
  }, [])

  useEffect(() => {
    // Mirrors AuthContext's bootstrap guard: an inline async function with
    // a `cancelled` flag, rather than calling the shared `refresh` callback
    // directly, so a setState never fires after this component unmounts.
    let cancelled = false

    async function bootstrap() {
      const response = await fetchCoupleStatus()
      if (!cancelled) {
        setState({
          status: response.status,
          couple: response.couple ?? null,
          invite: response.invite ?? null,
        })
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  // Polling, not WebSockets, per this slice's scope: while waiting for a
  // partner, re-check the couple-status endpoint every few seconds until
  // it reports "paired".
  useEffect(() => {
    if (state.status !== 'waiting') return

    const intervalId = window.setInterval(() => {
      refresh()
    }, POLL_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [state.status, refresh])

  async function createSpace() {
    await createCouple()
    // Re-fetch from couple-status rather than trusting the create response
    // body, the same "server is the source of truth" principle used for
    // auth (which verifies via the user-profile endpoint after login).
    await refresh()
  }

  async function joinSpace(code: string) {
    await joinCouple(code)
    await refresh()
  }

  async function cancelPairing() {
    await cancelPendingPairing()
    // Re-fetch rather than assuming "none" locally — same server-is-truth
    // principle as createSpace/joinSpace above.
    await refresh()
  }

  return (
    <CoupleContext.Provider value={{ ...state, createSpace, joinSpace, cancelPairing }}>
      {children}
    </CoupleContext.Provider>
  )
}

export function useCouple(): CoupleContextValue {
  const context = useContext(CoupleContext)
  if (!context) {
    throw new Error('useCouple must be used within a CoupleProvider')
  }
  return context
}
