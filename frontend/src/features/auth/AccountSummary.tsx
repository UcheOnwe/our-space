import { useState } from 'react'
import { Button } from '../../components/shared/Button'
import { useAuth } from './AuthContext'
import styles from './AccountSummary.module.css'

interface AccountSummaryProps {
  /** 'onDark' fixes contrast when this renders over a photographic/dark
   * surface (CoupleHomeNav's persistent bar) — the default styling's
   * theme tokens (--text-h, --accent-secondary-bg) assume a light page
   * background, which loses contrast there regardless of the user's own
   * light/dark theme preference, since the nav's own backdrop is always
   * dark by design. Purely a resting-state contrast fix — the existing
   * hover treatment is untouched either way. Default unchanged, so every
   * other existing caller (Companion Profile's header, the drawer's own
   * account section) keeps its current appearance exactly as-is. */
  variant?: 'default' | 'onDark'
}

/**
 * Identity + logout, meant to sit inside a page-level header (e.g. Couple
 * Home) rather than stand alone — the "Welcome to Our Space" heading that
 * used to live here moved to CoupleHomePage now that it owns the real
 * greeting.
 */
export function AccountSummary({ variant = 'default' }: AccountSummaryProps) {
  const { user, logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)

  if (!user) {
    return null
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      setLoggingOut(false)
    }
  }

  const summaryClass = [styles.summary, variant === 'onDark' ? styles.onDark : ''].filter(Boolean).join(' ')

  return (
    <div className={summaryClass}>
      <span className={styles.identity}>
        {user.username}
        {user.email && ` (${user.email})`}
      </span>
      <Button variant="secondary" onClick={handleLogout} disabled={loggingOut}>
        {loggingOut ? 'Logging out…' : 'Log out'}
      </Button>
    </div>
  )
}
