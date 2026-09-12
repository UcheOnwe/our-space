import type { WorldPoint } from './avatars/avatarBehavior'

/**
 * V1 walkable floor bounds — a coarse, hand-placed approximation of the
 * room's illustrated floor, not a navmesh. It exists only to stop a
 * destination request from sending an avatar through a wall or off the
 * edge of the floor entirely.
 *
 * Two axis-aligned rectangles, in the same fixed 1600x900 world space as
 * everything else in this feature (see constants.ts), covering the two
 * floor areas the production room composition actually has (see
 * roomAssets.ts for how those were identified against the approved master
 * composition): the main open-plan room, and the separate bedroom alcove
 * reached through its own doorway. Both are placed comfortably inside the
 * real floor's visible edges, not flush against them, so an avatar never
 * reads as clipping into a wall even though this is an approximation.
 */
export interface WorldRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export const WALKABLE_FLOOR_ZONES: WorldRect[] = [
  // Main room: living area (couch/TV/coffee table), desk corner, dining
  // table, and entry — all one continuous floor in the production room.
  { x0: 110, y0: 420, x1: 1300, y1: 860 },
  // Bedroom alcove floor, through the doorway — a separate, smaller zone
  // rather than extending the main rectangle, since the doorway itself is
  // much narrower than either room.
  { x0: 970, y0: 330, x1: 1260, y1: 430 },
]

/** True if `x,y` falls inside any walkable zone. */
export function isWithinWalkableArea(x: number, y: number): boolean {
  return WALKABLE_FLOOR_ZONES.some((zone) => x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1)
}

/**
 * Clamps a requested destination to the nearest point still inside a
 * walkable zone — a destination request outside the walkable area is
 * clamped rather than rejected outright, so a slightly-off click/request
 * still produces a sensible nearby destination instead of doing nothing.
 * Already-walkable points pass through unchanged.
 */
export function clampToWalkableArea(x: number, y: number): WorldPoint {
  if (isWithinWalkableArea(x, y)) return { x, y }

  let closest: WorldPoint | null = null
  let closestDistanceSquared = Infinity

  for (const zone of WALKABLE_FLOOR_ZONES) {
    const clampedX = Math.min(Math.max(x, zone.x0), zone.x1)
    const clampedY = Math.min(Math.max(y, zone.y0), zone.y1)
    const dx = clampedX - x
    const dy = clampedY - y
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared
      closest = { x: clampedX, y: clampedY }
    }
  }

  // WALKABLE_FLOOR_ZONES is never empty, so `closest` is always assigned
  // above — the fallback below only satisfies the type checker.
  return closest ?? { x, y }
}

/**
 * V1 furniture obstacles — coarse floor-footprint rectangles for the
 * major pieces an avatar shouldn't be able to walk straight through.
 * Deliberately smaller than each piece's full visual bounding box: a
 * couch's tall back cushions or a desk's monitor don't block floor space
 * at floor level, only the base/legs actually sitting on the rug/wood do,
 * so shrinking each rectangle to roughly that base footprint (read off
 * the same production placements in roomAssets.ts) keeps a walking route
 * from detouring around empty air above the furniture.
 *
 * `desk` and `chair` share one combined rectangle rather than two
 * separate ones — the chair sits directly in front of the desk in their
 * calibrated placement, and V1 routing (below) only ever needs "is this
 * furniture grouping in the way," not which specific piece within it.
 * `dining-table` isn't in roomAssets.ts's FURNITURE_PLACEMENTS at all — it
 * (with its four chairs) is fixed backplate decor, not a separate cutout —
 * so its rectangle is measured directly against the room composition
 * rather than derived from a config entry.
 */
export const FURNITURE_OBSTACLES: WorldRect[] = [
  { x0: 594, y0: 555, x1: 894, y1: 645 }, // couch
  { x0: 420, y0: 450, x1: 700, y1: 560 }, // coffee table
  { x0: 952, y0: 318, x1: 1232, y1: 398 }, // bed
  // desk + chair — y1 extended to 440 (past the chair's own 410 floor
  // anchor) specifically so this overlaps the main walkable zone's y0=420
  // boundary; without that overlap a straight-path check could never
  // register this as blocking anything (an obstacle sitting entirely
  // outside the walkable bounds can't intersect a segment between two
  // points that are, by definition, inside them).
  { x0: 604, y0: 326, x1: 864, y1: 440 },
  { x0: 122, y0: 448, x1: 402, y1: 538 }, // TV / media console — shifted +30 in x with the sprite itself (roomAssets.ts)
  { x0: 930, y0: 450, x1: 1150, y1: 590 }, // dining table + chairs (backplate decor)
]

/**
 * Segment-vs-AABB overlap test (Liang-Barsky line clipping, repurposed:
 * if any portion of the parametrized segment `p0 -> p1` for `t` in [0,1]
 * survives clipping against all four of the rectangle's half-planes,
 * the segment overlaps it). Also correctly reports an endpoint that
 * starts/ends inside the rectangle, not just a clean pass-through.
 */
export function segmentIntersectsRect(p0: WorldPoint, p1: WorldPoint, rect: WorldRect): boolean {
  let tMin = 0
  let tMax = 1
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y

  // Clips [tMin, tMax] against one half-plane `p*t <= q`. Returns false
  // the moment the interval collapses to empty — the segment cannot
  // possibly intersect the rect, so the caller can stop immediately.
  function clip(p: number, q: number): boolean {
    if (p === 0) return q >= 0 // parallel to this pair of edges — inside iff already on the near side
    const r = q / p
    if (p < 0) {
      if (r > tMax) return false
      if (r > tMin) tMin = r
    } else {
      if (r < tMin) return false
      if (r < tMax) tMax = r
    }
    return true
  }

  if (!clip(-dx, p0.x - rect.x0)) return false
  if (!clip(dx, rect.x1 - p0.x)) return false
  if (!clip(-dy, p0.y - rect.y0)) return false
  if (!clip(dy, rect.y1 - p0.y)) return false

  return tMin <= tMax
}

/** The first obstacle (in FURNITURE_OBSTACLES's own order — there's no
 * "closest first" concept yet, V1-simple) whose rectangle the straight
 * segment from `start` to `destination` passes through, or `null` if the
 * direct path is clear. */
export function findBlockingObstacle(start: WorldPoint, destination: WorldPoint): WorldRect | null {
  return FURNITURE_OBSTACLES.find((rect) => segmentIntersectsRect(start, destination, rect)) ?? null
}

// How far outside an obstacle's own rectangle a detour waypoint sits —
// just enough clearance that walking through it doesn't read as clipping
// the furniture's edge.
const DETOUR_CLEARANCE_WORLD_UNITS = 40

/**
 * Tries a waypoint centered over each of `obstacle`'s four sides (pushed
 * outward by DETOUR_CLEARANCE_WORLD_UNITS) as a one-waypoint detour
 * around it — e.g. "top" is `{ x: obstacle's horizontal center, y:
 * obstacle.y0 - clearance }`, going over the top of the obstacle rather
 * than around a diagonal corner. Side-center waypoints, not corners, is
 * the important part: a corner sits diagonally opposite whichever side
 * `start`/`destination` approach from, so at least one of its two legs
 * tends to still clip the obstacle when both points sit within its OWN
 * span on the other axis (e.g. both to the left/right of a wide couch,
 * at a Y already inside the couch's own row) — exactly the common case
 * of "walk past a piece of furniture in a straight line." A side-center
 * waypoint goes straight over/under/around that side instead, which
 * actually clears it.
 *
 * Keeps only candidates that are themselves walkable AND whose two legs
 * (start->waypoint, waypoint->destination) don't cut through ANY
 * obstacle — not just the one being routed around, since a naive pick
 * can walk straight into a second piece of furniture. Among the
 * candidates that pass, returns the one with the shortest total detour
 * distance. Returns `null` if none work (V1-simple: the caller falls
 * back to a direct route rather than searching further).
 */
export function findDetourWaypoint(start: WorldPoint, destination: WorldPoint, obstacle: WorldRect): WorldPoint | null {
  const centerX = (obstacle.x0 + obstacle.x1) / 2
  const centerY = (obstacle.y0 + obstacle.y1) / 2
  const candidates: WorldPoint[] = [
    { x: centerX, y: obstacle.y0 - DETOUR_CLEARANCE_WORLD_UNITS }, // over the top
    { x: centerX, y: obstacle.y1 + DETOUR_CLEARANCE_WORLD_UNITS }, // under the bottom
    { x: obstacle.x0 - DETOUR_CLEARANCE_WORLD_UNITS, y: centerY }, // around the left
    { x: obstacle.x1 + DETOUR_CLEARANCE_WORLD_UNITS, y: centerY }, // around the right
  ]

  let best: WorldPoint | null = null
  let bestDetourDistance = Infinity

  for (const candidate of candidates) {
    if (!isWithinWalkableArea(candidate.x, candidate.y)) continue
    if (FURNITURE_OBSTACLES.some((rect) => segmentIntersectsRect(start, candidate, rect))) continue
    if (FURNITURE_OBSTACLES.some((rect) => segmentIntersectsRect(candidate, destination, rect))) continue

    const detourDistance =
      Math.hypot(candidate.x - start.x, candidate.y - start.y) + Math.hypot(destination.x - candidate.x, destination.y - candidate.y)
    if (detourDistance < bestDetourDistance) {
      bestDetourDistance = detourDistance
      best = candidate
    }
  }

  return best
}

/**
 * The whole V1 "routing" story: clamp the requested destination to the
 * walkable floor, then — if the straight line to it would cut through a
 * piece of furniture — insert one detour waypoint around that obstacle's
 * nearest usable corner. Returns an ordered list of one or two points to
 * walk through in sequence; AvatarMotionController.ts walks each in turn
 * without returning to idle between them.
 *
 * Deliberately NOT general pathfinding: only the FIRST blocking obstacle
 * on the direct path is considered, and only ONE detour point is ever
 * inserted. A destination that needs weaving around several pieces of
 * furniture may still end up walking through one of them — full
 * navmesh/A* routing is an explicit later slice, not this one.
 */
export function computeRoute(start: WorldPoint, destination: WorldPoint): WorldPoint[] {
  const target = clampToWalkableArea(destination.x, destination.y)

  const blocking = findBlockingObstacle(start, target)
  if (!blocking) return [target]

  const detour = findDetourWaypoint(start, target, blocking)
  if (detour) return [detour, target]

  // No clean single-corner detour found (e.g. start is already pressed
  // up against the obstacle's own clearance margin) — walk straight
  // anyway rather than refusing to move at all; this is the same
  // V1-simple fallback posture as the rest of this module.
  return [target]
}
