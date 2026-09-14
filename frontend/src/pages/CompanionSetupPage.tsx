import { Button } from '../components/shared/Button'
import { CompanionSetupScreen } from '../features/companion/CompanionSetupScreen'
import styles from './CompanionSetupPage.module.css'

export function CompanionSetupPage({ onBack }: { onBack: () => void }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Button variant="secondary" onClick={onBack}>
          ← Our Space
        </Button>
        <h1 className={styles.title}>Space Companion</h1>
      </header>
      <CompanionSetupScreen />
    </div>
  )
}
