import { useEffect, useId, useState } from 'react'
import styles from './CoupleHomeSidebar.module.css'

interface CoupleHomeSidebarProps {
  /** Opens Watch Together — the EXACT SAME callback the room's TV
   * interaction already uses (see RoomCanvas.tsx's `onOpenWatch` prop)
   * and CoupleHomePage passes straight through here, so this menu item
   * and the TV invoke one shared navigation path, never a second one. */
  onOpenWatch: () => void
}

/**
 * The left hamburger button + drawer that replaces Couple Home's
 * previously always-visible "Start Watching" button — the room itself is
 * meant to read as the page now, not a room with a dashboard button
 * bolted underneath it. Sits as the first item in CoupleHomePage's own
 * header (normal document flow, not a floating/fixed button over the
 * room canvas) so it can never visually collide with the Pixi room or
 * its camera panning; only the drawer itself is `position: fixed`, since
 * it needs to slide in over the whole page, header included.
 *
 * V1 holds exactly one destination (Watch Together), per the approved
 * plan — the drawer/list shape is deliberately generic already so a later
 * slice can add Music/Games/Move-Fitness/Memories/Settings as more list
 * items without restructuring this component.
 */
export function CoupleHomeSidebar({ onOpenWatch }: CoupleHomeSidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const drawerId = useId()

  // Escape closes the drawer — the one keyboard affordance beyond the
  // hamburger/close buttons' own native Enter/Space activation, which
  // <button> already provides for free.
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  function handleWatchTogether() {
    // Same shared path the TV uses (see this component's own prop doc) —
    // closing the drawer afterward is this menu's own UI housekeeping,
    // not part of that shared navigation action.
    onOpenWatch()
    setIsOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={drawerId}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        <span className={styles.hamburgerIcon} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {/* `inert` (a real HTML attribute, not a React-only convention)
          removes the closed drawer from both the tab order and the
          accessibility tree in one step — without it, a keyboard user
          could still Tab into "Watch Together" while the drawer is
          visually off-screen. `aria-hidden` is kept alongside it for
          older assistive-tech support that doesn't yet honor `inert`. */}
      <nav
        id={drawerId}
        className={[styles.drawer, isOpen ? styles.drawerOpen : ''].filter(Boolean).join(' ')}
        aria-label="Couple Home menu"
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        <div className={styles.drawerHeader}>
          <span className={styles.drawerTitle}>Our Space</span>
          <button type="button" className={styles.closeButton} onClick={() => setIsOpen(false)} aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <ul className={styles.menuList}>
          <li>
            <button type="button" className={styles.menuItem} onClick={handleWatchTogether}>
              Watch Together
            </button>
          </li>
        </ul>
      </nav>
    </>
  )
}
