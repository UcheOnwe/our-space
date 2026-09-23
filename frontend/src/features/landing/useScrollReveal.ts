import { useEffect, useRef, useState } from 'react'

/**
 * The landing page's ONE motion primitive for "reveal when scrolled into
 * view" (and, doubling as the same signal, "don't mount an expensive
 * video element until it's actually about to be seen" — see
 * VideoReveal.tsx) — a thin wrapper over the browser's own
 * IntersectionObserver, not an animation library (the project has none,
 * and this task deliberately doesn't add one).
 *
 * Respects `prefers-reduced-motion` at the SOURCE for TEXT/IMAGE reveal
 * animations: when the user has it set, this returns `isVisible: true`
 * immediately and never creates an observer at all — callers don't need
 * their own reduced-motion branch for the "should this be revealed"
 * question, only for how large a transform/transition they apply once it
 * is (see e.g. RoomReveal.module.css's `@media (prefers-reduced-motion:
 * reduce)` block, which flattens those transitions to instant).
 *
 * `skipReducedMotionShortcut` (default false) opts OUT of that shortcut —
 * for a caller where "is this visible" answers a completely different
 * question than "should an entrance animation play." VideoReveal.tsx is
 * the one caller that sets this: whether to lazily mount an expensive
 * `<video>` is a BANDWIDTH concern, not a motion-preference one — a
 * visitor with reduced motion enabled still scrolls the page normally and
 * still shouldn't have all six videos start downloading at once. (This
 * was a real bug caught during implementation: without this flag, EVERY
 * video on the page mounted immediately in any reduced-motion context,
 * exactly the "never load all landing videos on initial page load"
 * failure mode this component exists to prevent.)
 *
 * `once` (default true): after the first reveal, the observer disconnects
 * — sections don't re-hide when scrolled past and back, matching "don't
 * overanimate" from the approved plan. Pass `false` for something that
 * should genuinely track visibility continuously (see VideoReveal.tsx,
 * which uses this to know when to pause an off-screen video).
 */
export function useScrollReveal<T extends HTMLElement>(options?: {
  threshold?: number
  once?: boolean
  skipReducedMotionShortcut?: boolean
}) {
  const { threshold = 0.2, once = true, skipReducedMotionShortcut = false } = options ?? {}
  const ref = useRef<T | null>(null)
  // A lazy initializer, not a plain `useState(false)` + effect-set: the
  // reduced-motion check needs no ref/DOM measurement, so it can resolve
  // during the FIRST render instead of triggering an extra one from
  // inside an effect.
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === 'undefined') return false
    return !skipReducedMotionShortcut && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (!skipReducedMotionShortcut && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      // Already resolved by the lazy initializer above — no observer
      // needed at all for this caller.
      return
    }

    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      // No IntersectionObserver support (or nothing to observe yet) —
      // fail open to visible rather than permanently hiding content.
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
        if (entry.isIntersecting && once) observer.disconnect()
      },
      { threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold, once, skipReducedMotionShortcut])

  return { ref, isVisible }
}
