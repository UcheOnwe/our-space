interface Point {
  x: number
  y: number
}

// Keeps the Hug anchor — and the hearts, which float upward from it — off
// the presence area's edges even when the two real positions are near a
// corner. The top margin is larger than the others to leave room for the
// hearts to float up without clipping.
const SAFE_MARGIN_X = 0.08
const SAFE_MARGIN_TOP = 0.15
const SAFE_MARGIN_BOTTOM = 0.08

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Picks where a Hug should visually happen: the midpoint of the two real
 * positions, nudged inward so it never renders clipped near an edge.
 * Purely a rendering decision — the result is never written back into
 * presence.move, the presence registry, or sent over the WebSocket at all.
 */
export function computeSafeHugAnchor(a: Point, b: Point): Point {
  const midpointX = (a.x + b.x) / 2
  const midpointY = (a.y + b.y) / 2
  return {
    x: clamp(midpointX, SAFE_MARGIN_X, 1 - SAFE_MARGIN_X),
    y: clamp(midpointY, SAFE_MARGIN_TOP, 1 - SAFE_MARGIN_BOTTOM),
  }
}
