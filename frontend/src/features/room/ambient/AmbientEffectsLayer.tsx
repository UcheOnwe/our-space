import type { CSSProperties } from 'react'
import type { AmbientEffectSpec } from './types'
import styles from './AmbientEffectsLayer.module.css'

interface AmbientEffectsLayerProps {
  effects: AmbientEffectSpec[]
}

const VARIANT_CLASS: Record<AmbientEffectSpec['variant'], string> = {
  glow: styles.glow,
  strip: styles.strip,
  flicker: styles.flicker,
  petal: styles.petal,
}

/**
 * Renders a room/close-up's small list of ambient touches (see
 * afterHoursAmbience.ts) as absolutely positioned, purely decorative
 * overlays. Meant to be rendered as a sibling of the room's own
 * video/image inside the SAME pannable world box, so effects pan/zoom
 * with the artwork for free — it never measures or positions itself
 * against the viewport.
 *
 * `pointer-events: none` and `aria-hidden` on every element: this can
 * never intercept a click/tap meant for a hotspot or activity underneath
 * it, and it's never announced to assistive tech (it's atmosphere, not
 * content). `prefers-reduced-motion` is handled entirely in the CSS
 * module (animations disabled, a static low-opacity look kept instead of
 * nothing) — nothing here branches on it directly.
 */
export function AmbientEffectsLayer({ effects }: AmbientEffectsLayerProps) {
  return (
    <div className={styles.layer} aria-hidden="true">
      {effects.map((effect) => (
        <span
          key={effect.id}
          className={`${styles.effect} ${VARIANT_CLASS[effect.variant]}`}
          style={{
            left: `${effect.xPercent}%`,
            top: `${effect.yPercent}%`,
            width: `${effect.widthPercent}%`,
            height: `${effect.heightPercent}%`,
            // Consumed via var(...) in the module so each variant's own
            // gradient/shadow can reference the same two values instead
            // of every variant needing its own color/timing CSS rule.
            '--ambient-color': effect.color,
            animationDuration: `${effect.durationMs}ms`,
            animationDelay: `${effect.delayMs}ms`,
          } as CSSProperties}
        />
      ))}
    </div>
  )
}
