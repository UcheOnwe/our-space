import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRoomHotspotInteraction } from '../useRoomHotspotInteraction'

afterEach(() => {
  vi.useRealTimers()
})

describe('useRoomHotspotInteraction', () => {
  it('starts in the room phase', () => {
    const { result } = renderHook(() => useRoomHotspotInteraction())
    expect(result.current.phase).toEqual({ status: 'room' })
  })

  it('moves room -> entering -> closeup for the activated hotspot', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useRoomHotspotInteraction())

    act(() => result.current.enterHotspot('tv'))
    expect(result.current.phase).toEqual({ status: 'entering', hotspotId: 'tv' })

    act(() => vi.advanceTimersByTime(650))
    expect(result.current.phase).toEqual({ status: 'closeup', hotspotId: 'tv' })
  })

  it('moves closeup -> leaving -> room on leaveHotspot', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useRoomHotspotInteraction())

    act(() => result.current.enterHotspot('gaming'))
    act(() => vi.advanceTimersByTime(650))
    expect(result.current.phase).toEqual({ status: 'closeup', hotspotId: 'gaming' })

    act(() => result.current.leaveHotspot())
    expect(result.current.phase).toEqual({ status: 'leaving', hotspotId: 'gaming' })

    act(() => vi.advanceTimersByTime(650))
    expect(result.current.phase).toEqual({ status: 'room' })
  })

  it('ignores a second enterHotspot call while already transitioning/inside a closeup', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useRoomHotspotInteraction())

    act(() => result.current.enterHotspot('tv'))
    // A second hotspot activated mid-transition must not hijack the phase.
    act(() => result.current.enterHotspot('gaming'))
    expect(result.current.phase).toEqual({ status: 'entering', hotspotId: 'tv' })

    act(() => vi.advanceTimersByTime(650))
    expect(result.current.phase).toEqual({ status: 'closeup', hotspotId: 'tv' })

    // Once inside a closeup, entering again (even a different id) is also ignored.
    act(() => result.current.enterHotspot('gaming'))
    expect(result.current.phase).toEqual({ status: 'closeup', hotspotId: 'tv' })
  })

  it('ignores leaveHotspot when not currently in a closeup', () => {
    const { result } = renderHook(() => useRoomHotspotInteraction())
    act(() => result.current.leaveHotspot())
    expect(result.current.phase).toEqual({ status: 'room' })
  })
})
