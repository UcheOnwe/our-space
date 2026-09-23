import { useScrollReveal } from './useScrollReveal'
import { VideoReveal } from './VideoReveal'
import { CompanionMascot } from './CompanionMascot'
import { FullBleedSection } from './FullBleedSection'
import styles from './BrowserCompanionSection.module.css'

/**
 * The browser companion is a real, working proof-of-concept extension
 * (see extension/manifest.json's own description: "Proof-of-concept
 * development build — not published to the Chrome Web Store") — NOT
 * something publicly installable today. This section is worded to make
 * that unambiguous: "Coming to your browser," never an "Add to Chrome"
 * button or any claim of current availability.
 */
export function BrowserCompanionSection() {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <FullBleedSection>
      <div ref={ref} className={`${styles.wrap} ${isVisible ? styles.visible : ''}`}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>Coming to your browser</span>
          <h2 className={styles.headline}>Your Companion lives in your space — and can come with you.</h2>
          <p className={styles.body}>
            We're building a browser companion so the same Companion you equip in Our Space can keep you company
            while you watch videos elsewhere. It's an early proof of concept today, not yet available to everyone.
          </p>
          <div className={styles.mascotRow}>
            <div className={styles.mascot}>
              <CompanionMascot type="cosmic_blob" motion="float" />
            </div>
          </div>
        </div>
        <VideoReveal
          src="/landing/browser-companion.mp4"
          ariaLabel="An early proof-of-concept Companion overlay on a video site"
          className={styles.video}
          aspectRatio="3 / 4"
        />
      </div>
    </FullBleedSection>
  )
}
