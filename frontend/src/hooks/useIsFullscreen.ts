import { useEffect, useState } from 'react'

/**
 * Tracks whether the document currently has a fullscreen element — true
 * whether OUR OWN code requested it or some embedded content did (e.g.
 * clicking the fullscreen button inside a YouTube iframe still makes the
 * iframe element itself `document.fullscreenElement` on the host page).
 * Generic browser-capability wrapper, not tied to video/presence.
 */
export function useIsFullscreen(): boolean {
  // Boolean(...) rather than `!== null`: real browsers always report `null`
  // when nothing is fullscreen, but jsdom (our test environment) doesn't
  // implement this property at all and reads back `undefined` — a plain
  // truthiness check treats both the same way.
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  return isFullscreen
}
