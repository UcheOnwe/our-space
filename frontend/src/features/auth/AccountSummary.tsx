import { useState } from 'react'
import { useAuth } from './AuthContext'

/**
 * Minimal authenticated placeholder for Vertical Slice 1.
 *
 * Confirms the signed-in user's identity and provides logout. Couple
 * pairing and the real shared home replace this in a later unit.
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
    <section>
      <h1>Welcome to Our Space</h1>
      <p>
        Signed in as <strong>{user.username}</strong>
        {user.email && <> ({user.email})</>}
      </p>
      <button type="button" onClick={handleLogout} disabled={loggingOut}>
        {loggingOut ? 'Logging out…' : 'Log out'}
      </button>
    </section>
  )
}
