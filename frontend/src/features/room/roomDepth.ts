/**
 * Y-based depth sorting for the room's movable/depth-relevant entities —
 * currently the two Room Avatars and the lamp (base+glow, kept together as
 * one group). Deliberately NOT a true isometric depth engine: the room
 * stays flat X/Y (see constants.ts), and this is just "whoever's floor
 * contact point sits further down-screen draws on top," reusing PixiJS's
 * own `sortableChildren`/`zIndex` mechanism rather than any bookkeeping of
 * our own.
 *
 * Mental model: smaller floor Y = farther back (draws first/behind);
 * larger floor Y = closer to the viewer (draws last/in front). An avatar
 * whose feet are below the lamp's own base Y should render in front of it;
 * above it, behind it — and since this is recomputed every tick for every
 * moving entity (see RoomCanvas.tsx's tickAvatars), the relationship
 * changes naturally as an avatar walks past the lamp, with no permanent
 * z-index baked in for either.
 *
 * Deliberately generic over any entity with a PixiJS-shaped `{ zIndex }`
 * container — not typed to `AvatarRig`/`Sprite` specifically — so a later
 * slice's furniture/avatar interaction (e.g. a plant an avatar can walk in
 * front of or behind) can join the same sort without this module changing.
 */
export interface DepthSortable {
  container: { zIndex: number }
}

/** Sets `entity`'s draw-order key from its floor/contact-point Y. Call once
 * for a static entity (e.g. the lamp group, positioned once at load time)
 * or every tick for a moving one (e.g. each avatar, whose floor Y changes
 * as it walks). */
export function syncFloorDepth(entity: DepthSortable, floorY: number): void {
  entity.container.zIndex = floorY
}
