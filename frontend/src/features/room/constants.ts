/**
 * The room's fixed virtual coordinate system. Every environment/furniture/
 * avatar position (now and in later slices) is expressed in these units,
 * never in real screen pixels — camera.ts is the only code that maps this
 * space onto an actual viewport.
 *
 * Approximate 16:9 landscape, per the approved plan. This is a placeholder
 * for the Slice 1 foundation, not a locked resolution — production
 * background art will determine the real numbers. Kept in their own tiny
 * module (rather than scattered through camera/layer/scene code) so
 * changing them later is a one-line edit, not a search-and-replace.
 */
export const ROOM_WORLD_WIDTH = 1600
export const ROOM_WORLD_HEIGHT = 900
