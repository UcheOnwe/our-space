import { useEffect } from 'react'
import { COLOR_VARIANTS, COMPANION_TYPES } from '../companions/registry'
import { AccountSummary } from '../features/auth/AccountSummary'
import styles from './CoupleHomeSidebar.module.css'

// The exact same default/original Cosmic Blob reference CoupleHomeNav.tsx
// already renders — reused verbatim, not a second logo implementation.
const COSMIC_BLOB = COMPANION_TYPES.cosmic_blob
const COSMIC_BLOB_HEX = COLOR_VARIANTS[COSMIC_BLOB.defaultColor].hex

interface CoupleHomeSidebarProps {
  isOpen: boolean
  onClose: () => void
  /** Opens Watch Together — the EXACT SAME callback the room's TV
   * interaction already uses (see RoomCanvas.tsx's `onOpenWatch` prop)
   * and CoupleHomePage passes straight through here, so this menu item
   * and the TV invoke one shared navigation path, never a second one. */
  onOpenWatch: () => void
  /** Opens the Space Companion setup page (CompanionSetupPage) — the
   * Companion extension POC's own entry point. Same "just another
   * pairedView" navigation approach as onOpenWatch (see CoupleGate.tsx);
   * this app has no URL router, so this is that convention's second use,
   * not a new one. */
  onOpenCompanion: () => void
  /** Opens Companion Profile (CompanionProfilePage) — the customization
   * page, distinct from `onOpenCompanion` above (extension install
   * instructions). Passed all the way down from AuthGate.tsx, since
   * Companion Profile lives ABOVE CoupleGate/CoupleProvider entirely
   * (see AuthGate.tsx's own doc comment) — this sidebar just forwards it,
   * the same as every other callback here. */
  onOpenCompanionProfile: () => void
  /** Same room-browser toggle CoupleHomeNav's own persistent "Switch
   * Room" control uses — this is the mobile/overflow path to the exact
   * same action, not a second implementation of it. */
  onToggleGallery: () => void
}

/**
 * The drawer/menu of Couple Home destinations — owned/composed by
 * CoupleHomeNav now (see that component), which owns the hamburger
 * button and isOpen state; this component is a plain controlled `nav`
 * with no state of its own, so it can be triggered from one persistent
 * place instead of carrying its own separate toggle button.
 *
 * Watch Together / Space Companion / Companion Profile are the original,
 * unchanged destinations. "Switch Room" and the account/logout block are
 * ADDITIONS for the mobile/overflow case — CoupleHomeNav's own persistent
 * bar hides its inline equivalents below the existing 700px breakpoint
 * (see CoupleHomeNav.module.css), so this drawer is where those two
 * actions live on a narrow viewport instead of vanishing.
 */
export function CoupleHomeSidebar({
  isOpen,
  onClose,
  onOpenWatch,
  onOpenCompanion,
  onOpenCompanionProfile,
  onToggleGallery,
}: CoupleHomeSidebarProps) {
  // Escape closes the drawer — the one keyboard affordance beyond the
  // hamburger/close buttons' own native Enter/Space activation, which
  // <button> already provides for free.
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  function handleWatchTogether() {
    // Same shared path the TV uses (see this component's own prop doc) —
    // closing the drawer afterward is this menu's own UI housekeeping,
    // not part of that shared navigation action.
    onOpenWatch()
    onClose()
  }

  function handleCompanion() {
    onOpenCompanion()
    onClose()
  }

  function handleCompanionProfile() {
    onOpenCompanionProfile()
    onClose()
  }

  function handleSwitchRoom() {
    onToggleGallery()
    onClose()
  }

  return (
    // `inert` (a real HTML attribute, not a React-only convention) removes
    // the closed drawer from both the tab order and the accessibility
    // tree in one step — without it, a keyboard user could still Tab into
    // "Watch Together" while the drawer is visually off-screen.
    // `aria-hidden` is kept alongside it for older assistive-tech support
    // that doesn't yet honor `inert`.
    <nav
      className={[styles.drawer, isOpen ? styles.drawerOpen : ''].filter(Boolean).join(' ')}
      aria-label="Couple Home menu"
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      <div className={styles.drawerHeader}>
        <div className={styles.drawerBrand}>
          <span
            className={styles.drawerBrandIcon}
            aria-hidden="true"
            dangerouslySetInnerHTML={{
              __html: COSMIC_BLOB.buildSvgMarkup(COSMIC_BLOB.defaultColor, COSMIC_BLOB_HEX),
            }}
          />
          <span className={styles.drawerTitle}>Our Space</span>
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <ul className={styles.menuList}>
        <li>
          <button type="button" className={styles.menuItem} onClick={handleWatchTogether}>
            Watch Together
          </button>
        </li>
        <li>
          <button type="button" className={styles.menuItem} onClick={handleCompanion}>
            Space Companion
          </button>
        </li>
        <li>
          <button type="button" className={styles.menuItem} onClick={handleCompanionProfile}>
            Companion Profile
          </button>
        </li>
        <li>
          <button type="button" className={styles.menuItem} onClick={handleSwitchRoom}>
            Switch Room
          </button>
        </li>
      </ul>
      <div className={styles.accountSection}>
        <AccountSummary />
      </div>
    </nav>
  )
}
