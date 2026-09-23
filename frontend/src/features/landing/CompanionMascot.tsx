import { COLOR_VARIANTS, COMPANION_TYPES } from '../../companions/registry'
import type { CompanionTypeId } from '../../companions/types'
import styles from './CompanionMascot.module.css'

interface CompanionMascotProps {
  type: CompanionTypeId
  /** Defaults to the Companion's own default color — every landing
   * placement uses each Companion's canonical look, never an arbitrary
   * recolor, so the showcase reads as "the real Companions," not a
   * palette exercise. */
  className?: string
  /** Idle motion applied to the OUTER wrapper only (float/hover/drift) —
   * see this component's own doc comment for why the Companion's own
   * internal micro-animations (blink, Nova Guardian's cape sway) aren't
   * reproduced here. */
  motion?: 'float' | 'hover' | 'drift' | 'none'
}

/**
 * Renders a REAL registry Companion — the same `buildSvgMarkup` function
 * and `dangerouslySetInnerHTML` pattern CompanionProfileScreen.tsx already
 * uses (see that file's own doc comment on why: the registry's SVG
 * builder returns markup this app generated itself, never user input).
 * The landing page never invents a new companion or recolors one
 * arbitrarily — it only ever asks the SAME shared registry for one of the
 * 5 real Companions.
 *
 * DELIBERATE SCOPE LIMIT: a Companion's own internal micro-animations
 * (the idle eye-blink every Companion has, Nova Guardian's cape-sway/
 * crystal-pulse) are wired up via GLOBAL, unscoped CSS classes baked into
 * the raw SVG string (`our-space-companion-eye`, `nova-guardian-cape`,
 * etc. — see companionShapes.ts) that only exist today inside
 * CompanionProfileScreen.module.css's `:global(...)` rules. Reaching into
 * that unrelated, already-shipped stylesheet (or duplicating its
 * keyframes into a second file, risking drift) for a marketing page was a
 * worse trade than simply not reproducing those specific micro-animations
 * here — the Companion still renders with its correct shape/color either
 * way. This component instead applies its OWN outer-wrapper idle motion
 * (float/hover/drift — see CompanionMascot.module.css), which is fully
 * self-contained and exactly what a decorative landing placement needs.
 */
export function CompanionMascot({ type, className, motion = 'float' }: CompanionMascotProps) {
  const definition = COMPANION_TYPES[type]
  const colorId = definition.defaultColor
  const motionClass = motion === 'none' ? '' : styles[motion]
  const classes = [styles.wrapper, motionClass, className].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      role="img"
      aria-label={`${definition.displayName} Companion`}
      dangerouslySetInnerHTML={{ __html: definition.buildSvgMarkup(colorId, COLOR_VARIANTS[colorId].hex) }}
    />
  )
}
