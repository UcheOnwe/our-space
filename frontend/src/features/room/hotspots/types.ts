/**
 * The reusable shape any room can use to describe an interactive point
 * over a physical object (a TV, a gaming setup, a light switch later,
 * etc). Deliberately small — this is not a generalized world/scene
 * engine, just enough structure for a room component to declare "here is
 * a clickable thing, here's what it zooms into" and reuse the same
 * icon/zoom/close-up mechanics `useRoomHotspotInteraction` and
 * `RoomHotspotIcon`/`RoomCloseUp` already provide.
 */
export interface RoomHotspot {
  /** Stable id, unique within one room — becomes the state machine's
   * `hotspotId` and the React key. */
  id: string
  /** Concise label revealed on hover/focus ("Watch", "Play"). */
  label: string
  /** A single glyph rendered as the default-visible icon. Plain text/emoji
   * for V1 — no custom icon asset pipeline exists yet, and one glyph per
   * hotspot is enough to be "discoverable without hover." */
  icon: string
  /** Where the icon sits over the room, as percentages of the room's own
   * box (0-100). Also used as the zoom's `transform-origin`, so the
   * camera push feels like it's aimed at the physical object. */
  position: { xPercent: number; yPercent: number }
  /** Runtime video path for this hotspot's close-up environment. */
  closeUpSrc: string
}

/**
 * The room-interaction state machine, generic over any hotspot id — this
 * is the "room / transitioning-to-X / X / transitioning-to-room" shape
 * asked for, adapted so it isn't hardcoded to specific hotspots (a second
 * room's hotspots reuse the exact same states). `entering`/`leaving` are
 * the only two transition phases; both block starting a new interaction
 * until they resolve (see useRoomHotspotInteraction).
 */
export type RoomHotspotPhase =
  | { status: 'room' }
  | { status: 'entering'; hotspotId: string }
  /** `cameFrom`, when present, records the OTHER close-up this one was
   * reached directly from (see useRoomHotspotInteraction's `switchHotspot`)
   * rather than from the plain room — e.g. Garage reached via Door's
   * "Other Spaces" list. `leaveHotspot` uses it to return there directly
   * instead of falling back to the room, so back-navigation matches how
   * the user actually arrived.
   *
   * `viaSwitch`, when true, means THIS specific mount was reached via a
   * direct close-up-to-close-up transition (in EITHER direction —
   * `switchHotspot` forward, or `leaveHotspot`'s own `cameFrom` return
   * trip backward) rather than from the plain room. Deliberately a
   * SEPARATE flag from `cameFrom`, not derived from it: `cameFrom` is
   * about where THIS close-up's own back button should go, and is
   * correctly absent on the return trip (Garage -> Door: Door's own back
   * button must say "Back to Room", not point back to Garage) — but the
   * MOUNT ANIMATION still needs to know it arrived via a direct switch
   * either way, so the room can never flash between two close-ups in
   * either direction (see RoomCanvas.tsx's own `transitionStyle` derived
   * from this, and RoomCloseUp.tsx's doc comment on what that controls). */
  | { status: 'closeup'; hotspotId: string; cameFrom?: string; viaSwitch?: boolean }
  | { status: 'leaving'; hotspotId: string }
