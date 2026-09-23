import { useScrollReveal } from './useScrollReveal'
import { CompanionMascot } from './CompanionMascot'
import { FullBleedSection } from './FullBleedSection'
import styles from './CreatorSection.module.css'

/**
 * Deliberately small and secondary — this is an Our Space product
 * landing page, not a personal portfolio. No photograph (by request),
 * no GitHub, no LinkedIn, no repository link. Cosmic Blob stands in as
 * the visual personality instead of a portrait. Both addresses are the
 * real, confirmed ones — nothing here is a placeholder or an invented
 * contact.
 */
export function CreatorSection() {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <FullBleedSection>
      <div ref={ref} className={`${styles.wrap} ${isVisible ? styles.visible : ''}`}>
        <div className={styles.mascot}>
          <CompanionMascot type="cosmic_blob" motion="float" />
        </div>
        <div className={styles.copy}>
          <h2 className={styles.headline}>Built by Uche Onwe</h2>
          <p className={styles.body}>
            I built Our Space around a simple idea: spending time together online should feel like sharing a place,
            not just sharing a screen.
          </p>
          <p className={styles.invite}>Feedback, ideas, questions, or collaboration — I'd love to hear from you.</p>
          <div className={styles.links}>
            <div className={styles.linkGroup}>
              <span className={styles.linkLabel}>Our Space feedback & ideas</span>
              <a className={styles.link} href="mailto:ourspaceuch@gmail.com">
                ourspaceuch@gmail.com
              </a>
            </div>
            <div className={styles.linkGroup}>
              <span className={styles.linkLabel}>Professional / recruiter inquiries</span>
              <a className={styles.link} href="mailto:uche0to100developer@gmail.com">
                uche0to100developer@gmail.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </FullBleedSection>
  )
}
