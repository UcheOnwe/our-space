import { useEffect, useRef } from 'react'
import { estimatePosition, hasDrifted, shouldApplyRemoteState } from './sync'
import type { PlaybackStatus } from './types'
import styles from './YouTubePlayer.module.css'

// Loads the IFrame Player API script exactly once, however many
// YouTubePlayer instances mount across the app's lifetime.
let iframeApiPromise: Promise<void> | null = null
function loadIframeApi(): Promise<void> {
  if (!iframeApiPromise) {
    iframeApiPromise = new Promise((resolve) => {
      if (window.YT?.Player) {
        resolve()
        return
      }
      const previous = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        previous?.()
        resolve()
      }
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(script)
    })
  }
  return iframeApiPromise
}

interface YouTubePlayerProps {
  videoId: string
  remoteState: { status: PlaybackStatus; position: number }
  onLocalStateChange: (status: PlaybackStatus, position: number) => void
  onError: (message: string) => void
}

/**
 * Wraps the YouTube IFrame Player API lifecycle. This component only
 * reports what happened locally (via onLocalStateChange) and applies what
 * it's told (via the remoteState prop) — deciding WHETHER to broadcast or
 * persist anything is the caller's job, keeping this a plain integration
 * wrapper that's easy to reason about separately from sync policy.
 */
export function YouTubePlayer({ videoId, remoteState, onLocalStateChange, onError }: YouTubePlayerProps) {
  const { status: remoteStatus, position: remotePosition } = remoteState
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YT.Player | null>(null)
  const readyRef = useRef(false)
  // While Date.now() < this, incoming onStateChange events are treated as
  // an echo of our OWN programmatic seekTo/play/pause call (which can fire
  // more than one state-change event), not a genuine local user action —
  // otherwise we'd re-broadcast the state we just received, in a loop.
  const suppressUntilRef = useRef(0)
  const lastAppliedRef = useRef({ status: remoteStatus, position: remotePosition, atMs: Date.now() })

  const onLocalStateChangeRef = useRef(onLocalStateChange)
  onLocalStateChangeRef.current = onLocalStateChange
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    let destroyed = false

    loadIframeApi().then(() => {
      if (destroyed || !containerRef.current) return
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { playsinline: 1 },
        events: {
          onReady: () => {
            readyRef.current = true
          },
          onStateChange: (event) => {
            if (Date.now() < suppressUntilRef.current) return
            const player = playerRef.current
            if (!player) return

            const position = player.getCurrentTime()
            if (event.data === window.YT.PlayerState.PLAYING) {
              lastAppliedRef.current = { status: 'playing', position, atMs: Date.now() }
              onLocalStateChangeRef.current('playing', position)
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              lastAppliedRef.current = { status: 'paused', position, atMs: Date.now() }
              onLocalStateChangeRef.current('paused', position)
            }
          },
          onError: () => {
            onErrorRef.current("This video can't be played here — try another link.")
          },
        },
      })
    })

    return () => {
      destroyed = true
      playerRef.current?.destroy()
      playerRef.current = null
      readyRef.current = false
    }
    // Intentionally re-creating the player only when the video itself
    // changes — remoteState updates are applied imperatively below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  // Periodically checks for drift while playing locally — the "simplest
  // reliable" way to catch a seek, since YouTube has no onSeek event.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const player = playerRef.current
      if (!player || !readyRef.current || lastAppliedRef.current.status !== 'playing') return

      const expected = estimatePosition(lastAppliedRef.current.position, lastAppliedRef.current.atMs, true)
      const actual = player.getCurrentTime()
      if (hasDrifted(expected, actual)) {
        lastAppliedRef.current = { status: 'playing', position: actual, atMs: Date.now() }
        onLocalStateChangeRef.current('playing', actual)
      }
    }, 3000)
    return () => window.clearInterval(intervalId)
  }, [])

  // Applies the authoritative remote state whenever it meaningfully differs
  // from what this player is already doing. Deliberately depends on the two
  // primitive fields, not the `remoteState` object itself — the caller
  // creates a new object each render, which would otherwise re-run this
  // effect on every poll tick even when nothing actually changed.
  useEffect(() => {
    const player = playerRef.current
    if (!player || !readyRef.current) return

    const remote = { status: remoteStatus, position: remotePosition }
    const localEstimate = estimatePosition(
      lastAppliedRef.current.position,
      lastAppliedRef.current.atMs,
      lastAppliedRef.current.status === 'playing',
    )
    if (!shouldApplyRemoteState({ status: lastAppliedRef.current.status, position: localEstimate }, remote)) {
      return
    }

    suppressUntilRef.current = Date.now() + 1500
    player.seekTo(remote.position, true)
    if (remote.status === 'playing') {
      player.playVideo()
    } else {
      player.pauseVideo()
    }
    lastAppliedRef.current = { status: remote.status, position: remote.position, atMs: Date.now() }
  }, [remoteStatus, remotePosition])

  return <div ref={containerRef} className={styles.frame} />
}
