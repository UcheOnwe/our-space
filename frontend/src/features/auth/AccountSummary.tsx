import { useState } from 'react'
import { Button } from '../../components/shared/Button'
import { useAuth } from './AuthContext'
import styles from './AccountSummary.module.css'

/**
 * Identity + logout, meant to sit inside a page-level header (e.g. Couple
 * Home) rather than stand alone — the "Welcome to Our Space" heading that
 * used to live here moved to CoupleHomePage now that it owns the real
 * greeting.
 */
export function AccountSummary() {
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

  return (
    <div className={styles.summary}>
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
