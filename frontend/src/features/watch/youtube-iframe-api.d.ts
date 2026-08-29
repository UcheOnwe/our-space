// Minimal ambient types for the parts of the YouTube IFrame Player API this
// app actually uses. Not the full API surface — just enough to avoid `any`
// without adding a dependency (e.g. @types/youtube) for it.
export {}

declare global {
  interface Window {
    YT: typeof YT
    onYouTubeIframeAPIReady?: () => void
  }

  namespace YT {
    enum PlayerState {
      UNSTARTED = -1,
      ENDED = 0,
      PLAYING = 1,
      PAUSED = 2,
      BUFFERING = 3,
      CUED = 5,
    }

    interface OnStateChangeEvent {
      data: PlayerState
    }

    interface PlayerEvents {
      onReady?: () => void
      onStateChange?: (event: OnStateChangeEvent) => void
      onError?: () => void
    }

    interface PlayerOptions {
      videoId: string
      playerVars?: Record<string, unknown>
      events?: PlayerEvents
    }

    class Player {
      constructor(element: HTMLElement, options: PlayerOptions)
      playVideo(): void
      pauseVideo(): void
      seekTo(seconds: number, allowSeekAhead: boolean): void
      getCurrentTime(): number
      destroy(): void
    }
  }
}
