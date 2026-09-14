import { useState } from 'react'
import { useCouple } from '../features/couples/CoupleContext'
import { PresenceProvider } from '../features/presence/PresenceContext'
import { WatchProvider } from '../features/watch/WatchContext'
import { ChooseActionPage } from '../pages/ChooseActionPage'
import { CompanionSetupPage } from '../pages/CompanionSetupPage'
import { CoupleHomePage } from '../pages/CoupleHomePage'
import { InviteWaitingPage } from '../pages/InviteWaitingPage'
import { JoinSpacePage } from '../pages/JoinSpacePage'
import { WatchTogetherPage } from '../pages/WatchTogetherPage'

/**
 * Routes between the pre-pairing and paired experience based on couple
 * state — the same plain-state approach used throughout (no URL router
 * yet; see the Slice 3 proposal for why that stays a deliberate,
 * revisitable choice rather than an oversight).
 */
export function CoupleGate() {
  const { status } = useCouple()
  const [view, setView] = useState<'choose' | 'join'>('choose')
  const [pairedView, setPairedView] = useState<'home' | 'watch' | 'companion'>('home')

  if (status === 'loading') {
    return <p>Loading…</p>
  }

  if (status === 'waiting') {
    return <InviteWaitingPage />
  }

  if (status === 'paired') {
    if (pairedView === 'watch') {
      // Each screen gets its OWN PresenceProvider instance, scoped by
      // `feature`. Mounting/unmounting one of these as the user navigates
      // between screens is exactly what produces the sleeping/grayed-out
      // "partner left this feature" behavior — see presence/consumers.py's
      // (couple, feature) room scoping for why that stays correct even
      // with two screens now sharing the same presence system.
      return (
        <WatchProvider>
          <PresenceProvider feature="watch">
            <WatchTogetherPage onBack={() => setPairedView('home')} />
          </PresenceProvider>
        </WatchProvider>
      )
    }
    if (pairedView === 'companion') {
      // No PresenceProvider here — the Companion setup page is static,
      // informational content with no realtime/shared state of its own
      // (the POC's whole overlay lives entirely inside the browser
      // extension, with no backend/presence involvement at all).
      return <CompanionSetupPage onBack={() => setPairedView('home')} />
    }
    return (
      <PresenceProvider feature="home">
        <CoupleHomePage onOpenWatch={() => setPairedView('watch')} onOpenCompanion={() => setPairedView('companion')} />
      </PresenceProvider>
    )
  }

  return view === 'choose' ? (
    <ChooseActionPage onChooseJoin={() => setView('join')} />
  ) : (
    <JoinSpacePage onBack={() => setView('choose')} />
  )
}
