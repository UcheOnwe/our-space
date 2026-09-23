import type { ReactNode } from 'react'
import styles from './FullBleedSection.module.css'

interface FullBleedSectionProps {
  children: ReactNode
  className?: string
  /** Sets this section's own background (a plain CSS color/gradient
   * string) — how the landing page achieves Moonbounce-style light/dark
   * section transitions without any scroll-linked JS: each section just
   * declares its own flat background, and the visual "transition" is
   * simply two adjacent full-bleed sections having different ones. */
  background?: string
  id?: string
  /** Overrides the default `.inner` vertical padding — Hero is the one
   * consumer that needs this: it must fit its headline/CTA/mascot inside
   * the FIRST viewport (no scrolling required to discover the mascot),
   * which the generous default padding (comfortable for every other,
   * scroll-to-reveal section) was actively fighting against. */
  innerClassName?: string
}

/**
 * A full-width section canvas. This used to need a `left: 50%; margin:
 * -50vw` breakout to escape `#root`'s constrained width — now that
 * LandingPage.tsx portals its whole subtree to the unconstrained
 * `#landing-root` (see that file's own doc comment), this component
 * doesn't need any viewport math at all: its parent is ALREADY the true
 * viewport width, so a plain `width: 100%` genuinely means full-bleed.
 */
export function FullBleedSection({ children, className, background, id, innerClassName }: FullBleedSectionProps) {
  const classes = [styles.section, className].filter(Boolean).join(' ')
  const innerClasses = [styles.inner, innerClassName].filter(Boolean).join(' ')
  return (
    <section id={id} className={classes} style={background ? { background } : undefined}>
      <div className={innerClasses}>{children}</div>
    </section>
  )
}
