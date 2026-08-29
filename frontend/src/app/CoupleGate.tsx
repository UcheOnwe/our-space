import { useState } from 'react'
import { useCouple } from '../features/couples/CoupleContext'
import { WatchProvider } from '../features/watch/WatchContext'
import { ChooseActionPage } from '../pages/ChooseActionPage'
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
  const [pairedView, setPairedView] = useState<'home' | 'watch'>('home')

  if (status === 'loading') {
    return <p>Loading…</p>
  }

  if (status === 'waiting') {
    return <InviteWaitingPage />
  }

  if (status === 'paired') {
    if (pairedView === 'watch') {
      // WatchProvider mounts only here, not app-wide like Auth/Couple —
      // its state is only ever needed while this screen is open.
      return (
        <WatchProvider>
          <WatchTogetherPage onBack={() => setPairedView('home')} />
        </WatchProvider>
      )
    }
    return <CoupleHomePage onOpenWatch={() => setPairedView('watch')} />
  }

  return view === 'choose' ? (
    <ChooseActionPage onChooseJoin={() => setView('join')} />
  ) : (
    <JoinSpacePage onBack={() => setView('choose')} />
  )
}
