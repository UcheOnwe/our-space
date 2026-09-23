import { useState } from 'react'
import { Button } from '../../components/shared/Button'
import { CompanionMascot } from './CompanionMascot'
import styles from './LandingNav.module.css'

interface LandingNavProps {
  onLogin: () => void
  onGetStarted: () => void
}

/**
 * A minimal sticky nav — brand mark (the default Companion, Cosmic Blob)
 * + wordmark on the left, Log in / Get Started on the right. No GitHub,
 * no LinkedIn, no repository link — this is a product landing page, not
 * a portfolio.
 *
 * Mobile collapses to a compact brand mark + the single primary CTA
 * (Get Started) + a hamburger revealing "Log in" — matching the brief's
 * "compact brand/default companion, primary CTA, hamburger when
 * appropriate," not a full desktop nav simply shrunk down.
 */
export function LandingNav({ onLogin, onGetStarted }: LandingNavProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className={styles.nav}>
      <div className={styles.brand}>
        <div className={styles.brandMascot}>
          <CompanionMascot type="cosmic_blob" motion="none" />
        </div>
        <span className={styles.brandName}>Our Space</span>
      </div>

      <div className={styles.desktopActions}>
        <Button variant="secondary" onClick={onLogin}>
          Log in
        </Button>
        <Button variant="primary" onClick={onGetStarted}>
          Enter Our Space
        </Button>
      </div>

      <div className={styles.mobileActions}>
        <Button variant="primary" onClick={onGetStarted} style={{ width: 'auto' }}>
          Get Started
        </Button>
        <button
          type="button"
          className={styles.menuButton}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className={styles.menuIcon} aria-hidden="true" />
        </button>
      </div>

      {menuOpen && (
        <div className={styles.mobileMenu}>
          <Button
            variant="secondary"
            onClick={() => {
              setMenuOpen(false)
              onLogin()
            }}
          >
            Log in
          </Button>
        </div>
      )}
    </header>
  )
}
