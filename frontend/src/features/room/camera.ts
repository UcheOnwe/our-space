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

/**
 * Pinch-to-zoom's own multiplier range, applied ON TOP of computeCameraFrame's
 * base cover-fit scale (see RoomCanvas.tsx's `zoomFactor`) — never a
 * replacement for it. Floors at 1 (never below the base cover-fit scale)
 * because anything smaller would reopen exactly the dead-canvas gap
 * cover-fit exists to close; caps at a modest 2.5x, enough to look closer
 * at a piece of furniture without the room losing all readable context.
 */
export const MIN_ZOOM_FACTOR = 1
export const MAX_ZOOM_FACTOR = 2.5

/**
 * How far a scaled world dimension may pan past center before its own edge
 * would show past the viewport on that axis — the shared formula both
 * computeCameraFrame (at the base scale) and RoomCanvas's pinch-zoom (at
 * whatever the current zoomed scale is) clamp panning against. 0 means the
 * scaled dimension already fits inside the viewport with room to spare —
 * no panning needed on that axis at all.
 */
export function computeMaxPan(scaledSize: number, viewportSize: number): number {
  return Math.max(0, (scaledSize - viewportSize) / 2)
}

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
 * viewport size: always fully COVER the viewport on both axes (never
 * "contain" it), then allow panning to reach whatever the viewport itself
 * doesn't show.
 *
 * This was a "contain" fit (`min(vpW/worldW, vpH/worldH)`) through Slice
 * 1 — that shrinks the room to fit BOTH axes at once, which reads fine
 * exactly when the viewport's own aspect ratio already matches the
 * world's (true on desktop, where RoomCanvas.module.css's wrapper uses
 * `aspect-ratio: 1600/900` to guarantee that). On a real mobile viewport
 * the wrapper's box is a different shape on purpose (a generous vh slice,
 * not locked to 16:9 — see RoomCanvas.module.css), so "contain" leaves
 * one axis short of the box's actual edge: real device testing showed
 * this as a strip of the wrapper's own background (dead canvas) on
 * whichever axis wasn't the limiting one, exactly the "fixed framed room
 * with unused dark/gray canvas around it" regression. "Cover"
 * (`max(...)`) guarantees the scaled room always reaches every edge of
 * whatever box it's given, on both axes — panning is what reveals the
 * rest, never a gap. On desktop, where the box's ratio already equals the
 * world's, contain and cover compute the exact same scale (there's no
 * "rest" on either axis), so this is a genuine no-op there — desktop
 * behavior is unchanged.
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

  const coverScale = Math.max(viewportWidth / worldWidth, viewportHeight / worldHeight)
  const scale = Math.max(coverScale, MIN_READABLE_SCALE)

  return {
    scale,
    maxPanX: computeMaxPan(worldWidth * scale, viewportWidth),
    maxPanY: computeMaxPan(worldHeight * scale, viewportHeight),
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
