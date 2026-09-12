import { describe, expect, it } from 'vitest'
import {
  FURNITURE_OBSTACLES,
  WALKABLE_FLOOR_ZONES,
  clampToWalkableArea,
  computeRoute,
  findBlockingObstacle,
  findDetourWaypoint,
  isWithinWalkableArea,
  segmentIntersectsRect,
} from '../walkableArea'

// The couch's obstacle rectangle — used throughout as a concrete,
// known-blocking obstacle rather than re-deriving one per test.
const COUCH = FURNITURE_OBSTACLES[0]

function rectsOverlap(a: (typeof FURNITURE_OBSTACLES)[number], b: (typeof FURNITURE_OBSTACLES)[number]): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0
}

describe('FURNITURE_OBSTACLES', () => {
  it('overlaps at least one walkable zone for every obstacle — otherwise it can never block a path', () => {
    // Regression guard: the desk/chair obstacle originally sat entirely
    // above the main walkable zone's own y0, so no straight-path segment
    // between two walkable points could ever reach it — it silently never
    // blocked anything despite being configured. This just confirms every
    // obstacle actually intersects the region it's meant to sit within.
    for (const obstacle of FURNITURE_OBSTACLES) {
      const overlapsSomeZone = WALKABLE_FLOOR_ZONES.some((zone) => rectsOverlap(obstacle, zone))
      expect(overlapsSomeZone).toBe(true)
    }
  })
})

describe('isWithinWalkableArea', () => {
  it('accepts a point comfortably inside the main room zone', () => {
    expect(isWithinWalkableArea(600, 700)).toBe(true)
  })

  it('accepts a point comfortably inside the bedroom alcove zone', () => {
    expect(isWithinWalkableArea(1100, 380)).toBe(true)
  })

  it('rejects a point clearly outside every zone (e.g. through a wall)', () => {
    expect(isWithinWalkableArea(600, 50)).toBe(false)
    expect(isWithinWalkableArea(-100, 700)).toBe(false)
    expect(isWithinWalkableArea(600, 1000)).toBe(false)
  })
})

describe('clampToWalkableArea', () => {
  it('leaves an already-walkable point unchanged', () => {
    expect(clampToWalkableArea(600, 700)).toEqual({ x: 600, y: 700 })
  })

  it('clamps a point outside every zone to the nearest zone edge, not the exact original point', () => {
    const zone = WALKABLE_FLOOR_ZONES[0]
    const clamped = clampToWalkableArea(zone.x0 - 500, (zone.y0 + zone.y1) / 2)
    expect(isWithinWalkableArea(clamped.x, clamped.y)).toBe(true)
    expect(clamped.x).toBe(zone.x0)
  })

  it('clamps to whichever zone is actually closest when multiple zones exist', () => {
    // Far above the main room but near the bedroom alcove zone horizontally.
    const bedroomZone = WALKABLE_FLOOR_ZONES.find((zone) => zone.x0 > 900)!
    const requested = { x: (bedroomZone.x0 + bedroomZone.x1) / 2, y: bedroomZone.y0 - 200 }
    const clamped = clampToWalkableArea(requested.x, requested.y)
    expect(isWithinWalkableArea(clamped.x, clamped.y)).toBe(true)
    expect(clamped.y).toBe(bedroomZone.y0)
  })
})

describe('segmentIntersectsRect', () => {
  const couchCenterY = (COUCH.y0 + COUCH.y1) / 2

  it('reports true for a segment that passes straight through the rect', () => {
    const left = { x: COUCH.x0 - 200, y: couchCenterY }
    const right = { x: COUCH.x1 + 200, y: couchCenterY }
    expect(segmentIntersectsRect(left, right, COUCH)).toBe(true)
  })

  it('reports false for a segment that stays entirely clear of the rect', () => {
    const farAbove = { x: COUCH.x0 - 200, y: COUCH.y0 - 300 }
    const stillFarAbove = { x: COUCH.x1 + 200, y: COUCH.y0 - 300 }
    expect(segmentIntersectsRect(farAbove, stillFarAbove, COUCH)).toBe(false)
  })

  it('reports true when an endpoint starts inside the rect', () => {
    const inside = { x: (COUCH.x0 + COUCH.x1) / 2, y: couchCenterY }
    const farAway = { x: COUCH.x1 + 500, y: couchCenterY }
    expect(segmentIntersectsRect(inside, farAway, COUCH)).toBe(true)
  })

  it('reports false for a segment that passes above the rect entirely, even at the same X range', () => {
    const above1 = { x: COUCH.x0 + 10, y: COUCH.y0 - 50 }
    const above2 = { x: COUCH.x1 - 10, y: COUCH.y0 - 50 }
    expect(segmentIntersectsRect(above1, above2, COUCH)).toBe(false)
  })
})

describe('findBlockingObstacle', () => {
  it('finds the obstacle a straight path would cut through', () => {
    const couchCenterY = (COUCH.y0 + COUCH.y1) / 2
    const start = { x: COUCH.x0 - 200, y: couchCenterY }
    const destination = { x: COUCH.x1 + 200, y: couchCenterY }
    expect(findBlockingObstacle(start, destination)).toBe(COUCH)
  })

  it('returns null for a path with clear open floor', () => {
    // A stretch of the main room comfortably clear of every configured
    // obstacle — well below all of them in Y.
    expect(findBlockingObstacle({ x: 150, y: 830 }, { x: 400, y: 830 })).toBeNull()
  })
})

describe('findDetourWaypoint', () => {
  it('finds a corner whose two legs both avoid the obstacle', () => {
    const couchCenterY = (COUCH.y0 + COUCH.y1) / 2
    const start = { x: COUCH.x0 - 200, y: couchCenterY }
    const destination = { x: COUCH.x1 + 200, y: couchCenterY }

    const waypoint = findDetourWaypoint(start, destination, COUCH)
    expect(waypoint).not.toBeNull()
    expect(isWithinWalkableArea(waypoint!.x, waypoint!.y)).toBe(true)
    expect(segmentIntersectsRect(start, waypoint!, COUCH)).toBe(false)
    expect(segmentIntersectsRect(waypoint!, destination, COUCH)).toBe(false)
  })
})

describe('computeRoute', () => {
  it('routes directly (one waypoint: the destination) when the straight path is clear', () => {
    const route = computeRoute({ x: 150, y: 830 }, { x: 400, y: 830 })
    expect(route).toHaveLength(1)
    expect(route[0]).toEqual({ x: 400, y: 830 })
  })

  it('inserts a detour waypoint when the straight path would cut through an obstacle', () => {
    const couchCenterY = (COUCH.y0 + COUCH.y1) / 2
    const start = { x: COUCH.x0 - 200, y: couchCenterY }
    const destination = { x: COUCH.x1 + 200, y: couchCenterY }

    const route = computeRoute(start, destination)
    expect(route).toHaveLength(2)
    expect(route[1]).toEqual(destination)
    // Both legs of the actual route avoid the couch.
    expect(findBlockingObstacle(start, route[0])).toBeNull()
    expect(findBlockingObstacle(route[0], route[1])).toBeNull()
  })

  it('still clamps an out-of-bounds destination to the walkable area', () => {
    const zone = WALKABLE_FLOOR_ZONES[0]
    const route = computeRoute({ x: 200, y: 800 }, { x: zone.x0 - 1000, y: 800 })
    expect(isWithinWalkableArea(route[route.length - 1].x, route[route.length - 1].y)).toBe(true)
  })
})
