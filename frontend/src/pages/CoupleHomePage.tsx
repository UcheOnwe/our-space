import { Button } from '../components/shared/Button'
import { Card } from '../components/shared/Card'
import { AccountSummary } from '../features/auth/AccountSummary'
import { useAuth } from '../features/auth/AuthContext'
import { useCouple } from '../features/couples/CoupleContext'
import styles from './CoupleHomePage.module.css'

export function CoupleHomePage({ onOpenWatch }: { onOpenWatch: () => void }) {
  const { user } = useAuth()
  const { couple } = useCouple()
  const partner = couple?.members.find((member) => member.id !== user?.id)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.wordmark}>Our Space</span>
        <AccountSummary />
      </header>

      <div className={styles.intro}>
        <h1>Welcome back{partner ? `, and ${partner.username}` : ''}.</h1>
        <p>What do you want to do together?</p>
      </div>

      {/* Only one real card for now — no disabled placeholders for future
          activities. The grid is ready to hold more without a redesign. */}
      <div className={styles.grid}>
        <Card className={styles.activityCard}>
          <h2>Watch Together</h2>
          <p>Start a shared YouTube session.</p>
          <Button onClick={onOpenWatch}>Start Watching</Button>
        </Card>
      </div>
    </div>
  )
}
