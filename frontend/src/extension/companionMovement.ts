/**
 * Pure movement math for the Space Companion overlay — deliberately free of
 * any DOM/PixiJS/browser API so it can be unit-tested the same GPU-free way
 * as the room's own avatar math (see features/room/avatars/avatarBehavior.ts
 * for the same "pure math, impure caller" split). The content script's own
 * requestAnimationFrame loop (contentScriptEntry.ts) is the only impure
 * caller — it reads real elapsed time and the real window size, then hands
 * both to these functions.
 */

/** The four directions a held key can contribute — not literal key names,
 * so both WASD and the arrow keys can map onto the same four values (see
 * keyboardInput.ts) and this module never needs to know which physical key
 * produced them. */
export type MovementDirection = 'up' | 'down' | 'left' | 'right'

export interface Vector2 {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

// The companion's own rendered box (see content-script.css's
// `.our-space-companion` width/height) — kept as a constant here rather
// than measured from the DOM every frame, since it never changes at
// runtime and a per-frame `getBoundingClientRect` read would be an
// unnecessary layout cost inside a loop that already writes a new
// transform every frame.
export const COMPANION_SIZE_PX: Size = { width: 56, height: 56 }

// A brisk, game-like walking pace — fast enough to feel responsive holding
// a key, slow enough to stay controllable across a normal browser window.
export const COMPANION_SPEED_PX_PER_SECOND = 240

/** Turns "which directions are currently held" into a single unit-ish
 * vector — (0,0) if nothing is held, or up to 8 directions including the
 * four diagonals. Deliberately takes a plain Set of direction *names*, not
 * key codes — the caller (contentScriptEntry.ts) is what merges WASD's
 * always-on directions with the arrow keys' control-mode-gated directions
 * into one set before calling this, so this function has no idea (and
 * doesn't need one) which physical keys or which input mode produced it. */
export function computeDirectionVector(activeDirections: ReadonlySet<MovementDirection>): Vector2 {
  let x = 0
  let y = 0
  if (activeDirections.has('left')) x -= 1
  if (activeDirections.has('right')) x += 1
  if (activeDirections.has('up')) y -= 1
  if (activeDirections.has('down')) y += 1
  return { x, y }
}

/** Scales a direction to the companion's real speed, normalizing diagonals
 * so holding two keys at once (e.g. up+right) isn't faster than holding
 * one — without this, a diagonal's (x,y) each already have magnitude 1, so
 * the combined vector's length is √2, not 1. */
export function normalizeVelocity(direction: Vector2, speedPixelsPerSecond: number): Vector2 {
  const magnitude = Math.hypot(direction.x, direction.y)
  if (magnitude === 0) return { x: 0, y: 0 }
  return {
    x: (direction.x / magnitude) * speedPixelsPerSecond,
    y: (direction.y / magnitude) * speedPixelsPerSecond,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Advances position by `velocity * deltaSeconds` (real elapsed time, not a
 * fixed step — see contentScriptEntry.ts's requestAnimationFrame loop),
 * then clamps to stay fully inside `viewportSize`. Reading a fresh
 * `viewportSize` every call (rather than caching it) is what makes resize
 * handling "just work" with no separate resize listener — the very next
 * frame after a resize simply clamps against the new size.
 */
export function stepPosition(
  position: Vector2,
  velocity: Vector2,
  deltaSeconds: number,
  viewportSize: Size,
  companionSize: Size = COMPANION_SIZE_PX,
): Vector2 {
  const nextX = position.x + velocity.x * deltaSeconds
  const nextY = position.y + velocity.y * deltaSeconds
  const maxX = Math.max(0, viewportSize.width - companionSize.width)
  const maxY = Math.max(0, viewportSize.height - companionSize.height)
  return {
    x: clamp(nextX, 0, maxX),
    y: clamp(nextY, 0, maxY),
  }
}
