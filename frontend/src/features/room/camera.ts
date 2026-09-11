import { ROOM_WORLD_HEIGHT, ROOM_WORLD_WIDTH } from './constants'

/**
 * Below this scale, the room would read as too small to be usable —
 * furniture and (later) avatars becoming hard to see or tap — so the
 * camera stops shrinking further and pans instead. This is what makes
 * panning "available where needed" on a narrow/mobile viewport while
 * staying unnecessary on a normal desktop window, without treating those
 * as two different code paths: both go through the same computation below.
 *
 * Placeholder value for the foundation slice — tune once real room art
 * exists and its readable-detail size is known.
 */
export const MIN_READABLE_SCALE = 0.55

export interface CameraFrame {
  /** How much the fixed virtual world is scaled to fit the current viewport. */
  scale: number
  /** How far the camera may pan from center on each axis, in screen pixels,
   * before the world's edge would show past the viewport. 0 means that axis
   * needs no panning at all — the whole room already fits. */
  maxPanX: number
  maxPanY: number
}

/**
 * Computes how the fixed virtual room should be framed for a given
 * viewport size: fit the whole room when that stays comfortably readable
 * ("contain" scaling), otherwise hold a minimum readable scale and allow
 * panning to cover whatever doesn't fit.
 *
 * Pure function — no PixiJS/DOM/browser API involved — so this is the one
 * piece of "camera" behavior fully covered by fast unit tests instead of
 * manual/browser verification.
 */
export function computeCameraFrame(
  viewportWidth: number,
  viewportHeight: number,
  worldWidth: number = ROOM_WORLD_WIDTH,
  worldHeight: number = ROOM_WORLD_HEIGHT,
): CameraFrame {
  if (viewportWidth <= 0 || viewportHeight <= 0 || worldWidth <= 0 || worldHeight <= 0) {
    return { scale: MIN_READABLE_SCALE, maxPanX: 0, maxPanY: 0 }
  }

  const containScale = Math.min(viewportWidth / worldWidth, viewportHeight / worldHeight)
  const scale = Math.max(containScale, MIN_READABLE_SCALE)

  const scaledWidth = worldWidth * scale
  const scaledHeight = worldHeight * scale

  return {
    scale,
    maxPanX: Math.max(0, (scaledWidth - viewportWidth) / 2),
    maxPanY: Math.max(0, (scaledHeight - viewportHeight) / 2),
  }
}

/**
 * Keeps a pan offset from ever revealing past the world's edge. Shared by
 * both axes — panning is symmetric around center on each, and a `maxPan`
 * of 0 (the room already fits) always collapses back to 0.
 */
export function clampPan(value: number, maxPan: number): number {
  if (maxPan <= 0) return 0
  return Math.min(maxPan, Math.max(-maxPan, value))
}
