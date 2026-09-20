import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../features/auth/AuthContext'
import { useCouple } from '../features/couples/CoupleContext'
import { PresenceOverlay } from '../features/presence/PresenceOverlay'
import { RoomExperience } from '../features/room/RoomExperience'
import type { RoomExperienceHandle } from '../features/room/RoomExperience'
import { fetchCoupleWallet } from '../features/uchem/api'
import { CoupleHomeNav } from './CoupleHomeNav'
import styles from './CoupleHomePage.module.css'

export function CoupleHomePage({
  onOpenWatch,
  onOpenCompanion,
  onOpenCompanionProfile,
}: {
  onOpenWatch: () => void
  onOpenCompanion: () => void
  onOpenCompanionProfile: () => void
}) {
  const { user } = useAuth()
  const { couple } = useCouple()
  const partner = couple?.members.find((member) => member.id !== user?.id)

  // The minimum room-browser state lifted out of RoomExperience — just
  // enough for CoupleHomeNav to display/trigger it. The actual gallery
  // data, transition timing, and purchase/select mechanics all stay
  // inside RoomExperience; see RoomExperienceHandle's own doc comment.
  const roomExperienceRef = useRef<RoomExperienceHandle>(null)
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  const [coupleBalance, setCoupleBalance] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCoupleWallet()
      .then((wallet) => {
        if (!cancelled) setCoupleBalance(wallet.balance)
      })
      .catch(() => {
        // The persistent balance display just shows "—" — RoomExperience
        // itself already surfaces a real error state for the room/gallery.
      })
    return () => {
      cancelled = true
    }
  }, [])

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
        <CoupleHomeNav
          onOpenWatch={onOpenWatch}
          onOpenCompanion={onOpenCompanion}
          onOpenCompanionProfile={onOpenCompanionProfile}
          isGalleryOpen={isGalleryOpen}
          onToggleGallery={() => roomExperienceRef.current?.toggleGallery()}
          onBrandingClick={() => roomExperienceRef.current?.returnToActiveRoom()}
          coupleBalance={coupleBalance}
          onBalanceChange={setCoupleBalance}
        />

        <div className={styles.intro}>
          {/* `user` is the explicitly-authenticated caller (useAuth()) —
              never inferred from member ordering. `partner` is already
              computed above by excluding `user.id`, not by position, so
              this is correct regardless of who created vs. joined the
              couple. */}
          <h1>
            Welcome back, {user?.username}
            {partner ? ` and ${partner.username}` : ''}.
          </h1>
          <p>Your shared room.</p>
        </div>

        <RoomExperience
          ref={roomExperienceRef}
          onOpenWatch={onOpenWatch}
          onModeChange={setIsGalleryOpen}
          onBalanceChange={setCoupleBalance}
        />
      </div>
    </PresenceOverlay>
  )
}
