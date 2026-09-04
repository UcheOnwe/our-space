import styles from './HugAnimation.module.css'

interface HugAnimationProps {
  /** Normalized 0-1 position within the stage where the hug is centered. */
  x: number
  y: number
}

const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'

/**
 * Exactly three hearts floating upward, per the approved design — an
 * inline SVG shape (not an emoji), so it stays on-theme and renders
 * consistently everywhere. Mounted only while a hug is active (see
 * PresenceStage), so it owns no show/hide state itself, just the motion.
 */
export function HugAnimation({ x, y }: HugAnimationProps) {
  return (
    <div className={styles.wrapper} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <svg key={index} viewBox="0 0 24 24" className={`${styles.heart} ${styles[`heart${index}`]}`}>
          <path d={HEART_PATH} fill="currentColor" />
        </svg>
      ))}
    </div>
  )
}
