import { useState } from 'react'
import { ApiError } from '../../api/client'
import { useAuth } from '../auth/AuthContext'
import { useCouple } from './CoupleContext'

/** Shown while waiting for the second partner to join. Polling for the
 * status change is handled by CoupleProvider, not this component. */
export function InviteCodeDisplay() {
  const { invite, cancelPairing } = useCouple()
  const { logout } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleCancel() {
    setError(null)
    setCancelling(true)
    try {
      await cancelPairing()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to cancel. Please try again.')
      setCancelling(false)
    }
    // No `finally` reset on success: a successful cancel flips CoupleGate
    // away from this screen entirely, so there's nothing left to update.
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
      <h1>Waiting for your partner</h1>
      <p>Share this code with your partner so they can join:</p>
      <p>
        <strong>{invite?.code ?? '……'}</strong>
      </p>
      <p>This page updates automatically once they join.</p>

      {error && <p role="alert">{error}</p>}

      <button type="button" onClick={handleCancel} disabled={cancelling}>
        {cancelling ? 'Cancelling…' : 'Cancel pairing'}
      </button>
      <button type="button" onClick={handleLogout} disabled={loggingOut}>
        {loggingOut ? 'Logging out…' : 'Log out'}
      </button>
    </section>
  )
}
