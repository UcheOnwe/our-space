import { createContext, useContext, useEffect } from 'react'

/**
 * Lets a component ANYWHERE below a PresenceOverlay register itself as a
 * region where Our Space presence should SUSPEND — the real pointer is
 * inside an embedded activity player (currently: GamePlayer.tsx's
 * `.frameArea`), so the local Mouse Spirit stops tracking/transmitting
 * and hides until the pointer returns to the Our Space surface (see
 * PresenceOverlay.tsx's `insideGameZone` handling).
 *
 * A context rather than a prop threaded through every intermediate
 * component: Gaming's own iframe (GamePlayer.tsx) lives five component
 * levels below the PresenceOverlay that owns cursor state
 * (CoupleHomePage -> RoomExperience -> CozyLoftRoom/AfterHoursRoom ->
 * RoomCloseUp -> GamingActivity -> GamePlayer). A context lets GamePlayer
 * register its own element directly, with zero coordination from
 * anything in between — exactly what "future embedded activities could
 * declare exclusion regions too" needs.
 *
 * Single active zone for now (registering a new element replaces the
 * previous one) — this app only ever shows one embedded player at a time.
 * If that ever changes, this would need to become a Set/registry instead.
 */
export const PresenceExclusionZoneContext = createContext<((element: HTMLElement | null) => void) | null>(null)

/** Registers `element` as the current exclusion zone for as long as the
 * calling component is mounted with a non-null element — a no-op outside
 * a PresenceOverlay (the context value is null there), so components
 * using this stay safe to render in contexts without presence at all. */
export function useExclusionZone(element: HTMLElement | null) {
  const register = useContext(PresenceExclusionZoneContext)
  useEffect(() => {
    register?.(element)
    return () => register?.(null)
  }, [register, element])
}
