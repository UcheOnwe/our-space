import { useState } from 'react'
import { ApiError } from '../../api/client'
import { useCouple } from './CoupleContext'

export function ChooseAction({ onChooseJoin }: { onChooseJoin: () => void }) {
  const { createSpace } = useCouple()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate() {
    setError(null)
    setSubmitting(true)
    try {
      await createSpace()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create Our Space. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section>
      <h1>Our Space</h1>
      <p>Pair with your partner to get started.</p>

      {error && <p role="alert">{error}</p>}

      <button type="button" onClick={handleCreate} disabled={submitting}>
        {submitting ? 'Creating…' : 'Create Our Space'}
      </button>
      <button type="button" onClick={onChooseJoin}>
        Join Our Space
      </button>
    </section>
  )
}
