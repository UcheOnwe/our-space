import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchWatchSessionStatus, loadVideo, setPlaybackState } from './api'
import type { PlaybackStatus, WatchSessionData } from './types'

// Reliability over precision, per the approved scope: a simple fixed
// interval while this screen is open, no backoff, no WebSockets.
const POLL_INTERVAL_MS = 2000

interface WatchState {
  status: 'loading' | 'ready'
  videoLoaded: boolean
  session: WatchSessionData | null
}

interface WatchContextValue extends WatchState {
  loadVideo: (url: string) => Promise<void>
  setPlaybackState: (status: PlaybackStatus, positionSeconds: number) => Promise<void>
}

const WatchContext = createContext<WatchContextValue | null>(null)

/**
 * Mounted only around the Watch Together screen (see CoupleGate), not
 * app-wide like AuthProvider/CoupleProvider — this state is only ever
 * needed while that screen is actually open.
 */
export function WatchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WatchState>({ status: 'loading', videoLoaded: false, session: null })

  const applyResponse = useCallback((response: { video_loaded: boolean; session: WatchSessionData | null }) => {
    setState({ status: 'ready', videoLoaded: response.video_loaded, session: response.session })
  }, [])

  useEffect(() => {
    // Same bootstrap-with-guard shape as AuthContext/CoupleContext.
    let cancelled = false

    async function bootstrap() {
      const response = await fetchWatchSessionStatus()
      if (!cancelled) applyResponse(response)
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [applyResponse])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchWatchSessionStatus().then(applyResponse)
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [applyResponse])

  async function loadVideoAction(url: string) {
    const response = await loadVideo(url)
    applyResponse(response)
  }

  async function setPlaybackStateAction(status: PlaybackStatus, positionSeconds: number) {
    const response = await setPlaybackState(status, positionSeconds)
    applyResponse(response)
  }

  return (
    <WatchContext.Provider
      value={{ ...state, loadVideo: loadVideoAction, setPlaybackState: setPlaybackStateAction }}
    >
      {children}
    </WatchContext.Provider>
  )
}

export function useWatch(): WatchContextValue {
  const context = useContext(WatchContext)
  if (!context) {
    throw new Error('useWatch must be used within a WatchProvider')
  }
  return context
}
