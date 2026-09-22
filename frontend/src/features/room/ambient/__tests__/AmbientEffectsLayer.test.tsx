import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AmbientEffectsLayer } from '../AmbientEffectsLayer'
import type { AmbientEffectSpec } from '../types'
import styles from '../AmbientEffectsLayer.module.css'

const EFFECTS: AmbientEffectSpec[] = [
  { id: 'a', variant: 'glow', xPercent: 10, yPercent: 20, widthPercent: 5, heightPercent: 6, color: '#fff', durationMs: 4000, delayMs: 0 },
  { id: 'b', variant: 'strip', xPercent: 50, yPercent: 60, widthPercent: 20, heightPercent: 3, color: '#000', durationMs: 3000, delayMs: 500 },
]

describe('AmbientEffectsLayer', () => {
  it('renders exactly one decorative element per configured effect, positioned by its own spec', () => {
    const { container } = render(<AmbientEffectsLayer effects={EFFECTS} />)

    const layer = container.querySelector(`.${styles.layer}`)!
    const rendered = layer.querySelectorAll(`.${styles.effect}`)
    expect(rendered).toHaveLength(2)
    expect((rendered[0] as HTMLElement).style.left).toBe('10%')
    expect((rendered[0] as HTMLElement).style.top).toBe('20%')
    expect((rendered[1] as HTMLElement).style.width).toBe('20%')
  })

  it('the layer itself is aria-hidden and carries the pointer-events: none class', () => {
    // jsdom doesn't apply imported stylesheet rules for getComputedStyle
    // (no real CSS engine) — asserting the CSS-module class itself is
    // applied is this codebase's established way of checking CSS-driven
    // behavior in tests (see e.g. PresenceOverlay.test.tsx's
    // avatarDissolved class checks).
    const { container } = render(<AmbientEffectsLayer effects={EFFECTS} />)

    const layer = container.querySelector(`.${styles.layer}`)!
    expect(layer).toHaveAttribute('aria-hidden', 'true')
    expect(layer.className).toBe(styles.layer)
  })

  it('renders nothing (an empty layer) for an empty effects list', () => {
    const { container } = render(<AmbientEffectsLayer effects={[]} />)

    const layer = container.querySelector(`.${styles.layer}`)!
    expect(layer.children).toHaveLength(0)
  })
})
