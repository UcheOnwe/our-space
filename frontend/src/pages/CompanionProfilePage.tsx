import { AccountSummary } from '../features/auth/AccountSummary'
import { CompanionProfileScreen } from '../features/companions/CompanionProfileScreen'
import { Button } from '../components/shared/Button'
import styles from './CompanionProfilePage.module.css'

const YOUTUBE_URL = 'https://www.youtube.com'

/**
 * Deliberately independent of CoupleProvider/CoupleGate — Companion
 * identity belongs to the individual user, not the couple (see
 * backend/companions/models.py), and must stay reachable regardless of
 * pairing status. See app/AuthGate.tsx, which renders this ABOVE
 * CoupleGate rather than nesting it inside one of CoupleGate's branches.
 *
 * The nav row below the header brings the same set of destinations
 * CoupleHomeSidebar already offers paired users (Space Companion setup,
 * Open YouTube) to this page too, since it sits outside that sidebar's
 * own reach — see this component's own `onOpenCompanionSetup` prop and
 * AuthGate.tsx for how "← Couples Room" resolves to the correct
 * authenticated/paired-or-not screen without this component needing to
 * know which one that is.
 */
export function CompanionProfilePage({
  onBack,
  onOpenCompanionSetup,
}: {
  onBack: () => void
  onOpenCompanionSetup: () => void
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Button variant="secondary" onClick={onBack}>
          ← Couples Room
        </Button>
        <h1 className={styles.title}>Companion Profile</h1>
        <AccountSummary />
      </header>
      <nav className={styles.navRow} aria-label="Companion navigation">
        <Button variant="secondary" onClick={onOpenCompanionSetup}>
          Space Companion
        </Button>
        <Button variant="secondary" onClick={() => window.open(YOUTUBE_URL, '_blank', 'noopener,noreferrer')}>
          Open YouTube
        </Button>
      </nav>
      <CompanionProfileScreen />
    </div>
  )
}
