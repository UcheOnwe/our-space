import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { useCouple } from './CoupleContext'

export function JoinSpaceForm({ onBack }: { onBack: () => void }) {
  const { joinSpace } = useCouple()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await joinSpace(code)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to join. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h1>Join Our Space</h1>

      <label htmlFor="join-code">Invite code</label>
      <input
        id="join-code"
        name="code"
        value={code}
        // Codes are case-insensitive; uppercasing as the user types keeps
        // the input matching how the code was displayed to the creator.
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={6}
        required
      />

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Joining…' : 'Join'}
      </button>
      <button type="button" onClick={onBack}>
        Back
      </button>
    </form>
  )
}
