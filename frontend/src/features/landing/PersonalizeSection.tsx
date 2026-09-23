import { useScrollReveal } from './useScrollReveal'
import { FullBleedSection } from './FullBleedSection'
import styles from './PersonalizeSection.module.css'

/**
 * "Make it yours" — the LaurUch kitchen fridge, memories pinned up
 * (including an existing "Happy Birthday" note). This is explicitly
 * framed as ONE EXAMPLE of what a personal space can feel like, not a
 * promise of customization features beyond what the app currently
 * supports (see the caption).
 */
export function PersonalizeSection() {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <FullBleedSection>
      <div ref={ref} className={`${styles.wrap} ${isVisible ? styles.visible : ''}`}>
        <div className={styles.copy}>
          <h2 className={styles.headline}>Make it yours.</h2>
          <p className={styles.body}>
            Memories, companions, little details — your space can feel like the two of you, not a template.
          </p>
        </div>
        <figure className={styles.figure}>
          <img
            className={styles.image}
            src="/landing/personalize-fridge.jpg"
            alt="A fridge covered in memories and photos inside an Our Space room"
            loading="lazy"
          />
          <figcaption className={styles.caption}>An example of a personal touch — yours will be your own.</figcaption>
        </figure>
      </div>
    </FullBleedSection>
  )
}
