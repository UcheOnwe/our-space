import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { useAuth } from './AuthContext'

export function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { register } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await register({ username, email: email || undefined, password })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to register. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h1>Create your account</h1>

      <label htmlFor="register-username">Username</label>
      <input
        id="register-username"
        name="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        required
      />

      <label htmlFor="register-email">Email (optional)</label>
      <input
        id="register-email"
        name="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />

      <label htmlFor="register-password">Password</label>
      <input
        id="register-password"
        name="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        required
      />

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create account'}
      </button>

      <p>
        Already have an account?{' '}
        <button type="button" onClick={onSwitchToLogin}>
          Log in
        </button>
      </p>
    </form>
  )
}
