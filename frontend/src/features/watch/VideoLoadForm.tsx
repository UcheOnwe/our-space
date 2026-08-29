import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { Button } from '../../components/shared/Button'
import { useWatch } from './WatchContext'
import styles from './VideoLoadForm.module.css'

export function VideoLoadForm() {
  const { loadVideo } = useWatch()
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await loadVideo(url)
      setUrl('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load that video. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      <label htmlFor="video-url">Paste a YouTube URL</label>
      <input
        id="video-url"
        name="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=..."
        required
      />

      {error && <p role="alert">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Loading…' : 'Load video'}
      </Button>
    </form>
  )
}
