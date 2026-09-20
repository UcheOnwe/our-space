import { useState } from 'react'
import { COLOR_VARIANTS, COMPANION_TYPES } from '../companions/registry'
import { AccountSummary } from '../features/auth/AccountSummary'
import { AddUchemPanel } from './AddUchemPanel'
import { CoupleHomeSidebar } from './CoupleHomeSidebar'
import styles from './CoupleHomeNav.module.css'

// The default/original Cosmic Blob, reused verbatim — the exact function
// CompanionProfileScreen.tsx already renders via dangerouslySetInnerHTML
// (safe here for the same reason: markup this app generates itself, never
// user input). No new logo/icon asset.
const COSMIC_BLOB = COMPANION_TYPES.cosmic_blob
const COSMIC_BLOB_HEX = COLOR_VARIANTS[COSMIC_BLOB.defaultColor].hex

interface CoupleHomeNavProps {
  onOpenWatch: () => void
  onOpenCompanion: () => void
  onOpenCompanionProfile: () => void
  isGalleryOpen: boolean
  onToggleGallery: () => void
  /** The universal "Home" action: always returns to the active room's
   * plain view — closes the gallery if it's open, and leaves any active
   * hotspot close-up (Cozy Loft's TV/Gaming) if one is showing. A
   * harmless no-op if already there on both counts. Never switches which
   * room is active. */
  onBrandingClick: () => void
  /** The couple's Uchem balance — null while still loading. Always the
   * COUPLE Wallet (room purchases spend Couple Uchem only) — never the
   * partner's Personal Wallet, which this surface has no access to. */
  coupleBalance: number | null
  /** Reports a balance change from the Add Uchem panel's developer
   * testing credit — same "child reports, parent owns the number"
   * pattern RoomExperience's own onBalanceChange already uses. */
  onBalanceChange: (balance: number) => void
}

/**
 * The ONE persistent Couple Home nav/HUD — replaces the old plain
 * `<header>` (wordmark + AccountSummary) AND the separately-fixed
 * sidebar hamburger AND RoomHud, which used to be three independently
 * positioned pieces that visually overlapped and didn't read as one
 * interface. This is now the single fixed top bar, and it OWNS the
 * drawer's open/close state (CoupleHomeSidebar is a controlled child of
 * this component, not a sibling with its own toggle).
 *
 * Room-browser state (isGalleryOpen, onToggleGallery, coupleBalance) is
 * still owned by RoomExperience/CoupleHomePage — this component only
 * displays/triggers it, never owns the gallery/purchase mechanics
 * themselves.
 */
export function CoupleHomeNav({
  onOpenWatch,
  onOpenCompanion,
  onOpenCompanionProfile,
  isGalleryOpen,
  onToggleGallery,
  onBrandingClick,
  coupleBalance,
  onBalanceChange,
}: CoupleHomeNavProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isAddUchemOpen, setIsAddUchemOpen] = useState(false)

  return (
    <>
      <div className={styles.nav}>
        <button type="button" className={styles.branding} onClick={onBrandingClick}>
          <span
            className={styles.brandIcon}
            aria-hidden="true"
            dangerouslySetInnerHTML={{
              __html: COSMIC_BLOB.buildSvgMarkup(COSMIC_BLOB.defaultColor, COSMIC_BLOB_HEX),
            }}
          />
          <span className={styles.brandName}>Our Space</span>
        </button>

        <div className={styles.actions}>
          <div className={styles.balanceGroup}>
            <div className={styles.balance} aria-label="Couple Uchem balance">
              <span className={styles.balanceIcon} aria-hidden="true">
                ✦
              </span>{' '}
              <span className={styles.balanceNumber}>{coupleBalance === null ? '—' : coupleBalance.toLocaleString()}</span>{' '}
              <span className={styles.balanceLabel}>Uchem</span>
            </div>
            <button
              type="button"
              className={styles.addUchemButton}
              onClick={() => setIsAddUchemOpen(true)}
              aria-label="Add Uchem"
            >
              +
            </button>
          </div>

          {/* Hidden below 700px — reachable through the drawer instead
              (see CoupleHomeSidebar's own "Switch Room" item). */}
          <button
            type="button"
            className={`${styles.switchRoomButton} ${styles.desktopOnly}`}
            onClick={onToggleGallery}
          >
            {isGalleryOpen ? 'Close' : 'Switch Room'}
          </button>

          {/* Same reasoning — AccountSummary reappears inside the drawer
              below 700px (CoupleHomeSidebar's own accountSection). */}
          <div className={styles.desktopOnly}>
            <AccountSummary variant="onDark" />
          </div>

          <button
            type="button"
            className={styles.menuButton}
            onClick={() => setIsSidebarOpen((open) => !open)}
            aria-expanded={isSidebarOpen}
            aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
          >
            <span className={styles.hamburgerIcon} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <CoupleHomeSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenWatch={onOpenWatch}
        onOpenCompanion={onOpenCompanion}
        onOpenCompanionProfile={onOpenCompanionProfile}
        onToggleGallery={onToggleGallery}
      />

      {isAddUchemOpen && (
        <AddUchemPanel onClose={() => setIsAddUchemOpen(false)} onBalanceChange={onBalanceChange} />
      )}
    </>
  )
}
