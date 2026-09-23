import { useScrollReveal } from './useScrollReveal'
import styles from './VideoReveal.module.css'

interface VideoRevealProps {
  src: string
  className?: string
  ariaLabel: string
  /** Per-asset frame ratio, e.g. `'16 / 9'` or `'3 / 4'` — this page's six
   * source clips are NOT all the same shape (confirmed via each video's own
   * `videoWidth`/`videoHeight`: four are landscape 16:9, two — the couple-hug
   * and browser-companion clips — are natively portrait, ~3:4). Forcing every
   * clip into one universal frame silently `object-fit: cover`-crops whichever
   * ones don't match it; the caller supplies the real ratio instead. Defaults
   * to 16:9 since that covers most of this page's clips. */
  aspectRatio?: string
}

/**
 * A demonstration clip that costs NOTHING until it's actually about to be
 * seen: the `<video>` element itself is only mounted into the DOM once
 * `useScrollReveal` reports this section is in view (`once: false`, since
 * a video — unlike a one-time text/image reveal — should genuinely pause
 * again if the visitor scrolls back past it, rather than keep playing
 * off-screen forever). Nothing before that point issues any network
 * request for this clip; with six real videos on this page, that's the
 * difference between "one clip loads at a time, roughly" and "six
 * simultaneous downloads on first paint."
 *
 * Always muted+loop+playsInline+autoPlay: these are ambient, silent
 * "show, don't tell" loops (the brief's own framing), not media with a
 * soundtrack or a scrub bar — a muted autoplaying video is also the one
 * kind every mobile browser will actually autoplay without a user
 * gesture. No poster attribute: there's no frame-extraction tool on this
 * machine to generate one (see optimize-landing-assets.mjs's own doc
 * comment), and since the element mounts right as it scrolls into view
 * and starts playing immediately, there's no meaningful idle gap for a
 * poster to cover.
 */
export function VideoReveal({ src, className, ariaLabel, aspectRatio = '16 / 9' }: VideoRevealProps) {
  // `skipReducedMotionShortcut`: see useScrollReveal.ts's own doc comment
  // — lazy-mounting a video is a bandwidth decision, not a motion one.
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>({ once: false, skipReducedMotionShortcut: true })
  const classes = [styles.frame, className].filter(Boolean).join(' ')

  return (
    <div ref={ref} className={classes} style={{ aspectRatio }}>
      {isVisible && (
        <video className={styles.video} src={src} aria-label={ariaLabel} autoPlay muted loop playsInline preload="metadata" />
      )}
    </div>
  )
}
