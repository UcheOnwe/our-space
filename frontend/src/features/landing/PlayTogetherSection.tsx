import { useScrollReveal } from './useScrollReveal'
import { VideoReveal } from './VideoReveal'
import { FullBleedSection } from './FullBleedSection'
import styles from './PlayTogetherSection.module.css'

/**
 * Room -> gaming area -> gameplay. The still is a real screenshot of the
 * GamePlayer running an 8-Ball Pool game inside the gaming close-up
 * (confirmed by direct visual inspection — its source filename mentions
 * "pool," which is the game, not a swimming pool) — the gaming area is
 * part of the space itself, not a separate site bolted on.
 */
export function PlayTogetherSection() {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <FullBleedSection>
      <div ref={ref} className={`${styles.wrap} ${isVisible ? styles.visible : ''}`}>
        <div className={styles.copy}>
          <h2 className={styles.headline}>Play together, without leaving the room.</h2>
          <p className={styles.body}>The gaming area is part of your space — sit down, pick a game, and play.</p>
        </div>
        <div className={styles.mediaStack}>
          <img
            className={styles.still}
            src="/landing/play-together.jpg"
            alt="A game running in the gaming area of an Our Space room"
            loading="lazy"
          />
          <VideoReveal src="/landing/gameplay.mp4" ariaLabel="Gameplay inside the Our Space gaming area" className={styles.videoFrame} />
        </div>
      </div>
    </FullBleedSection>
  )
}
