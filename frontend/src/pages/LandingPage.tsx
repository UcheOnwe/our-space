import { createPortal } from 'react-dom'
import { Hero } from '../features/landing/Hero'
import { RoomReveal } from '../features/landing/RoomReveal'
import { TogetherSection } from '../features/landing/TogetherSection'
import { WatchTogetherSection } from '../features/landing/WatchTogetherSection'
import { PlayTogetherSection } from '../features/landing/PlayTogetherSection'
import { ExploreSection } from '../features/landing/ExploreSection'
import { PersonalizeSection } from '../features/landing/PersonalizeSection'
import { CompanionShowcase } from '../features/landing/CompanionShowcase'
import { BrowserCompanionSection } from '../features/landing/BrowserCompanionSection'
import { CreatorSection } from '../features/landing/CreatorSection'
import { FinalCta } from '../features/landing/FinalCta'
import { LandingNav } from '../features/landing/LandingNav'
import styles from './LandingPage.module.css'

interface LandingPageProps {
  onLogin: () => void
  onGetStarted: () => void
}

/**
 * The public, unauthenticated entry experience — see AuthGate.tsx's own
 * doc comment for exactly how this plugs into the existing (router-less)
 * auth state machine. Composes the section components in
 * features/landing/ in the approved narrative order; owns no page-level
 * state itself beyond forwarding the two navigation callbacks it's given.
 *
 * PORTALED to `#landing-root` (a plain, unconstrained sibling of `#root`
 * in index.html) rather than rendered inline — the FIRST implementation
 * instead had every section fight `#root`'s `max-width: 960px` (index.css)
 * with a per-section `left: 50%; margin-left: -50vw` breakout. That trick
 * only cancels out correctly when its containing block's width already
 * equals the true viewport width; nested inside a 960px-capped `#root`,
 * `left: 50%` resolved against ~960px while `margin-left: -50vw` resolved
 * against the REAL viewport (1920px, 1440px, …) — the mismatch between
 * those two references grows with viewport width, which is exactly why
 * wide desktop viewports showed both a large unused gutter on one side
 * AND text clipped off-screen on the other, while it happened to look
 * closer to correct on narrower viewports where `#root` is closer to
 * full-width anyway. Portaling sidesteps the whole class of bug: nothing
 * downstream needs viewport math at all, since `#landing-root` was never
 * width-constrained in the first place. This is the SAME escape-a-
 * transformed-or-constrained-ancestor pattern this codebase already uses
 * elsewhere (RoomCloseUp's Back button, ExplorationHud) — one correct
 * shell, not fragile math repeated in every section.
 */
export function LandingPage({ onLogin, onGetStarted }: LandingPageProps) {
  const portalTarget = document.getElementById('landing-root')
  if (!portalTarget) return null

  return createPortal(
    <div className={styles.page}>
      <LandingNav onLogin={onLogin} onGetStarted={onGetStarted} />
      <Hero onGetStarted={onGetStarted} />
      <RoomReveal />
      <TogetherSection />
      <WatchTogetherSection />
      <PlayTogetherSection />
      <ExploreSection />
      <PersonalizeSection />
      <CompanionShowcase />
      <BrowserCompanionSection />
      <CreatorSection />
      <FinalCta onLogin={onLogin} onGetStarted={onGetStarted} />
    </div>,
    portalTarget,
  )
}
