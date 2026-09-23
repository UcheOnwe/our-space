import { Button } from '../../components/shared/Button'
import { CompanionMascot } from './CompanionMascot'
import { FullBleedSection } from './FullBleedSection'
import styles from './FinalCta.module.css'

interface FinalCtaProps {
  onLogin: () => void
  onGetStarted: () => void
}

export function FinalCta({ onLogin, onGetStarted }: FinalCtaProps) {
  return (
    <FullBleedSection background="linear-gradient(180deg, var(--accent-bg) 0%, var(--bg) 100%)">
      <div className={styles.wrap}>
        <div className={styles.mascots}>
          <div className={styles.mascotLeft}>
            <CompanionMascot type="star_wisp" motion="drift" />
          </div>
          <div className={styles.mascotCenter}>
            <CompanionMascot type="cosmic_blob" motion="float" />
          </div>
          <div className={styles.mascotRight}>
            <CompanionMascot type="mini_ufo" motion="hover" />
          </div>
        </div>
        <h2 className={styles.headline}>Ready to make this Our Space?</h2>
        <div className={styles.actions}>
          <Button variant="primary" className={styles.primaryCta} onClick={onGetStarted}>
            Enter Our Space
          </Button>
          <Button variant="secondary" onClick={onLogin}>
            Log in
          </Button>
        </div>
      </div>
    </FullBleedSection>
  )
}
