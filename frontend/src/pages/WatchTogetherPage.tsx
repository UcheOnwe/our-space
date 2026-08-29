import { Button } from '../components/shared/Button'
import { WatchTogetherScreen } from '../features/watch/WatchTogetherScreen'
import styles from './WatchTogetherPage.module.css'

export function WatchTogetherPage({ onBack }: { onBack: () => void }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Button variant="secondary" onClick={onBack}>
          ← Our Space
        </Button>
        <h1 className={styles.title}>Watch Together</h1>
      </header>
      <WatchTogetherScreen />
    </div>
  )
}
