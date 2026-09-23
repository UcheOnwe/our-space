import { useScrollReveal } from './useScrollReveal'
import { VideoReveal } from './VideoReveal'
import { FullBleedSection } from './FullBleedSection'
import styles from './WatchTogetherSection.module.css'

/**
 * Room -> TV area -> Watch Together, shown as a real navigation clip
 * rather than explained in a paragraph. The personalized still (a real
 * TV-area example) is presented explicitly as AN EXAMPLE of a
 * personalized space, not something every user automatically gets — see
 * the caption below it.
 */
export function WatchTogetherSection() {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <FullBleedSection background="var(--accent-secondary-bg)">
      <div ref={ref} className={`${styles.wrap} ${isVisible ? styles.visible : ''}`}>
        <h2 className={styles.headline}>Watch together, from the same couch.</h2>
        <p className={styles.body}>Walk up to the TV, and you're both watching — no separate window, no second app.</p>
        <div className={styles.mediaGrid}>
          <VideoReveal
            src="/landing/watch-transition.mp4"
            ariaLabel="Walking from the room to the TV area to start Watch Together"
            className={styles.primaryMedia}
          />
          <figure className={styles.exampleFigure}>
            <img
              className={styles.exampleImage}
              src="/landing/watch-together.jpg"
              alt="An example of a personalized TV area in Our Space"
              loading="lazy"
            />
            <figcaption className={styles.caption}>An example of a personalized space — not the default.</figcaption>
          </figure>
        </div>
      </div>
    </FullBleedSection>
  )
}
