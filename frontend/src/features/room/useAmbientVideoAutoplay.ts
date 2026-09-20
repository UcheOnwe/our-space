import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Ambient/background `<video>` elements (the Cozy Loft main room, the TV
 * and Gaming close-ups) need to already be playing the instant they
 * become visible — a native Play button showing up breaks the "this is
 * the room" illusion completely. The `autoplay` HTML attribute alone
 * isn't reliable for a video React mounts dynamically (as opposed to one
 * present in the page's initial HTML): real iPhone Safari testing showed
 * it landing paused with its native play button visible despite
 * `autoPlay`/`muted`/`playsInline` all being set correctly.
 *
 * This explicitly calls `.play()` once the element exists. If the
 * browser's autoplay policy still rejects that call, it retries exactly
 * once, on the user's first pointer interaction anywhere in the app (a
 * real tap/click always counts as a user gesture, which every autoplay
 * policy accepts) — never a loop of retries, and never anything that
 * blocks rendering while it waits.
 */
export function useAmbientVideoAutoplay(videoRef: RefObject<HTMLVideoElement | null>) {
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let cancelled = false

    function retryOnInteraction() {
      if (cancelled) return
      video?.play()?.catch(() => {
        // Still refused — an unrelated/unsupported case at that point;
        // nothing further to retry on rather than looping indefinitely.
      })
    }

    // `.play()` always returns a real Promise in every real browser — the
    // optional chaining here only guards jsdom's test-environment
    // `HTMLMediaElement.play`, which returns `undefined` rather than a
    // Promise unless a test explicitly mocks it.
    video.play()?.catch(() => {
      if (!cancelled) document.addEventListener('pointerdown', retryOnInteraction, { once: true })
    })

    return () => {
      cancelled = true
      document.removeEventListener('pointerdown', retryOnInteraction)
    }
  }, [videoRef])
}
