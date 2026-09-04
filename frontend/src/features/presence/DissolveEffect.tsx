import styles from './DissolveEffect.module.css'

interface DissolveEffectProps {
  x: number
  y: number
}

/**
 * A brief scatter of small dust motes at an avatar's position — plays once
 * when it dissolves into or reforms out of the video-hidden state (see
 * PresenceOverlay). Same structural pattern as HugAnimation: a handful of
 * pre-rendered elements with staggered CSS keyframes, not a particle engine.
 */
export function DissolveEffect({ x, y }: DissolveEffectProps) {
  return (
    <div className={styles.wrapper} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <span key={index} className={`${styles.mote} ${styles[`mote${index}`]}`} />
      ))}
    </div>
  )
}
