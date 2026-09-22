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

  describe('switchHotspot (direct close-up-to-close-up transition, e.g. Door -> Garage)', () => {
    it('moves closeup -> closeup for a different id in one synchronous step, never passing through room', () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useRoomHotspotInteraction())

      act(() => result.current.enterHotspot('door'))
      act(() => vi.advanceTimersByTime(650))
      expect(result.current.phase).toEqual({ status: 'closeup', hotspotId: 'door' })

      act(() => result.current.switchHotspot('garage', 'door'))
      // No 'room' (nor 'entering'/'leaving') phase in between — a single
      // update straight to the new close-up. `viaSwitch: true` marks this
      // as a direct-switch mount (for RoomCanvas.tsx's own opaque-only
      // transition — see types.ts's own doc comment).
      expect(result.current.phase).toEqual({ status: 'closeup', hotspotId: 'garage', cameFrom: 'door', viaSwitch: true })
    })

    it('leaveHotspot returns to cameFrom directly instead of the room when the close-up was reached via a direct switch, and still marks the return trip as viaSwitch', () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useRoomHotspotInteraction())

      act(() => result.current.enterHotspot('door'))
      act(() => vi.advanceTimersByTime(650))
      act(() => result.current.switchHotspot('garage', 'door'))

      act(() => result.current.leaveHotspot())
      // Back to Door directly — not 'leaving'/'room'. No `cameFrom` on
      // this returned-to phase (Door's OWN back button must still say
      // "Back to Room", not point back to Garage) — but `viaSwitch: true`
      // is present regardless, since this mount ALSO needs the
      // opaque-only transition (real-device testing found the room could
      // still flash on this exact return trip without it).
      expect(result.current.phase).toEqual({ status: 'closeup', hotspotId: 'door', viaSwitch: true })
    })

    it('a close-up reached via a direct switch can still leave all the way out normally afterward', () => {
      vi.useFakeTimers()
      const { result } = renderHook(() => useRoomHotspotInteraction())

      act(() => result.current.enterHotspot('door'))
      act(() => vi.advanceTimersByTime(650))
      act(() => result.current.switchHotspot('garage', 'door'))
      act(() => result.current.leaveHotspot()) // garage -> door (cameFrom)

      // Door itself was reached the normal way (enterHotspot), so ITS OWN
      // leaveHotspot goes through the ordinary leaving -> room sequence.
      act(() => result.current.leaveHotspot())
      expect(result.current.phase).toEqual({ status: 'leaving', hotspotId: 'door' })
      act(() => vi.advanceTimersByTime(650))
      expect(result.current.phase).toEqual({ status: 'room' })
    })

    it('ignores switchHotspot when not currently in a closeup', () => {
      const { result } = renderHook(() => useRoomHotspotInteraction())
      act(() => result.current.switchHotspot('garage', 'door'))
      expect(result.current.phase).toEqual({ status: 'room' })
    })
  })
})
