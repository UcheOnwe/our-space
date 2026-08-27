import { useState } from 'react'
import { useAuth } from '../features/auth/AuthContext'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'

/**
 * Routes between the signed-out and signed-in experience based on auth
 * state. There's no URL router yet (see vite.config.ts comment/plan notes) —
 * with only three screens, plain state is simpler than adding a routing
 * dependency. Revisit once couple pairing needs multiple addressable routes.
 */
export function AuthGate() {
  const { status } = useAuth()
  const [view, setView] = useState<'login' | 'register'>('login')

  if (status === 'loading') {
    return <p>Loading…</p>
  }

  if (status === 'authenticated') {
    return <HomePage />
  }

  return view === 'login' ? (
    <LoginPage onSwitchToRegister={() => setView('register')} />
  ) : (
    <RegisterPage onSwitchToLogin={() => setView('login')} />
  )
}
