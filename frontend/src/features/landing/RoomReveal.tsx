import { useScrollReveal } from './useScrollReveal'
import { VideoReveal } from './VideoReveal'
import { FullBleedSection } from './FullBleedSection'
import styles from './RoomReveal.module.css'

/**
 * The cinematic "product reveal" — deliberately a real screenshot of the
 * app (After Hours' main room, nav chrome included), not a mockup or
 * illustration made for marketing. That authenticity IS the point: this
 * is the actual product, not a rendering of an idea.
 */
export function RoomReveal() {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <FullBleedSection background="var(--landing-dark)">
      <div ref={ref} className={`${styles.wrap} ${isVisible ? styles.visible : ''}`}>
        <h2 className={styles.headline}>This isn't another chat window. It's your place.</h2>
        <div className={styles.stillFrame}>
          <img className={styles.still} src="/landing/room-reveal.jpg" alt="A couple's shared After Hours room in Our Space, shown in the live app" loading="lazy" />
        </div>
        <div className={styles.videoRow}>
          <VideoReveal src="/landing/room-selection.mp4" ariaLabel="Browsing between rooms in Our Space" className={styles.videoFrame} />
        </div>
      </div>
    </FullBleedSection>
  )
}
