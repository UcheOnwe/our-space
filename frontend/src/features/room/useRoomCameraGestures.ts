import { useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { MAX_ZOOM_FACTOR, MIN_ZOOM_FACTOR, clampPan, computeCameraFrame, computeMaxPan } from './camera'
import { ROOM_WORLD_HEIGHT, ROOM_WORLD_WIDTH } from './constants'

export interface RoomCameraSnapshot {
  /** The full scale to render the ROOM_WORLD_WIDTH/HEIGHT-unit world at —
   * already includes both the base cover-fit scale and any pinch zoom. */
  scale: number
  /** Final, ready-to-use CSS translate values — NOT a raw pan offset.
   * Already include the "center the world in the viewport" term (see this
   * hook's own doc comment), so the caller applies them directly as
   * `transform: translate(translateX, translateY) scale(scale)` with no
   * further math. */
  translateX: number
  translateY: number
}

const DEFAULT_SNAPSHOT: RoomCameraSnapshot = { scale: MIN_ZOOM_FACTOR, translateX: 0, translateY: 0 }

/**
 * The reusable "explore a fixed-aspect room world through a viewport that
 * doesn't match its shape" gesture concept RoomCanvas.tsx (Couple Home)
 * already proved out — ported here as plain DOM/CSS state instead of
 * Pixi container properties, since Cozy Loft's room is a `<video>`, not a
 * PixiJS scene. Reuses camera.ts's exact same pure math
 * (computeCameraFrame's cover-fit, computeMaxPan, clampPan, the shared
 * zoom bounds) rather than re-deriving it — RoomCanvas.tsx is
 * deliberately NOT refactored to use this hook itself: its gesture wiring
 * is tightly coupled to Pixi's own event/hit-testing model in a way a
 * shared hook can't cleanly abstract over without risking its
 * already-working behavior, so the "concept" being reused is the camera
 * MATH, not one literal code path for both renderers.
 *
 * Used by BOTH the live Cozy Loft room AND its RoomGallery preview (see
 * `enabled` — the preview passes `phase.status === 'room'` too, which for
 * it is always true, so panning simply always works there) — one bounded
 * camera implementation, not two competing ones.
 *
 * THE CENTERING TERM (why this isn't just `translate(pan) scale(scale)`):
 * Pixi's own model (RoomCanvas.tsx's `positionWorld`) places a scaled
 * world's origin at `viewportSize/2 - worldSize/2*scale + pan`, i.e. the
 * world is centered in the viewport BEFORE any user pan is added. Naively
 * translating by the raw pan/zoom offset alone (an earlier version of
 * this hook did exactly that) anchors the world to the viewport's
 * top-left corner instead — which silently made only HALF of
 * computeMaxPan's own range reachable (real device testing showed it as
 * "can't quite reach the far edge of the room") while the OTHER pan
 * extreme overshot past the world's actual edge and exposed empty
 * background. Including the centering term is what makes `panX/panY ∈
 * [-maxPanX, +maxPanX]` correspond exactly to "world's right edge at the
 * viewport's right edge" through "world's left edge at the viewport's
 * left edge" — the full, and only the full, legal range.
 */
export function useRoomCameraGestures(wrapperRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<RoomCameraSnapshot>(DEFAULT_SNAPSHOT)

  // The gesture math needs synchronous, always-current values inside
  // pointer handlers (which can fire faster than React re-renders
  // settle) — mirrored into state above purely so the rendered transform
  // stays in sync. Same "mutable source of truth, state mirrors it"
  // shape RoomCanvas.tsx's own closure variables use. panRef is the RAW
  // pan offset (relative to center) that all the clamping math is
  // expressed in terms of — clampAndCommit is the one place it's turned
  // into the final translateX/Y the caller actually renders.
  const baseScaleRef = useRef(MIN_ZOOM_FACTOR)
  const zoomRef = useRef(MIN_ZOOM_FACTOR)
  const panRef = useRef({ x: 0, y: 0 })
  const draggingRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchStartDistanceRef = useRef(0)
  const pinchStartZoomRef = useRef(MIN_ZOOM_FACTOR)

  // `offsetWidth`/`offsetHeight` (layout box size), NOT
  // `getBoundingClientRect()` (post-transform, rendered/visual size) —
  // fixes a real "room renders mis-fitted until reload" bug: a
  // freshly-mounted room's wrapper can sit inside an ANCESTOR
  // (RoomExperience.module.css's `.roomSlot`) that is, at that exact
  // moment, mid-way through its own `room-expand-in` CSS transform
  // animation (scale 0.92 -> 1). `getBoundingClientRect()` reports the
  // CURRENT, transform-affected rendered size — sampling it while that
  // animation is still at scale(0.92) bakes a too-small viewport into
  // computeCameraFrame's cover-fit math below, and since a pure CSS
  // transform never changes an element's LAYOUT box, the ResizeObserver a
  // few lines down never fires once the animation finishes to correct it
  // — the room stays mis-fitted until something else (a reload, which
  // never hits this animation) recomputes it fresh. `offsetWidth`/
  // `offsetHeight` reflect the element's own LAYOUT size, which an
  // ancestor's `transform` never touches. This is the ONE change kept
  // from this hook's own mobile-camera correction passes — confirmed
  // fixed on a physical device — everything else in this file (the
  // pointer/gesture handling itself) has been reverted to its
  // last-known-good, validated-smooth-on-device behavior; see
  // useIndependentCameraGestures.ts for where any further preview/close-up
  // specific gesture work now lives instead, so it can never again risk
  // this hook's own already-correct feel.
  function currentViewport(): { width: number; height: number } | null {
    const wrapper = wrapperRef.current
    if (!wrapper) return null
    const width = wrapper.offsetWidth
    const height = wrapper.offsetHeight
    if (width === 0 || height === 0) return null
    return { width, height }
  }

  function clampAndCommit() {
    const viewport = currentViewport()
    if (!viewport) return
    const scale = baseScaleRef.current * zoomRef.current
    const maxPanX = computeMaxPan(ROOM_WORLD_WIDTH * scale, viewport.width)
    const maxPanY = computeMaxPan(ROOM_WORLD_HEIGHT * scale, viewport.height)
    panRef.current = {
      x: clampPan(panRef.current.x, maxPanX),
      y: clampPan(panRef.current.y, maxPanY),
    }
    setSnapshot({
      scale,
      translateX: viewport.width / 2 - (ROOM_WORLD_WIDTH / 2) * scale + panRef.current.x,
      translateY: viewport.height / 2 - (ROOM_WORLD_HEIGHT / 2) * scale + panRef.current.y,
    })
  }

  // Recomputes the base cover-fit scale on mount and whenever the
  // wrapper's real size changes (rotation, responsive breakpoint) — never
  // resets zoomRef/panRef, so a resize doesn't silently undo an
  // in-progress pinch/pan. useLayoutEffect (not useEffect) so this
  // settles before the browser paints the first frame, avoiding a brief
  // flash of the un-scaled 1600x900 default.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    function recomputeBaseScale() {
      const viewport = currentViewport()
      if (!viewport) return
      baseScaleRef.current = computeCameraFrame(viewport.width, viewport.height, ROOM_WORLD_WIDTH, ROOM_WORLD_HEIGHT).scale
      clampAndCommit()
    }

    recomputeBaseScale()
    const resizeObserver = new ResizeObserver(recomputeBaseScale)
    resizeObserver.observe(wrapper)
    return () => resizeObserver.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function handlePointerDown(event: ReactPointerEvent) {
    if (!enabled) return
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (activePointersRef.current.size === 2) {
      const [a, b] = Array.from(activePointersRef.current.values())
      pinchStartDistanceRef.current = pointerDistance(a, b)
      pinchStartZoomRef.current = zoomRef.current
      // A pinch starting mid-drag must not leave the single-finger pan
      // still "live" underneath it once the pinch ends.
      draggingRef.current = false
    } else {
      draggingRef.current = true
      lastPointerRef.current = { x: event.clientX, y: event.clientY }
    }
  }

  function handlePointerMove(event: ReactPointerEvent) {
    if (!enabled || !activePointersRef.current.has(event.pointerId)) return
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (activePointersRef.current.size === 2) {
      if (pinchStartDistanceRef.current <= 0) return
      const viewport = currentViewport()
      const rect = wrapperRef.current?.getBoundingClientRect()
      if (!viewport || !rect) return

      const [a, b] = Array.from(activePointersRef.current.values())
      const newDistance = pointerDistance(a, b)
      const oldScale = baseScaleRef.current * zoomRef.current
      const nextZoom = Math.max(
        MIN_ZOOM_FACTOR,
        Math.min(MAX_ZOOM_FACTOR, pinchStartZoomRef.current * (newDistance / pinchStartDistanceRef.current)),
      )
      const newScale = baseScaleRef.current * nextZoom

      // Zoom around the pinch's own focal midpoint: read the world point
      // currently under the midpoint at the OLD scale, then choose
      // panX/panY so that same point still sits under it at the NEW
      // scale — the standard "steady under your fingers" zoom formula,
      // identical to RoomCanvas.tsx's own applyZoom (and using the same
      // centering term clampAndCommit renders with).
      const focalX = (a.x + b.x) / 2 - rect.left
      const focalY = (a.y + b.y) / 2 - rect.top
      const worldPosXOld = viewport.width / 2 - (ROOM_WORLD_WIDTH / 2) * oldScale + panRef.current.x
      const worldPosYOld = viewport.height / 2 - (ROOM_WORLD_HEIGHT / 2) * oldScale + panRef.current.y
      const worldX = (focalX - worldPosXOld) / oldScale
      const worldY = (focalY - worldPosYOld) / oldScale
      const desiredWorldPosX = focalX - worldX * newScale
      const desiredWorldPosY = focalY - worldY * newScale

      zoomRef.current = nextZoom
      panRef.current = {
        x: desiredWorldPosX - viewport.width / 2 + (ROOM_WORLD_WIDTH / 2) * newScale,
        y: desiredWorldPosY - viewport.height / 2 + (ROOM_WORLD_HEIGHT / 2) * newScale,
      }
      clampAndCommit()
      return
    }

    if (!draggingRef.current) return
    panRef.current = {
      x: panRef.current.x + (event.clientX - lastPointerRef.current.x),
      y: panRef.current.y + (event.clientY - lastPointerRef.current.y),
    }
    lastPointerRef.current = { x: event.clientX, y: event.clientY }
    clampAndCommit()
  }

  function endPointer(event: ReactPointerEvent) {
    activePointersRef.current.delete(event.pointerId)
    if (activePointersRef.current.size < 2) {
      pinchStartDistanceRef.current = 0
    }
    if (activePointersRef.current.size === 0) {
      draggingRef.current = false
    }
  }

  const handlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
    onPointerLeave: endPointer,
  }

  return { camera: snapshot, handlers }
}
