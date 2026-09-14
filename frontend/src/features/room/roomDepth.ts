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

// Locked V1 visual convention (see the approved plan for the bed-lying
// interaction): when both avatars lie on the bed at once, they're both
// positioned at the SAME authored `BED_ACTIVITY_POINTS.pose` (V1 has only
// one lying spot — see avatarActivities.ts), so their floor Y is
// IDENTICAL, not just close — an ordinary Y-sort has no natural tie-
// breaker for that and would fall back to insertion/array order, which
// isn't a deliberate choice. This nudge is deliberately tiny — far
// smaller than any real gap between two different floor positions
// elsewhere in the room — so it can only ever matter in that exact tie,
// never quietly reorder anything else.
const FEMALE_OVER_MALE_LYING_BIAS_WORLD_UNITS = 0.5

/**
 * Computes an avatar's depth-sort key, applying the female-over-male bed
 * tie-break ONLY while lying (couch/desk-chair sitting and ordinary
 * standing/walking use the avatar's plain floor Y, unmodified — the
 * locked convention is specific to sharing the bed). `gender` comes
 * straight from the avatar's own AvatarRigConfig — see RoomCanvas.tsx.
 */
export function computeAvatarDepthKey(floorY: number, pose: 'standing' | 'sitting' | 'lying', gender: 'male' | 'female'): number {
  if (pose !== 'lying') return floorY
  return gender === 'female' ? floorY + FEMALE_OVER_MALE_LYING_BIAS_WORLD_UNITS : floorY - FEMALE_OVER_MALE_LYING_BIAS_WORLD_UNITS
}
