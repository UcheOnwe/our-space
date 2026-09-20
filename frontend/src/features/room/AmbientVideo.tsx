import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useAmbientVideoAutoplay } from './useAmbientVideoAutoplay'

interface AmbientVideoProps {
  src: string
  /** A real extracted frame from this exact video (see the room's own
   * `public/cozy-loft/*-poster.jpg` files) — not a placeholder graphic.
   * The native `poster` attribute is what lets the browser paint this
   * immediately, before any video data has arrived, and hands off to the
   * live frame automatically/seamlessly the moment playback actually
   * starts; nothing here has to script that handoff itself. */
  posterSrc: string
  loop?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * The shared "environmental/ambient video" element — the room, the TV
 * close-up, and the Gaming close-up all render one of these rather than a
 * bare `<video>`. Two things make this different from a plain video tag:
 *
 * 1. `poster` gives the browser something real to paint on the very first
 *    frame, before any video bytes have arrived — without it, mobile
 *    Safari specifically shows its own "not yet playing" presentation
 *    (a large native tap-to-play affordance) over a blank/black element
 *    while it decides whether to honor autoplay, which is exactly the
 *    "refresh -> giant Play button -> autoplay starts" sequence real
 *    device testing found. A poster makes the room visually exist from
 *    the very first paint instead.
 * 2. `useAmbientVideoAutoplay` (see its own doc comment) explicitly calls
 *    `.play()` and retries once on the user's first interaction if the
 *    browser's autoplay policy still refuses it initially.
 *
 * Together these are the standard, most effective known combination for
 * this iOS Safari behavior — real device confirmation is still the last
 * word (per the caller's own report), but there is no further
 * script-driven "hide the play button" step: the poster and explicit
 * `.play()` are what remove the NEED for one, rather than covering one up
 * while leaving the video paused.
 */
export const AmbientVideo = forwardRef<HTMLVideoElement, AmbientVideoProps>(function AmbientVideo(
  { src, posterSrc, loop = true, className, style },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement)
  useAmbientVideoAutoplay(videoRef)

  return (
    <video
      ref={videoRef}
      className={className}
      style={style}
      src={src}
      poster={posterSrc}
      autoPlay
      muted
      loop={loop}
      playsInline
      aria-hidden="true"
    />
  )
})
