import type { ReactNode } from 'react'
import { Button } from '../components/shared/Button'
import styles from './PrePairingLayout.module.css'

/**
 * The one small, persistent nav entry point for a signed-in user who
 * isn't paired yet (couple status 'none'/'waiting') —
 * ChooseAction/JoinSpaceForm/InviteCodeDisplay otherwise render with no
 * header/nav at all. Deliberately a single wrapper placed around
 * whichever pre-pairing screen CoupleGate.tsx is currently showing,
 * rather than threading new props through each of those three existing
 * feature components individually — the smallest change that brings
 * Companion Profile/setup navigation here too, not a pre-pairing
 * navigation redesign. No "Couples Room" link here — these screens ARE
 * already the couples-room area, just pre-pairing.
 */
export function PrePairingLayout({
  onOpenCompanionProfile,
  onOpenCompanionSetup,
  children,
}: {
  onOpenCompanionProfile: () => void
  onOpenCompanionSetup: () => void
  children: ReactNode
}) {
  return (
    <div className={styles.layout}>
      <div className={styles.topBar}>
        <Button variant="secondary" onClick={onOpenCompanionProfile}>
          Companion Profile
        </Button>
        <Button variant="secondary" onClick={onOpenCompanionSetup}>
          Space Companion
        </Button>
      </div>
      {children}
    </div>
  )
}
