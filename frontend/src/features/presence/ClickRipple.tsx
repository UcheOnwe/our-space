import styles from './ClickRipple.module.css'

interface ClickRippleProps {
  x: number
  y: number
}

/**
 * A brief expanding ring at a click/tap location. Purely visual — its
 * lifetime (when it appears, when it's removed) is owned by
 * PresenceContext's ripple list, not by this component.
 */
export function ClickRipple({ x, y }: ClickRippleProps) {
  return <span className={styles.ripple} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} aria-hidden="true" />
}
