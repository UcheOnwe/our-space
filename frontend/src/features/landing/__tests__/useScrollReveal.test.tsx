import { render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollReveal } from '../useScrollReveal'

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void

let lastCallback: ObserverCallback | null = null
let disconnectSpy: ReturnType<typeof vi.fn>
let observeSpy: ReturnType<typeof vi.fn>
let matchMediaResult = false

beforeEach(() => {
  disconnectSpy = vi.fn()
  observeSpy = vi.fn()
  lastCallback = null
  matchMediaResult = false

  // A real class, not `vi.fn().mockImplementation(...)` — the latter isn't
  // guaranteed constructible with `new` across Vitest versions, and
  // useScrollReveal.ts genuinely does `new IntersectionObserver(...)`.
  class FakeIntersectionObserver {
    constructor(callback: ObserverCallback) {
      lastCallback = callback
    }
    observe = observeSpy
    disconnect = disconnectSpy
  }
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? matchMediaResult : false,
    })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function Harness({ skipReducedMotionShortcut }: { skipReducedMotionShortcut?: boolean }) {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>({ skipReducedMotionShortcut })
  return (
    <div ref={ref} data-testid="target">
      {isVisible ? 'visible' : 'hidden'}
    </div>
  )
}

describe('useScrollReveal', () => {
  it('starts hidden and becomes visible once IntersectionObserver reports intersection', () => {
    const { getByTestId } = render(<Harness />)
    expect(getByTestId('target').textContent).toBe('hidden')
    expect(observeSpy).toHaveBeenCalled()

    act(() => lastCallback!([{ isIntersecting: true }]))
    expect(getByTestId('target').textContent).toBe('visible')
  })

  it('reduced motion shows content immediately and never creates an observer — this is the correct behavior for a text/image reveal', () => {
    matchMediaResult = true
    const { getByTestId } = render(<Harness />)
    expect(getByTestId('target').textContent).toBe('visible')
    expect(observeSpy).not.toHaveBeenCalled()
  })

  it("skipReducedMotionShortcut ignores reduced motion and still requires a real intersection — this is the exact bug VideoReveal's own usage depends on not regressing (every video mounting immediately under reduced motion)", () => {
    matchMediaResult = true
    const { getByTestId } = render(<Harness skipReducedMotionShortcut />)
    // Still hidden — reduced motion must NOT short-circuit this caller.
    expect(getByTestId('target').textContent).toBe('hidden')
    expect(observeSpy).toHaveBeenCalled()

    act(() => lastCallback!([{ isIntersecting: true }]))
    expect(getByTestId('target').textContent).toBe('visible')
  })
})
