import { Button } from '../components/shared/Button'
import { Card } from '../components/shared/Card'
import { AccountSummary } from '../features/auth/AccountSummary'
import { useAuth } from '../features/auth/AuthContext'
import { useCouple } from '../features/couples/CoupleContext'
import { PresenceOverlay } from '../features/presence/PresenceOverlay'
import styles from './CoupleHomePage.module.css'

export function CoupleHomePage({ onOpenWatch }: { onOpenWatch: () => void }) {
  const { user } = useAuth()
  const { couple } = useCouple()
  const partner = couple?.members.find((member) => member.id !== user?.id)

  return (
    // PresenceOverlay wraps the whole page rather than sitting inside it as
    // its own section — Shared Presence V1's correction: the entire page is
    // the shared area, not a separate boxed room. PresenceProvider itself
    // is still mounted by CoupleGate, not here — see CoupleGate.tsx.
    <PresenceOverlay>
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
    </PresenceOverlay>
  )
}
