import { useEffect, useState } from 'react'
import type { HallwayDestination } from './hallwayDestinations'
import styles from './HallwayNavigation.module.css'

interface HallwayNavigationProps {
  destinations: HallwayDestination[]
}

// Small delay before the destination list starts animating in — "I
// walked to the hallway, THEN I see where I can go," not everything
// appearing the instant the close-up itself is still settling in.
const REVEAL_DELAY_MS = 150
// Stagger between each destination button's own entrance.
const STAGGER_MS = 90

/**
 * The Door hotspot's close-up content — a short, data-driven list of real
 * navigation destinations (see hallwayDestinations.ts), revealed with a
 * restrained fade/rise/stagger rather than appearing all at once. Stays
 * completely agnostic of WHAT a destination does; it only renders labels/
 * icons and calls `onSelect`.
 */
export function HallwayNavigation({ destinations }: HallwayNavigationProps) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setRevealed(true), REVEAL_DELAY_MS)
    return () => window.clearTimeout(timeoutId)
  }, [])

  return (
    <div className={styles.panel}>
      <p className={styles.prompt}>Where to?</p>
      <div className={styles.list}>
        {destinations.map((destination, index) => (
          <button
            key={destination.id}
            type="button"
            className={`${styles.destination} ${revealed ? styles.destinationRevealed : ''}`}
            style={{ transitionDelay: `${index * STAGGER_MS}ms` }}
            onClick={destination.onSelect}
          >
            <span aria-hidden="true">{destination.icon}</span>
            {destination.label}
          </button>
        ))}
      </div>
    </div>
  )
}
