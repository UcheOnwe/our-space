import { useScrollReveal } from './useScrollReveal'
import { VideoReveal } from './VideoReveal'
import { FullBleedSection } from './FullBleedSection'
import styles from './ExploreSection.module.css'

/**
 * Environments have depth — a user isn't picking a wallpaper, they're
 * exploring connected areas (door, hallway, garage, gaming room). The
 * still is a real close-up mid-navigation ("Where to? -> Garage"); the
 * video is a real hallway/game-room/garage exploration tour.
 */
export function ExploreSection() {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <FullBleedSection background="var(--landing-dark)">
      <div ref={ref} className={`${styles.wrap} ${isVisible ? styles.visible : ''}`}>
        <h2 className={styles.headline}>Explore your space.</h2>
        <p className={styles.body}>A door, a hallway, a garage — your space goes further than one room.</p>
        <div className={styles.mediaGrid}>
          <img
            className={styles.still}
            src="/landing/explore-door.jpg"
            alt="Choosing where to go from the door of an Our Space room"
            loading="lazy"
          />
          <VideoReveal
            src="/landing/explore-tour.mp4"
            ariaLabel="Exploring the hallway, game room, and garage of an Our Space environment"
            className={styles.videoFrame}
          />
        </div>
      </div>
    </FullBleedSection>
  )
}
