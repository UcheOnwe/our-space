import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../api/client'
import { restoreDevCoupleWallet } from '../features/uchem/api'
import styles from './AddUchemPanel.module.css'

interface AddUchemPanelProps {
  onClose: () => void
  /** Reported upward the same way RoomExperience already reports a
   * post-purchase balance change — CoupleHomePage owns the actual
   * number, this panel only ever tells it what changed. */
  onBalanceChange: (balance: number) => void
}

/**
 * The long-term "Add Uchem" entry point (the `+` beside the nav's
 * balance) — for now, just a short "more is coming" note plus a
 * development-only testing section. No production purchase/earn flow is
 * built here yet; this only establishes where that will eventually live.
 *
 * `import.meta.env.DEV` (Vite's own built-in flag, not a new dependency)
 * hides the Developer Testing section from a production build — a
 * presentation nicety only. The REAL security boundary is entirely
 * server-side: backend/uchem/urls.py only registers the restore endpoint
 * at all when DEBUG=True, and the view itself defensively re-checks that
 * too (see DevRestoreCoupleWalletView's own doc comment). Hiding this
 * button in a prod build never has to be trusted on its own.
 */
export function AddUchemPanel({ onClose, onBalanceChange }: AddUchemPanelProps) {
  const [code, setCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState(false)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      const wallet = await restoreDevCoupleWallet(code)
      onBalanceChange(wallet.balance)
      setSucceeded(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Add Uchem"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Add Uchem</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <p className={styles.comingSoon}>More ways to earn and buy Uchem are coming soon.</p>

        {import.meta.env.DEV && (
          <form className={styles.devSection} onSubmit={handleSubmit}>
            <h3 className={styles.devTitle}>Developer Testing</h3>
            <label htmlFor="uchem-test-code">Testing credit code</label>
            <input
              id="uchem-test-code"
              type="text"
              value={code}
              onChange={(event) => {
                setCode(event.target.value)
                setSucceeded(false)
              }}
              autoComplete="off"
            />
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            {succeeded && <p className={styles.success}>Couple Wallet restored.</p>}
            <button type="submit" className={styles.submitButton} disabled={isSubmitting || !code}>
              {isSubmitting ? 'Applying…' : 'Apply test credit'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
