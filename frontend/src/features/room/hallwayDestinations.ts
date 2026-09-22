export interface HallwayDestination {
  id: string
  label: string
  icon: string
  onSelect: () => void
}

interface BuildHallwayDestinationsArgs {
  /** Switches the couple's active room back to Lauruch Loft — reuses
   * RoomExperience's own selectActiveRoom call (see onNavigateToRoom),
   * the exact same API/state the room gallery already uses. */
  onGoToLauruchLoft: () => void
  /** The existing Watch Together entry point, identical to the TV
   * hotspot's own callback. */
  onOpenWatch: () => void
}

/**
 * The hallway's destination list — data-driven so a future destination is
 * one more entry here, never a HallwayNavigation.tsx rewrite. Deliberately
 * only real, already-implemented destinations (confirmed with the
 * product owner): Lauruch Loft (an actual active-room switch) and Watch
 * Together (the existing TV flow). No Gaming shortcut — it would just
 * duplicate the room's own Gaming hotspot one screen removed.
 */
export function buildHallwayDestinations({
  onGoToLauruchLoft,
  onOpenWatch,
}: BuildHallwayDestinationsArgs): HallwayDestination[] {
  return [
    { id: 'lauruch-loft', label: 'Lauruch Loft', icon: '🏠', onSelect: onGoToLauruchLoft },
    { id: 'watch', label: 'Watch Together', icon: '📺', onSelect: onOpenWatch },
  ]
}
