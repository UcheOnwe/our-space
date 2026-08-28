import { useState } from 'react'
import { useCouple } from '../features/couples/CoupleContext'
import { ChooseActionPage } from '../pages/ChooseActionPage'
import { CoupleHomePage } from '../pages/CoupleHomePage'
import { InviteWaitingPage } from '../pages/InviteWaitingPage'
import { JoinSpacePage } from '../pages/JoinSpacePage'

/**
 * Routes between the pre-pairing and paired experience based on couple
 * state — the same plain-state approach AuthGate uses for auth state.
 * Still no URL router: the screen count remains small enough that local
 * state is simpler than adding a routing dependency.
 */
export function CoupleGate() {
  const { status } = useCouple()
  const [view, setView] = useState<'choose' | 'join'>('choose')

  if (status === 'loading') {
    return <p>Loading…</p>
  }

  if (status === 'waiting') {
    return <InviteWaitingPage />
  }

  if (status === 'paired') {
    return <CoupleHomePage />
  }

  return view === 'choose' ? (
    <ChooseActionPage onChooseJoin={() => setView('join')} />
  ) : (
    <JoinSpacePage onBack={() => setView('choose')} />
  )
}
