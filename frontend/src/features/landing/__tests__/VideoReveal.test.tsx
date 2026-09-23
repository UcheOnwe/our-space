import { render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoReveal } from '../VideoReveal'

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void
let lastCallback: ObserverCallback | null = null

beforeEach(() => {
  lastCallback = null
  // A real class — see useScrollReveal.test.tsx's own doc comment on why
  // `vi.fn().mockImplementation(...)` isn't reliably constructible.
  class FakeIntersectionObserver {
    constructor(callback: ObserverCallback) {
      lastCallback = callback
    }
    observe = vi.fn()
    disconnect = vi.fn()
  }
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  // Simulates THIS exact environment's own real behavior (confirmed during
  // implementation: `prefers-reduced-motion: reduce` reports true here) —
  // the regression this test protects against only reproduces under
  // reduced motion, so it must be forced on rather than left at whatever
  // jsdom's own default happens to be.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({ matches: query.includes('prefers-reduced-motion') })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('VideoReveal', () => {
  it('does NOT mount a <video> element until scrolled into view — never loads all landing videos on initial page load', () => {
    const { container } = render(<VideoReveal src="/landing/gameplay.mp4" ariaLabel="Gameplay" />)
    expect(container.querySelector('video')).not.toBeInTheDocument()
  })

  it('mounts the <video> once IntersectionObserver reports intersection, even under reduced motion — the actual bug found during implementation (every video mounted immediately because a shared hook conflated "skip the entrance animation" with "skip lazy-loading")', () => {
    const { container } = render(<VideoReveal src="/landing/gameplay.mp4" ariaLabel="Gameplay" />)
    expect(container.querySelector('video')).not.toBeInTheDocument()

    act(() => lastCallback!([{ isIntersecting: true }]))

    const video = container.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute('src', '/landing/gameplay.mp4')
    expect(video).toHaveAttribute('autoplay')
    // React sets `muted` as a DOM property, not an HTML attribute (a
    // well-known React/media-element quirk) — check the property instead.
    expect((video as HTMLVideoElement).muted).toBe(true)
    expect(video).toHaveAttribute('loop')
  })

  it('unmounts the video again once scrolled back out of view (once: false)', () => {
    const { container } = render(<VideoReveal src="/landing/gameplay.mp4" ariaLabel="Gameplay" />)
    act(() => lastCallback!([{ isIntersecting: true }]))
    expect(container.querySelector('video')).toBeInTheDocument()

    act(() => lastCallback!([{ isIntersecting: false }]))
    expect(container.querySelector('video')).not.toBeInTheDocument()
  })
})
