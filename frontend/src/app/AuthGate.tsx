import { useState } from 'react'
import { useAuth } from '../features/auth/AuthContext'
import { CoupleProvider } from '../features/couples/CoupleContext'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { CoupleGate } from './CoupleGate'

/**
 * Routes between the signed-out and signed-in experience based on auth
 * state. There's no URL router yet — with only a few screens, plain state
 * is simpler than adding a routing dependency.
 */
export function AuthGate() {
  const { status } = useAuth()
  const [view, setView] = useState<'login' | 'register'>('login')

  if (status === 'loading') {
    return <p>Loading…</p>
  }

  if (status === 'authenticated') {
    // CoupleProvider mounts only once authenticated, so an anonymous
    // visitor never triggers a doomed couple-status request.
    return (
      <CoupleProvider>
        <CoupleGate />
      </CoupleProvider>
    )
  }

  return view === 'login' ? (
    <LoginPage onSwitchToRegister={() => setView('register')} />
  ) : (
    <RegisterPage onSwitchToLogin={() => setView('login')} />
  )
}
