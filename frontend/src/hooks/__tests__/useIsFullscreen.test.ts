import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useIsFullscreen } from '../useIsFullscreen'

function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value: element,
  })
}

afterEach(() => {
  setFullscreenElement(null)
})

describe('useIsFullscreen', () => {
  it('starts false when nothing is fullscreen', () => {
    const { result } = renderHook(() => useIsFullscreen())
    expect(result.current).toBe(false)
  })

  it('becomes true after a fullscreenchange event reports a fullscreen element', () => {
    const { result } = renderHook(() => useIsFullscreen())

    act(() => {
      setFullscreenElement(document.createElement('iframe'))
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    expect(result.current).toBe(true)
  })

  it('returns to false once fullscreen exits', () => {
    const { result } = renderHook(() => useIsFullscreen())

    act(() => {
      setFullscreenElement(document.createElement('iframe'))
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(result.current).toBe(true)

    act(() => {
      setFullscreenElement(null)
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    expect(result.current).toBe(false)
  })
})
