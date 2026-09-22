import { useEffect, useRef, useState } from 'react'
import type { RoomHotspotPhase } from './types'

// When `closeup` actually mounts (RoomCloseUp) — deliberately EARLIER
// than the room's own ~1000ms zoom-effect transition (CozyLoftRoom.tsx's
// `.activityEffect`, still a separately-set CSS duration) finishes.
// Mounting at the full 1000ms mark made the zoom visibly settle to a
// stop, THEN a separate 350ms crossfade begin — read as "zoom finishes,
// screen sits still, then it navigates" even though nothing was
// literally delayed. Mounting here instead means RoomCloseUp's own
// ~350ms fade-in plays DURING the zoom's last stretch (650ms to 1000ms),
// so both finish together and the whole thing reads as one continuous
// camera move handing off into the close-up, not two sequential
// animations. If either the zoom's own CSS duration or the close-up's
// own fade duration changes, re-derive this as
// (zoom duration - close-up fade duration) to keep them landing together.
const TRANSITION_DURATION_MS = 650

/**
 * The reusable room-interaction state machine: room -> entering(id) ->
 * closeup(id) -> leaving(id) -> room. Knows nothing about TV/gaming
 * specifically — any room with any set of RoomHotspots can use this.
 *
 * `enterHotspot`/`leaveHotspot` only act from the phase they're valid
 * from (`room` and `closeup` respectively), which is what "prevent
 * conflicting interactions while a transition is in progress" means in
 * practice: a click during `entering`/`leaving` is simply ignored.
 */
export function useRoomHotspotInteraction() {
  const [phase, setPhase] = useState<RoomHotspotPhase>({ status: 'room' })
  const timeoutRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    },
    [],
  )

  function enterHotspot(hotspotId: string) {
    if (phase.status !== 'room') return
    setPhase({ status: 'entering', hotspotId })
    timeoutRef.current = window.setTimeout(() => {
      setPhase({ status: 'closeup', hotspotId })
    }, TRANSITION_DURATION_MS)
  }

  function leaveHotspot() {
    if (phase.status !== 'closeup') return
    const { hotspotId, cameFrom } = phase
    // Reached this close-up directly from another one (switchHotspot
    // below) rather than from the plain room — back-navigation returns
    // there directly, the same direct transition in reverse, never
    // dropping through 'room' in between. `viaSwitch: true` on the
    // resulting phase (but deliberately NO `cameFrom`) marks that this
    // mount still needs the opaque-only switch animation even though its
    // own back button correctly falls back to "Back to Room" — see
    // types.ts's own doc comment on why these are separate.
    if (cameFrom) {
      setPhase({ status: 'closeup', hotspotId: cameFrom, viaSwitch: true })
      return
    }
    setPhase({ status: 'leaving', hotspotId })
    timeoutRef.current = window.setTimeout(() => {
      setPhase({ status: 'room' })
    }, TRANSITION_DURATION_MS)
  }

  /**
   * A direct close-up-to-close-up transition (e.g. Door -> Garage) that
   * never passes through 'room' — only valid from an existing close-up,
   * same as leaveHotspot. Unlike enterHotspot, this is a single synchronous
   * phase update with no 'entering'/timer step of its own: the visual
   * "short zoom" transition instead comes from the CALLER re-keying its
   * RoomCloseUp instance by hotspotId (see RoomCanvas.tsx), which replays
   * RoomCloseUp's own existing mount animation for free — reusing the
   * same transition language rather than inventing a second one.
   * `cameFrom` is recorded on the resulting phase so leaveHotspot can
   * return to it directly (see above).
   */
  function switchHotspot(hotspotId: string, cameFrom: string) {
    if (phase.status !== 'closeup') return
    setPhase({ status: 'closeup', hotspotId, cameFrom, viaSwitch: true })
  }

  return { phase, enterHotspot, leaveHotspot, switchHotspot }
}

export { TRANSITION_DURATION_MS as ROOM_HOTSPOT_TRANSITION_DURATION_MS }
