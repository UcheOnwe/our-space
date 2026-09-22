import { useEffect, useLayoutEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { MAX_ZOOM_FACTOR, MIN_ZOOM_FACTOR, clampPan, computeCameraFrame, computeMaxPan } from '../camera'
import { ROOM_WORLD_HEIGHT, ROOM_WORLD_WIDTH } from '../constants'
import type { StickVector } from './analogStick'

/** Screen px/second at full stick deflection — fast enough to traverse a
 * typical viewport in a little over half a second (comfortable
 * "traversing the environment"), slow enough near the dead zone's own
 * edge (where the speed curve is still small) for precise inspection.
 * Tuned by feel against this codebase's existing camera bounds, not
 * measured against a design spec — the one number to revisit first if a
 * physical device says the pace is off. */
const MAX_PAN_SPEED_PX_PER_SECOND = 640

/** Guards the delta-time integration against a huge, bogus `dt` after the
 * tab was backgrounded/throttled (rAF can resume with a multi-second gap)
 * — without this, the very next frame would fling the camera across a
 * huge chunk of the environment in one jump instead of just resuming
 * normal-speed movement. */
const MAX_FRAME_DELTA_MS = 100

/**
 * The camera-control half of the analog controller (see
 * AnalogCameraControl.tsx for the joystick UI half) — this hook owns
 * everything the joystick itself must NOT know about: current pan/zoom,
 * bounds/clamping, the cover-fit base scale, direct-drag, pinch-to-zoom,
 * recentering, and the actual DOM transform write. The joystick only
 * ever calls `setStickVector` with a plain `{x, y}` intent (see
 * analogStick.ts) — it has no idea what room, hotspot, or artwork this is.
 *
 * DELIBERATELY SEPARATE from useRoomCameraGestures.ts (the entered
 * rooms' own hook — left completely untouched by this feature). Direct
 * drag (touch AND mouse/touchpad) and pinch share `environmentHandlers`;
 * the joystick feeds the SAME camera state through `setStickVector`
 * below — one bounded camera implementation, two input surfaces.
 *
 * CONTINUOUS MOVEMENT (why this needs its own requestAnimationFrame loop,
 * unlike the pinch/drag path which reacts to pointer events): a joystick
 * that's held displaced must keep moving the camera even though no new
 * pointer event is arriving — camera position is a function of TIME
 * while the stick is off-center, not of how many gesture samples came
 * in. `runLoop` integrates `panRef` by `stickVectorRef.current * MAX_PAN_
 * SPEED_PX_PER_SECOND * deltaSeconds` every frame, and stops rescheduling
 * itself the instant the vector returns to `{0, 0}` (release, cancel, or
 * losing pointer capture all funnel through `setStickVector({x:0,y:0})`)
 * — never a stuck loop running forever in the background.
 */
export function useAnalogCameraController(
  wrapperRef: RefObject<HTMLElement | null>,
  worldRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  // `'deferred'` (default) is this hook's original, still-unchanged-for-
  // every-existing-consumer drag behavior: no pointer capture is used
  // implicitly by that choice, and the write is batched behind
  // `scheduleDragFrame`'s own requestAnimationFrame. `'immediate'` exists
  // ONLY for a single, explicitly opted-in RoomCloseUp consumer (see that
  // file's own `enableDirectDrag` doc comment) — it mirrors the two
  // specific characteristics of `useRoomCameraGestures`'s own
  // physically-proven-smooth drag path (no pointer capture, transform
  // written synchronously inside the pointermove handler itself) WITHOUT
  // touching that hook or duplicating its camera math: this hook's own
  // existing `panRef`/`zoomRef`/`writeTransform` stay the SAME single
  // source of truth the analog joystick and Recenter already use, so drag
  // and analog can never fight over two independent camera states — only
  // how quickly the drag path's own writes reach the DOM changes. The
  // analog's own requestAnimationFrame loop (`runLoop`) is completely
  // unaffected either way.
  dragMode: 'deferred' | 'immediate' = 'deferred',
) {
  const baseScaleRef = useRef(MIN_ZOOM_FACTOR)
  const zoomRef = useRef(MIN_ZOOM_FACTOR)
  const panRef = useRef({ x: 0, y: 0 })
  const viewportRef = useRef<{ width: number; height: number } | null>(null)
  const screenOriginRef = useRef<{ left: number; top: number } | null>(null)

  const stickVectorRef = useRef<StickVector>({ x: 0, y: 0 })
  const loopHandleRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef(0)

  const activePointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchStartDistanceRef = useRef(0)
  const pinchStartZoomRef = useRef(MIN_ZOOM_FACTOR)
  const pinchFrameScheduledRef = useRef(false)
  const draggingPointerIdRef = useRef<number | null>(null)
  const lastDragPointerRef = useRef({ x: 0, y: 0 })
  const dragFrameScheduledRef = useRef(false)

  function measureViewport(): { width: number; height: number } | null {
    const wrapper = wrapperRef.current
    if (!wrapper) return null
    // `offsetWidth`/`offsetHeight`, not `getBoundingClientRect()` — see
    // useRoomCameraGestures.ts's own doc comment on `currentViewport` for
    // the exact "room mis-fitted until reload" bug this avoids (an
    // ancestor's CSS transform animation otherwise pollutes a
    // rendered-size read at mount time).
    const width = wrapper.offsetWidth
    const height = wrapper.offsetHeight
    if (width === 0 || height === 0) return null
    return { width, height }
  }

  function writeTransform() {
    const viewport = viewportRef.current
    const world = worldRef.current
    if (!viewport || !world) return
    const scale = baseScaleRef.current * zoomRef.current
    const maxPanX = computeMaxPan(ROOM_WORLD_WIDTH * scale, viewport.width)
    const maxPanY = computeMaxPan(ROOM_WORLD_HEIGHT * scale, viewport.height)
    // Clamping panRef ITSELF (not just the rendered value) is what makes
    // "stop cleanly at the boundary, resume immediately on reversal" work
    // for free: continuing to integrate from an already-clamped position
    // just re-clamps to the same edge each frame until the vector's sign
    // actually points back inward.
    panRef.current = {
      x: clampPan(panRef.current.x, maxPanX),
      y: clampPan(panRef.current.y, maxPanY),
    }
    const translateX = viewport.width / 2 - (ROOM_WORLD_WIDTH / 2) * scale + panRef.current.x
    const translateY = viewport.height / 2 - (ROOM_WORLD_HEIGHT / 2) * scale + panRef.current.y
    world.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`
  }

  function runLoop(now: number) {
    const deltaMs = Math.min(now - lastFrameTimeRef.current, MAX_FRAME_DELTA_MS)
    lastFrameTimeRef.current = now
    const vector = stickVectorRef.current
    if (vector.x === 0 && vector.y === 0) {
      loopHandleRef.current = null
      return
    }
    const deltaSeconds = deltaMs / 1000
    // MINUS, not plus: this is a camera-steering control, not a drag —
    // pushing the stick right/down must reveal MORE of the artwork to
    // the right/below (explore in the pushed direction), which means the
    // WORLD itself has to shift left/up on screen (translateX/Y
    // decreasing) as the stick is pushed right/down (positive vector.x/
    // y). The one-finger DRAG path below uses the opposite, additive
    // sign deliberately — there, the metaphor is "grab the content and
    // move it with your finger" (content follows the finger 1:1), which
    // is a different interaction than "steer the camera toward a
    // direction."
    panRef.current = {
      x: panRef.current.x - vector.x * MAX_PAN_SPEED_PX_PER_SECOND * deltaSeconds,
      y: panRef.current.y - vector.y * MAX_PAN_SPEED_PX_PER_SECOND * deltaSeconds,
    }
    writeTransform()
    loopHandleRef.current = requestAnimationFrame(runLoop)
  }

  function ensureLoopRunning() {
    if (loopHandleRef.current !== null) return
    lastFrameTimeRef.current = performance.now()
    loopHandleRef.current = requestAnimationFrame(runLoop)
  }

  /** Called by AnalogCameraControl on every joystick pointer sample — the
   * ONLY channel through which the joystick affects the camera. A
   * non-zero vector keeps (or starts) the continuous movement loop; a
   * zero vector (release, cancel, or lost pointer capture) simply stops
   * it on the loop's own next tick. */
  function setStickVector(vector: StickVector) {
    if (!enabled) return
    stickVectorRef.current = vector
    if (vector.x !== 0 || vector.y !== 0) ensureLoopRunning()
  }

  /** Restores the initial fitted composition — the same base scale/zero
   * pan/zoom the environment started at. */
  function recenter() {
    zoomRef.current = MIN_ZOOM_FACTOR
    panRef.current = { x: 0, y: 0 }
    writeTransform()
  }

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    function recomputeBaseScale() {
      const viewport = measureViewport()
      if (!viewport) return
      viewportRef.current = viewport
      baseScaleRef.current = computeCameraFrame(viewport.width, viewport.height, ROOM_WORLD_WIDTH, ROOM_WORLD_HEIGHT).scale
      writeTransform()
    }

    recomputeBaseScale()
    const resizeObserver = new ResizeObserver(recomputeBaseScale)
    resizeObserver.observe(wrapper)
    return () => resizeObserver.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cancels a still-running loop on unmount, disable, or isLeaving — never
  // a stuck animation loop outliving its own component.
  useEffect(() => {
    if (!enabled && loopHandleRef.current !== null) {
      cancelAnimationFrame(loopHandleRef.current)
      loopHandleRef.current = null
      stickVectorRef.current = { x: 0, y: 0 }
    }
  }, [enabled])
  useEffect(
    () => () => {
      if (loopHandleRef.current !== null) cancelAnimationFrame(loopHandleRef.current)
    },
    [],
  )

  function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function schedulePinchFrame() {
    if (pinchFrameScheduledRef.current) return
    pinchFrameScheduledRef.current = true
    requestAnimationFrame(() => {
      pinchFrameScheduledRef.current = false
      writeTransform()
    })
  }

  function scheduleDragFrame() {
    if (dragFrameScheduledRef.current) return
    dragFrameScheduledRef.current = true
    requestAnimationFrame(() => {
      dragFrameScheduledRef.current = false
      writeTransform()
    })
  }

  function isInteractiveTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('button, a, input, textarea, select, [role="button"]') !== null
  }

  /**
   * Two things happen here, deliberately kept in ONE handler since they
   * share the same "how many pointers are down" bookkeeping:
   *
   * PINCH (any pointer type): only ever engages once a SECOND pointer
   * joins.
   *
   * DIRECT DRAG (any pointer type — touch AND mouse/touchpad):
   * single-pointer pan. Confirmed smooth on physical device once fully
   * isolated from the entered rooms' own gesture hook. `isInteractiveTarget`
   * still guards against starting a drag on top of a real control.
   */
  function handlePointerDown(event: ReactPointerEvent) {
    if (!enabled) return
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (activePointersRef.current.size === 2) {
      // A pinch starting mid-drag must not leave the drag path still
      // "live" underneath it.
      draggingPointerIdRef.current = null
      const rect = wrapperRef.current?.getBoundingClientRect()
      if (rect) screenOriginRef.current = { left: rect.left, top: rect.top }
      viewportRef.current = measureViewport() ?? viewportRef.current
      const [a, b] = Array.from(activePointersRef.current.values())
      pinchStartDistanceRef.current = pointerDistance(a, b)
      pinchStartZoomRef.current = zoomRef.current
      return
    }

    if (activePointersRef.current.size === 1 && !isInteractiveTarget(event.target)) {
      draggingPointerIdRef.current = event.pointerId
      lastDragPointerRef.current = { x: event.clientX, y: event.clientY }
      viewportRef.current = measureViewport() ?? viewportRef.current
      // `'immediate'` mode deliberately skips this — see this hook's own
      // `dragMode` doc comment: `useRoomCameraGestures`'s proven-smooth
      // drag path never captures the pointer either.
      if (dragMode === 'deferred' && typeof event.currentTarget.setPointerCapture === 'function') {
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Harmless to skip — see useRoomCameraGestures.ts's own doc
          // comment on this exact same defensive pattern.
        }
      }
    }
  }

  function handlePointerMove(event: ReactPointerEvent) {
    if (!enabled || !activePointersRef.current.has(event.pointerId)) return
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (activePointersRef.current.size === 1 && draggingPointerIdRef.current === event.pointerId) {
      const viewport = viewportRef.current
      if (!viewport) return
      if (event.cancelable) event.preventDefault()
      panRef.current = {
        x: panRef.current.x + (event.clientX - lastDragPointerRef.current.x),
        y: panRef.current.y + (event.clientY - lastDragPointerRef.current.y),
      }
      lastDragPointerRef.current = { x: event.clientX, y: event.clientY }
      // `'immediate'` mode writes the transform synchronously, right here
      // in the pointermove handler — matching `useRoomCameraGestures`'s
      // own proven-smooth pattern exactly (no extra requestAnimationFrame
      // frame of latency between finger and paint). `'deferred'` mode
      // keeps this hook's original behavior, batching the write behind
      // scheduleDragFrame — see this hook's own `dragMode` doc comment.
      if (dragMode === 'immediate') {
        writeTransform()
      } else {
        scheduleDragFrame()
      }
      return
    }

    if (activePointersRef.current.size !== 2 || pinchStartDistanceRef.current <= 0) return
    if (event.cancelable) event.preventDefault()

    const viewport = viewportRef.current
    const origin = screenOriginRef.current
    if (!viewport || !origin) return

    const [a, b] = Array.from(activePointersRef.current.values())
    const newDistance = pointerDistance(a, b)
    const oldScale = baseScaleRef.current * zoomRef.current
    const nextZoom = Math.max(
      MIN_ZOOM_FACTOR,
      Math.min(MAX_ZOOM_FACTOR, pinchStartZoomRef.current * (newDistance / pinchStartDistanceRef.current)),
    )
    const newScale = baseScaleRef.current * nextZoom

    // Same "steady under your fingers" focal-point formula every other
    // camera in this codebase uses (RoomCanvas.tsx's applyZoom,
    // useRoomCameraGestures.ts).
    const focalX = (a.x + b.x) / 2 - origin.left
    const focalY = (a.y + b.y) / 2 - origin.top
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
    schedulePinchFrame()
  }

  function endPointer(event: ReactPointerEvent) {
    activePointersRef.current.delete(event.pointerId)
    if (activePointersRef.current.size < 2) pinchStartDistanceRef.current = 0
    if (draggingPointerIdRef.current === event.pointerId) draggingPointerIdRef.current = null
  }

  // Direct drag (touch + mouse/touchpad) and pinch-zoom (any pointer
  // type) — the joystick's own movement is a completely separate path
  // (setStickVector above), never routed through these handlers.
  const environmentHandlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
    onPointerLeave: endPointer,
  }

  return { environmentHandlers, setStickVector, recenter }
}
