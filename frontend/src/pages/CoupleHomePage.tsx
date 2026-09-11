import { Button } from '../components/shared/Button'
import { AccountSummary } from '../features/auth/AccountSummary'
import { useAuth } from '../features/auth/AuthContext'
import { useCouple } from '../features/couples/CoupleContext'
import { PresenceOverlay } from '../features/presence/PresenceOverlay'
import { RoomCanvas } from '../features/room/RoomCanvas'
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
    // `fullBleed` matches Couple Home's own full-viewport-width layout
    // below (see CoupleHomePage.module.css's `.page`) — see
    // PresenceOverlay.tsx's prop doc for why that has to be explicit.
    <PresenceOverlay fullBleed>
      <div className={styles.page}>
        <header className={styles.header}>
          <span className={styles.wordmark}>Our Space</span>
          <AccountSummary />
        </header>

        <div className={styles.intro}>
          <h1>Welcome back{partner ? `, and ${partner.username}` : ''}.</h1>
          <p>Your shared room.</p>
        </div>

        <RoomCanvas onOpenWatch={onOpenWatch} />

        {/* The room's TV is now the graphical entry point to Watch Together
            (see RoomCanvas's onOpenWatch prop) — this button is the
            required accessible fallback path, invoking the exact same
            onOpenWatch callback rather than a second implementation. */}
        <Button onClick={onOpenWatch} className={styles.watchTogetherButton}>
          Start Watching
        </Button>
      </div>
    </PresenceOverlay>
  )
}
