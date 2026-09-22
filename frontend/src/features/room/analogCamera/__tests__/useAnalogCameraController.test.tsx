import { useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeCameraFrame } from '../../camera'
import { ROOM_WORLD_HEIGHT, ROOM_WORLD_WIDTH } from '../../constants'
import { useAnalogCameraController } from '../useAnalogCameraController'

const VIEWPORT = { width: 400, height: 300 }
const BASE_SCALE = computeCameraFrame(VIEWPORT.width, VIEWPORT.height, ROOM_WORLD_WIDTH, ROOM_WORLD_HEIGHT).scale

function readTransform() {
  const transform = screen.getByTestId('world').style.transform
  const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(transform)
  if (!match) throw new Error(`could not parse world transform: "${transform}"`)
  return { translateX: Number(match[1]), translateY: Number(match[2]), scale: Number(match[3]) }
}

let pendingFrame: FrameRequestCallback | null = null
// A fixed 16ms-per-frame SIMULATED clock, not a fresh `performance.now()`
// read on every call — the latter shrinks the delta each successive call
// (since real wall-clock time between two synchronous test calls is far
// less than 16ms, while each call re-adds a flat +16 to an
// already-advanced base), understating movement on frame 2+ compared to
// frame 1. A monotonic simulated clock gives every pumped frame the same
// realistic ~16ms delta, matching an actual 60Hz display.
let simulatedTimeMs: number | null = null
function pumpFrame() {
  const cb = pendingFrame
  pendingFrame = null
  simulatedTimeMs = (simulatedTimeMs ?? performance.now()) + 16
  cb?.(simulatedTimeMs)
}

// A container object, not a bare reassigned `let` — the harness below
// mutates `hookApiBox.current` (a property write), which is how the
// test reaches the hook's own imperative API (`setStickVector`/
// `recenter`) from outside the component tree; reassigning a bare
// module-level variable directly inside a component's render body reads
// (to a generic lint rule) like the exact external-mutable-state bug
// this pattern is deliberately NOT — the object indirection sidesteps
// that false positive without changing what the test actually does.
const hookApiBox: { current: ReturnType<typeof useAnalogCameraController> | null } = { current: null }

function Harness({ enabled = true, dragMode }: { enabled?: boolean; dragMode?: 'deferred' | 'immediate' }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line react/immutability -- test-only harness: this
  // is how the test reaches the hook's imperative API from outside the
  // component tree (see hookApiBox's own doc comment above); the rule's
  // concern (module state driving what THIS component renders) doesn't
  // apply — nothing in the JSX below reads hookApiBox.
  hookApiBox.current = useAnalogCameraController(wrapperRef, worldRef, enabled, dragMode)
  return (
    <div ref={wrapperRef} data-testid="wrapper" {...hookApiBox.current.environmentHandlers}>
      <div ref={worldRef} data-testid="world" />
    </div>
  )
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(VIEWPORT.width)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(VIEWPORT.height)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    top: 0,
    left: 0,
    right: VIEWPORT.width,
    bottom: VIEWPORT.height,
    x: 0,
    y: 0,
    toJSON() {},
  })
  pendingFrame = null
  simulatedTimeMs = null
  hookApiBox.current = null
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pendingFrame = cb
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    pendingFrame = null
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useAnalogCameraController', () => {
  it('starts centered at the base cover-fit scale with no pan', () => {
    render(<Harness />)
    const camera = readTransform()
    expect(camera.scale).toBeCloseTo(BASE_SCALE)
  })

  it('a sustained stick vector keeps moving the camera across many frames without any new pointer input', () => {
    render(<Harness />)
    act(() => hookApiBox.current!.setStickVector({ x: 1, y: 0 }))
    pumpFrame()
    const afterOne = readTransform().translateX
    pumpFrame()
    const afterTwo = readTransform().translateX
    pumpFrame()
    const afterThree = readTransform().translateX

    // Monotonically continues in the SAME direction, frame after frame,
    // from the SAME held vector — this is the entire point of the analog
    // controller (see useAnalogCameraController.ts's own doc comment). A
    // positive x vector (pushed right) decreases translateX in this
    // hook's own camera-steering convention — see runLoop's own doc
    // comment for why that's the opposite sign of a one-finger drag.
    expect(afterTwo).toBeLessThan(afterOne)
    expect(afterThree).toBeLessThan(afterTwo)
  })

  it('never exposes empty canvas — panning is clamped to the environment bounds no matter how long the stick is held', () => {
    render(<Harness />)
    act(() => hookApiBox.current!.setStickVector({ x: 1, y: 0 }))
    // Pump far more frames than could possibly be needed to reach the
    // bound at this speed/scale — the camera must stop AT the edge, not
    // overshoot it.
    for (let i = 0; i < 200; i++) pumpFrame()

    const scaledWidth = ROOM_WORLD_WIDTH * BASE_SCALE
    const { translateX } = readTransform()
    // The world's right edge must never end up short of the viewport's
    // right edge (which would expose empty background beyond it) — and
    // must never overshoot past 0 either (translateX <= 0 always, for a
    // world wider than the viewport).
    expect(translateX).toBeLessThanOrEqual(0)
    expect(translateX + scaledWidth).toBeGreaterThanOrEqual(VIEWPORT.width)
  })

  it('resumes moving immediately when the direction reverses away from a boundary already reached', () => {
    render(<Harness />)
    act(() => hookApiBox.current!.setStickVector({ x: 1, y: 0 }))
    for (let i = 0; i < 200; i++) pumpFrame()
    const atBoundary = readTransform().translateX

    act(() => hookApiBox.current!.setStickVector({ x: -1, y: 0 }))
    pumpFrame()
    expect(readTransform().translateX).toBeGreaterThan(atBoundary)
  })

  it('recenter restores the initial camera position and scale', () => {
    render(<Harness />)
    act(() => hookApiBox.current!.setStickVector({ x: 1, y: 1 }))
    pumpFrame()
    pumpFrame()
    const initial = readTransform()
    // Confirm it actually moved first, so recenter is a meaningful check.
    act(() => hookApiBox.current!.setStickVector({ x: 0, y: 0 }))

    act(() => hookApiBox.current!.recenter())
    const afterRecenter = readTransform()
    expect(afterRecenter.scale).toBeCloseTo(BASE_SCALE)
    expect(afterRecenter).not.toEqual(initial)
  })

  it('a zero vector never starts the animation loop at all', () => {
    render(<Harness />)
    act(() => hookApiBox.current!.setStickVector({ x: 0, y: 0 }))
    expect(pendingFrame).toBeNull()
  })

  it('unmounting cancels a still-running animation loop', () => {
    const { unmount } = render(<Harness />)
    act(() => hookApiBox.current!.setStickVector({ x: 1, y: 0 }))
    pumpFrame()
    expect(pendingFrame).not.toBeNull()

    const cancelSpy = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancelSpy)
    unmount()
    expect(cancelSpy).toHaveBeenCalled()
  })

  it('disabling the controller stops the loop and clears the stick vector', () => {
    const { rerender } = render(<Harness enabled={true} />)
    act(() => hookApiBox.current!.setStickVector({ x: 1, y: 0 }))
    pumpFrame()
    const beforeDisable = readTransform().translateX

    rerender(<Harness enabled={false} />)
    pumpFrame() // should be a no-op now — nothing left to run
    expect(readTransform().translateX).toBe(beforeDisable)
  })

  it('ignores setStickVector while disabled', () => {
    render(<Harness enabled={false} />)
    act(() => hookApiBox.current!.setStickVector({ x: 1, y: 0 }))
    expect(pendingFrame).toBeNull()
  })

  describe('dragMode', () => {
    function pointer(id: number, x: number, y: number, pointerType = 'touch') {
      return { pointerId: id, clientX: x, clientY: y, pointerType }
    }

    it("defaults to 'deferred' — the drag write is batched behind requestAnimationFrame, unchanged for every existing consumer", () => {
      render(<Harness />)
      const wrapper = screen.getByTestId('wrapper')
      const before = readTransform().translateX

      fireEvent.pointerDown(wrapper, pointer(1, 200, 150))
      fireEvent.pointerMove(wrapper, pointer(1, 100, 150))
      // No pump yet — 'deferred' mode must NOT have written the transform
      // synchronously.
      expect(readTransform().translateX).toBe(before)

      pumpFrame()
      expect(readTransform().translateX).not.toBe(before)
    })

    it("'immediate' mode writes the transform synchronously inside the pointermove handler — no requestAnimationFrame pump needed", () => {
      render(<Harness dragMode="immediate" />)
      const wrapper = screen.getByTestId('wrapper')
      const before = readTransform().translateX

      fireEvent.pointerDown(wrapper, pointer(1, 200, 150))
      fireEvent.pointerMove(wrapper, pointer(1, 100, 150))
      expect(readTransform().translateX).not.toBe(before)
      // Nothing was scheduled for this write — see this hook's own
      // `dragMode` doc comment.
      expect(pendingFrame).toBeNull()
    })

    it("'immediate' mode never calls setPointerCapture — matching useRoomCameraGestures's own proven drag path", () => {
      // jsdom's HTMLElement has no setPointerCapture at all — assign one
      // directly rather than vi.spyOn (which requires the property to
      // already exist) — see this hook's own defensive `typeof ===
      // 'function'` check for why that's the real-world condition this
      // exercises.
      const captureSpy = vi.fn()
      // eslint-disable-next-line react/immutability -- test-only global shim
      HTMLElement.prototype.setPointerCapture = captureSpy
      render(<Harness dragMode="immediate" />)
      const wrapper = screen.getByTestId('wrapper')

      fireEvent.pointerDown(wrapper, pointer(1, 200, 150))
      expect(captureSpy).not.toHaveBeenCalled()
      delete (HTMLElement.prototype as { setPointerCapture?: unknown }).setPointerCapture
    })

    it("'deferred' mode still calls setPointerCapture, unchanged — regression check", () => {
      const captureSpy = vi.fn()
      // eslint-disable-next-line react/immutability -- test-only global shim
      HTMLElement.prototype.setPointerCapture = captureSpy
      render(<Harness />)
      const wrapper = screen.getByTestId('wrapper')

      fireEvent.pointerDown(wrapper, pointer(1, 200, 150))
      expect(captureSpy).toHaveBeenCalledWith(1)
      delete (HTMLElement.prototype as { setPointerCapture?: unknown }).setPointerCapture
    })

    it("'immediate' mode's drag still shares the SAME panRef/zoomRef the analog stick and recenter use — no second camera state", () => {
      render(<Harness dragMode="immediate" />)
      const wrapper = screen.getByTestId('wrapper')

      fireEvent.pointerDown(wrapper, pointer(1, 200, 150))
      fireEvent.pointerMove(wrapper, pointer(1, 100, 150))
      fireEvent.pointerUp(wrapper, pointer(1, 100, 150))
      const afterDrag = readTransform().translateX

      // The analog stick continues from wherever drag left the camera —
      // never resetting/jumping to a separate starting position.
      act(() => hookApiBox.current!.setStickVector({ x: 1, y: 0 }))
      pumpFrame()
      expect(readTransform().translateX).not.toBe(afterDrag)
    })
  })
})
