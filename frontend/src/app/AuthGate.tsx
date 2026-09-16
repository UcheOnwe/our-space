import { useState } from 'react'
import { useAuth } from '../features/auth/AuthContext'
import { CoupleProvider } from '../features/couples/CoupleContext'
import { CompanionProfilePage } from '../pages/CompanionProfilePage'
import { CompanionSetupPage } from '../pages/CompanionSetupPage'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { CoupleGate } from './CoupleGate'

type AuthenticatedView = 'app' | 'companion-profile' | 'companion-setup'

/**
 * Routes between the signed-out and signed-in experience based on auth
 * state. There's no URL router yet — with only a few screens, plain state
 * is simpler than adding a routing dependency.
 *
 * Companion Profile AND the Companion setup/instructions page are
 * deliberately handled HERE, one level above CoupleProvider/CoupleGate —
 * not nested inside one of CoupleGate's couple-status branches the way
 * Watch Together (and CoupleHomeSidebar's OWN, unchanged path to the
 * setup page for already-paired users) are. Companion identity belongs
 * to the individual user (see the backend companions app), not the
 * couple, and both pages must stay reachable regardless of pairing
 * status (none/waiting/paired). Nesting either inside CoupleGate would
 * make it inherit that couple-gating by construction — this is the
 * smallest change that avoids that.
 *
 * "Couples Room" navigation (Companion Profile's own header) is just
 * `onBack` back to `'app'`, which re-mounts a fresh CoupleGate — that
 * component's own existing loading/waiting/paired/none branching is what
 * actually implements "authenticated+paired -> the room,
 * authenticated+unpaired -> the create/join/waiting flow" correctly,
 * with no new routing logic duplicated here.
 */
export function AuthGate() {
  const { status } = useAuth()
  const [view, setView] = useState<'login' | 'register'>('login')
  const [authenticatedView, setAuthenticatedView] = useState<AuthenticatedView>('app')

  if (status === 'loading') {
    return <p>Loading…</p>
  }

  if (status === 'authenticated') {
    if (authenticatedView === 'companion-profile') {
      return (
        <CompanionProfilePage
          onBack={() => setAuthenticatedView('app')}
          onOpenCompanionSetup={() => setAuthenticatedView('companion-setup')}
        />
      )
    }
    if (authenticatedView === 'companion-setup') {
      return <CompanionSetupPage onBack={() => setAuthenticatedView('app')} />
    }
    // CoupleProvider mounts only once authenticated, so an anonymous
    // visitor never triggers a doomed couple-status request.
    return (
      <CoupleProvider>
        <CoupleGate
          onOpenCompanionProfile={() => setAuthenticatedView('companion-profile')}
          onOpenCompanionSetup={() => setAuthenticatedView('companion-setup')}
        />
      </CoupleProvider>
    )
  }

  return view === 'login' ? (
    <LoginPage onSwitchToRegister={() => setView('register')} />
  ) : (
    <RegisterPage onSwitchToLogin={() => setView('login')} />
  )
}
