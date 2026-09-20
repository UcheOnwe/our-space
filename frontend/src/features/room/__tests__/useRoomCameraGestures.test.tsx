import { useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_ZOOM_FACTOR, computeCameraFrame } from '../camera'
import { ROOM_WORLD_HEIGHT, ROOM_WORLD_WIDTH } from '../constants'
import { useRoomCameraGestures } from '../useRoomCameraGestures'

// 400x300 is deliberately a different aspect ratio than the 1600x900
// world (1.778) — a narrower/taller box, the same kind of mismatch a
// real mobile viewport has against Cozy Loft's 16:9 video, so cover-fit
// leaves real pan range on the (here) horizontal axis to exercise.
const VIEWPORT = { width: 400, height: 300 }
const BASE_SCALE = computeCameraFrame(VIEWPORT.width, VIEWPORT.height, ROOM_WORLD_WIDTH, ROOM_WORLD_HEIGHT).scale

// The "world centered in the viewport, no pan" translate — see
// useRoomCameraGestures's own doc comment for why the rendered
// translateX/Y must include this term, not just the raw pan offset.
function centeredTranslate(scale: number) {
  return {
    x: VIEWPORT.width / 2 - (ROOM_WORLD_WIDTH / 2) * scale,
    y: VIEWPORT.height / 2 - (ROOM_WORLD_HEIGHT / 2) * scale,
  }
}

function Harness({ enabled = true }: { enabled?: boolean }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { camera, handlers } = useRoomCameraGestures(wrapperRef, enabled)
  return (
    <div ref={wrapperRef} data-testid="wrapper" {...handlers}>
      <div data-testid="scale">{camera.scale}</div>
      <div data-testid="translateX">{camera.translateX}</div>
      <div data-testid="translateY">{camera.translateY}</div>
    </div>
  )
}

function readCamera() {
  return {
    scale: Number(screen.getByTestId('scale').textContent),
    translateX: Number(screen.getByTestId('translateX').textContent),
    translateY: Number(screen.getByTestId('translateY').textContent),
  }
}

beforeEach(() => {
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
})

afterEach(() => {
  vi.restoreAllMocks()
})

function pointer(id: number, x: number, y: number) {
  return { pointerId: id, clientX: x, clientY: y }
}

describe('useRoomCameraGestures', () => {
  it('starts centered at the base cover-fit scale with no pan', () => {
    render(<Harness />)
    const camera = readCamera()
    const centered = centeredTranslate(BASE_SCALE)
    expect(camera.scale).toBeCloseTo(BASE_SCALE)
    expect(camera.translateX).toBeCloseTo(centered.x)
    expect(camera.translateY).toBeCloseTo(centered.y)
  })

  it('a one-finger drag pans the world, in the direction the finger moves', () => {
    render(<Harness />)
    const wrapper = screen.getByTestId('wrapper')

    fireEvent.pointerDown(wrapper, pointer(1, 200, 150))
    fireEvent.pointerMove(wrapper, pointer(1, 150, 150))

    const camera = readCamera()
    const centered = centeredTranslate(BASE_SCALE)
    expect(camera.translateX).toBeCloseTo(centered.x - 50)
    expect(camera.translateY).toBeCloseTo(centered.y)
  })

  it('reaches the world\'s true left and right edges — never stuck halfway, never past the edge', () => {
    render(<Harness />)
    const wrapper = screen.getByTestId('wrapper')
    const scaledWidth = ROOM_WORLD_WIDTH * BASE_SCALE

    // Drag far enough right that the world's LEFT edge reaches the
    // viewport's left edge (translateX -> 0) — dragging further must not
    // push it past that (would expose empty space to the left).
    fireEvent.pointerDown(wrapper, pointer(1, 0, 150))
    fireEvent.pointerMove(wrapper, pointer(1, 5000, 150))
    expect(readCamera().translateX).toBeCloseTo(0)

    fireEvent.pointerUp(wrapper, pointer(1, 5000, 150))

    // Drag far enough left that the world's RIGHT edge reaches the
    // viewport's right edge (translateX -> viewportWidth - scaledWidth).
    fireEvent.pointerDown(wrapper, pointer(1, 5000, 150))
    fireEvent.pointerMove(wrapper, pointer(1, -5000, 150))
    expect(readCamera().translateX).toBeCloseTo(VIEWPORT.width - scaledWidth)
  })

  it('clamps panning so the world can never be dragged away from covering the viewport', () => {
    render(<Harness />)
    const wrapper = screen.getByTestId('wrapper')
    const scaledWidth = ROOM_WORLD_WIDTH * BASE_SCALE

    fireEvent.pointerDown(wrapper, pointer(1, 900, 150))
    // A drag far larger than any possible pan range at this scale.
    fireEvent.pointerMove(wrapper, pointer(1, 0, 150))

    const camera = readCamera()
    // The world's right edge lands exactly at the viewport's right edge
    // (translateX + scaledWidth === viewportWidth) — never short of it
    // (which would expose empty background beyond the world's real
    // edge) and never past it either.
    expect(camera.translateX).toBeCloseTo(VIEWPORT.width - scaledWidth)
    expect(camera.translateX + scaledWidth).toBeCloseTo(VIEWPORT.width)
    expect(camera.translateY).toBeCloseTo(centeredTranslate(BASE_SCALE).y)
  })

  it('a two-finger pinch zooms in, bounded by MAX_ZOOM_FACTOR even for an extreme gesture, and keeps covering the viewport', () => {
    render(<Harness />)
    const wrapper = screen.getByTestId('wrapper')

    fireEvent.pointerDown(wrapper, pointer(1, 190, 150))
    fireEvent.pointerDown(wrapper, pointer(2, 210, 150))
    // Fingers spread apart 50x -> would demand far more than the allowed
    // zoom ceiling.
    fireEvent.pointerMove(wrapper, pointer(1, 0, 150))
    fireEvent.pointerMove(wrapper, pointer(2, 400, 150))

    const camera = readCamera()
    expect(camera.scale).toBeCloseTo(BASE_SCALE * MAX_ZOOM_FACTOR)
    // Still fully covers the viewport at the new (larger) scale — the
    // scaled world is now bigger than the viewport on both axes, so a
    // freshly-clamped pan of 0 keeps it centered and covering.
    const scaledWidth = ROOM_WORLD_WIDTH * camera.scale
    const scaledHeight = ROOM_WORLD_HEIGHT * camera.scale
    expect(scaledWidth).toBeGreaterThanOrEqual(VIEWPORT.width)
    expect(scaledHeight).toBeGreaterThanOrEqual(VIEWPORT.height)
  })

  it('after zooming in, the user can still reach the legitimate far-left and far-right of the room', () => {
    render(<Harness />)
    const wrapper = screen.getByTestId('wrapper')

    // Zoom in first.
    fireEvent.pointerDown(wrapper, pointer(1, 190, 150))
    fireEvent.pointerDown(wrapper, pointer(2, 210, 150))
    fireEvent.pointerMove(wrapper, pointer(1, 150, 150))
    fireEvent.pointerMove(wrapper, pointer(2, 250, 150))
    fireEvent.pointerUp(wrapper, pointer(1, 150, 150))
    fireEvent.pointerUp(wrapper, pointer(2, 250, 150))

    const zoomedScale = readCamera().scale
    const scaledWidth = ROOM_WORLD_WIDTH * zoomedScale

    // Now drag as far right as possible — must reach the world's true
    // left edge (translateX -> 0), not get stuck partway.
    fireEvent.pointerDown(wrapper, pointer(3, 0, 150))
    fireEvent.pointerMove(wrapper, pointer(3, 5000, 150))
    expect(readCamera().translateX).toBeCloseTo(0)
    fireEvent.pointerUp(wrapper, pointer(3, 5000, 150))

    // And as far left as possible — must reach the world's true right
    // edge (translateX -> viewportWidth - scaledWidth).
    fireEvent.pointerDown(wrapper, pointer(4, 5000, 150))
    fireEvent.pointerMove(wrapper, pointer(4, -5000, 150))
    expect(readCamera().translateX).toBeCloseTo(VIEWPORT.width - scaledWidth)
  })

  it('ignores gestures while disabled (e.g. mid hotspot-transition, or a non-interactive preview)', () => {
    render(<Harness enabled={false} />)
    const wrapper = screen.getByTestId('wrapper')

    fireEvent.pointerDown(wrapper, pointer(1, 200, 150))
    fireEvent.pointerMove(wrapper, pointer(1, 100, 150))

    const camera = readCamera()
    const centered = centeredTranslate(BASE_SCALE)
    expect(camera.translateX).toBeCloseTo(centered.x)
    expect(camera.scale).toBeCloseTo(BASE_SCALE)
  })
})
