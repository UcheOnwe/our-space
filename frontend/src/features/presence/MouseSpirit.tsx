import styles from './MouseSpirit.module.css'

interface MouseSpiritProps {
  /** Which seat this avatar represents — decides its accent color only. */
  variant: 'A' | 'B'
  online: boolean
  hugging?: boolean
  /** Which way the arm should reach for the hug — toward the partner. */
  leanTowards?: 'left' | 'right'
  /** Accessible name — callers know whether this is "you" or "your
   * partner"; this component only knows how to draw a mouse. */
  label: string
}

/**
 * The Mouse Spirit avatar. Body parts are separate SVG groups (body, ears,
 * face, arm, tail) specifically so the arm can animate independently for
 * the hug pose — see MouseSpirit.module.css for the actual motion, driven
 * by the `hugging`/`leanTowards` props toggling CSS classes (no animation
 * library: plain CSS transitions/keyframes).
 */
export function MouseSpirit({ variant, online, hugging = false, leanTowards, label }: MouseSpiritProps) {
  const classes = [
    styles.mouse,
    variant === 'B' ? styles.variantB : styles.variantA,
    online ? styles.online : styles.offline,
    hugging ? styles.hugging : '',
    hugging && leanTowards === 'left' ? styles.leanLeft : '',
    hugging && leanTowards === 'right' ? styles.leanRight : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <svg viewBox="0 0 100 100" className={classes} role="img" aria-label={label}>
      <g className={styles.tail}>
        <path d="M 62 78 Q 88 78 84 58" fill="none" strokeWidth="3" strokeLinecap="round" />
      </g>

      <g className={styles.arm}>
        <ellipse cx="70" cy="66" rx="7" ry="14" />
      </g>

      <g className={styles.body}>
        <ellipse cx="50" cy="62" rx="26" ry="22" />
        <circle className={styles.ear} cx="30" cy="34" r="12" />
        <circle className={styles.ear} cx="62" cy="30" r="14" />
      </g>

      <g className={styles.face}>
        <circle className={styles.cheek} cx="36" cy="60" r="5" />
        <circle className={styles.cheek} cx="60" cy="60" r="5" />
        {online ? (
          <>
            <circle className={styles.eye} cx="42" cy="54" r="3" />
            <circle className={styles.eye} cx="58" cy="54" r="3" />
          </>
        ) : (
          <>
            <path className={styles.eyeClosed} d="M 39 54 Q 42 57 45 54" fill="none" strokeWidth="2" strokeLinecap="round" />
            <path className={styles.eyeClosed} d="M 55 54 Q 58 57 61 54" fill="none" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
        <circle className={styles.nose} cx="50" cy="61" r="2.4" />
      </g>
    </svg>
  )
}
