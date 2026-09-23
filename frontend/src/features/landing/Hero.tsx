import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/shared/Button'
import { CompanionMascot } from './CompanionMascot'
import { FullBleedSection } from './FullBleedSection'
import styles from './Hero.module.css'

interface HeroProps {
  onGetStarted: () => void
}

/**
 * The first thing a visitor sees — must be immediately recognizable as
 * Our Space. The default Companion (Cosmic Blob) is the recurring
 * mascot device, the same role Moonbounce's own icon plays on its site,
 * but entirely Our Space's own registry/visual language.
 *
 * Desktop gets a subtle cursor-aware drift on the mascot (a `pointermove`
 * listener updating two CSS custom properties, `--tilt-x`/`--tilt-y`,
 * that a transform reads — no per-frame React state, so this never
 * re-renders); mobile skips it entirely (no persistent mouse there) and
 * relies on the idle float keyframe alone. Both respect
 * `prefers-reduced-motion` (see CompanionMascot's own guard).
 */
export function Hero({ onGetStarted }: HeroProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  // A lazy initializer, not a plain `useState(false)` + effect-set: both
  // matchMedia checks need no ref/DOM measurement, so this resolves during
  // the FIRST render instead of triggering an extra one from an effect.
  // Optional chaining: jsdom (the test environment) has no matchMedia at
  // all, unlike a real browser — fails closed to "no tilt" rather than
  // throwing, the same defensive style useScrollReveal.ts already uses.
  const [desktopTiltEnabled] = useState(() => {
    const query = window.matchMedia?.('(min-width: 701px) and (hover: hover) and (pointer: fine)')
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    return Boolean(query?.matches) && !reduceMotion?.matches
  })

  useEffect(() => {
    if (!desktopTiltEnabled) return
    const stage = stageRef.current
    if (!stage) return

    function handlePointerMove(event: PointerEvent) {
      const rect = stage!.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width - 0.5
      const y = (event.clientY - rect.top) / rect.height - 0.5
      stage!.style.setProperty('--tilt-x', `${(x * 14).toFixed(2)}px`)
      stage!.style.setProperty('--tilt-y', `${(y * 14).toFixed(2)}px`)
    }

    stage.addEventListener('pointermove', handlePointerMove)
    return () => stage.removeEventListener('pointermove', handlePointerMove)
  }, [desktopTiltEnabled])

  return (
    <FullBleedSection className={styles.hero} innerClassName={styles.heroInner}>
      <div className={styles.copy}>
        <h1 className={styles.headline}>
          Your space.
          <br />
          Together, anywhere.
        </h1>
        <p className={styles.subhead}>
          A digital place made for two — watch, play, and explore together, no matter the distance.
        </p>
        <div className={styles.actions}>
          <Button variant="primary" className={styles.cta} onClick={onGetStarted}>
            Enter Our Space
          </Button>
        </div>
      </div>

      <div ref={stageRef} className={`${styles.stage} ${desktopTiltEnabled ? styles.stageTiltable : ''}`}>
        <div className={styles.mascotLarge}>
          <CompanionMascot type="cosmic_blob" motion="float" />
        </div>
        <div className={styles.mascotSmall}>
          <CompanionMascot type="star_wisp" motion="drift" />
        </div>
      </div>
    </FullBleedSection>
  )
}
