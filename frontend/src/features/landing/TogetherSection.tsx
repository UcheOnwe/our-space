import { useScrollReveal } from './useScrollReveal'
import { VideoReveal } from './VideoReveal'
import { CompanionMascot } from './CompanionMascot'
import { FullBleedSection } from './FullBleedSection'
import styles from './TogetherSection.module.css'

/**
 * "Exist together inside your space" — both people occupying the same
 * room at once. Uses the real Companions (registry) rather than the
 * room's own rigged avatars (those are RoomCanvas-specific Pixi sprite
 * assets, not something this DOM page can reuse) — the Companions are
 * exactly the "you're both here" visual language the rest of the product
 * already established.
 */
export function TogetherSection() {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <FullBleedSection>
      <div ref={ref} className={`${styles.wrap} ${isVisible ? styles.visible : ''}`}>
        <div className={styles.copy}>
          <h2 className={styles.headline}>Exist together, inside your space.</h2>
          <p className={styles.body}>
            Not a call, not a chat thread — the same room, at the same time. Both of you can be there, together.
          </p>
        </div>
        <div className={styles.media}>
          <VideoReveal
            src="/landing/together.mp4"
            ariaLabel="Two companions together in a shared Our Space room"
            aspectRatio="3 / 4"
          />
          <div className={styles.companionRow}>
            <div className={styles.companion}>
              <CompanionMascot type="cosmic_blob" motion="float" />
            </div>
            <div className={styles.companion}>
              <CompanionMascot type="cosmic_flyer" motion="hover" />
            </div>
          </div>
        </div>
      </div>
    </FullBleedSection>
  )
}
