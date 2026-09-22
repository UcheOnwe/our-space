import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoomCloseUp } from '../RoomCloseUp'
import styles from '../RoomCloseUp.module.css'

// A manual "pump one frame" stub, NOT an auto-firing one — see
// RoomPosterPreview.test.tsx's own doc comment on this exact same
// pattern: the analog camera's continuous loop re-schedules itself every
// frame, so an auto-firing stub recurses forever the instant it starts
// (a real, reproduced stack overflow, not a hypothetical one).
let pendingFrame: FrameRequestCallback | null = null

function pumpFrame() {
  const cb = pendingFrame
  pendingFrame = null
  cb?.(performance.now() + 16)
}

function mockViewport(width: number, height: number) {
  // `offsetWidth`/`offsetHeight`, not just `getBoundingClientRect` — see
  // useRoomCameraGestures.ts's own doc comment on `currentViewport`: SIZE
  // is read via the former (immune to an ancestor's CSS transform) since a
  // real "room mis-fitted until reload" bug traced back to
  // getBoundingClientRect reporting a transform-shrunk size at mount time.
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON() {},
  })
  pendingFrame = null
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pendingFrame = cb
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    pendingFrame = null
  })
}

function pointer(id: number, x: number, y: number, pointerType = 'touch') {
  return { pointerId: id, clientX: x, clientY: y, pointerType }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('RoomCloseUp', () => {
  it('renders the close-up video, a Back to Room control, and the given activity content', () => {
    const { container } = render(
      <RoomCloseUp
        videoSrc="/cozy-loft/tv-closeup.mp4"
        posterSrc="/cozy-loft/tv-closeup-poster.jpg"
        label="Watch"
        onBack={vi.fn()}
        isLeaving={false}
      >
        <p>Activity content</p>
      </RoomCloseUp>,
    )

    const video = container.querySelector('video')
    expect(video).toHaveAttribute('src', '/cozy-loft/tv-closeup.mp4')
    expect(screen.getByRole('button', { name: /Back to Room/ })).toBeInTheDocument()
    expect(screen.getByText('Activity content')).toBeInTheDocument()
  })

  it('calls onBack when the Back to Room control is clicked', () => {
    const onBack = vi.fn()
    render(
      <RoomCloseUp
        videoSrc="/cozy-loft/tv-closeup.mp4"
        posterSrc="/cozy-loft/tv-closeup-poster.jpg"
        label="Watch"
        onBack={onBack}
        isLeaving={false}
      >
        <p>Activity content</p>
      </RoomCloseUp>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Back to Room/ }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('a one-finger drag on the environment does NOT pan (neither touch nor mouse) — exploration here is via the analog joystick only', () => {
    // Repeated physical-phone testing found one-finger drag never felt
    // genuinely smooth here despite several rounds of fixes — close-ups
    // use a dedicated analog controller instead (see ../analogCamera/),
    // so a drag on the video/image itself must be a no-op, not a pan.
    mockViewport(400, 300)
    const { container } = render(
      <RoomCloseUp
        videoSrc="/cozy-loft/tv-closeup.mp4"
        posterSrc="/cozy-loft/tv-closeup-poster.jpg"
        label="Watch"
        onBack={vi.fn()}
        isLeaving={false}
      >
        <p>Activity content</p>
      </RoomCloseUp>,
    )

    const video = container.querySelector('video')
    const world = video!.parentElement as HTMLDivElement
    const viewport = world.parentElement as HTMLDivElement

    const before = world.style.transform
    fireEvent.pointerDown(viewport, pointer(1, 200, 150, 'touch'))
    fireEvent.pointerMove(viewport, pointer(1, 100, 150, 'touch'))
    pumpFrame()
    expect(world.style.transform).toBe(before)

    fireEvent.pointerDown(viewport, pointer(2, 200, 150, 'mouse'))
    fireEvent.pointerMove(viewport, pointer(2, 100, 150, 'mouse'))
    pumpFrame()
    expect(world.style.transform).toBe(before)
  })

  it('the analog joystick pans the environment, and Recenter restores the original framing', () => {
    mockViewport(400, 300)
    const { container } = render(
      <RoomCloseUp
        videoSrc="/cozy-loft/tv-closeup.mp4"
        posterSrc="/cozy-loft/tv-closeup-poster.jpg"
        label="Watch"
        onBack={vi.fn()}
        isLeaving={false}
      >
        <p>Activity content</p>
      </RoomCloseUp>,
    )

    const video = container.querySelector('video')
    const world = video!.parentElement as HTMLDivElement
    const joystick = screen.getByLabelText('Explore the environment')
    vi.spyOn(joystick, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 100,
      top: 250,
      left: 20,
      right: 120,
      bottom: 350,
      x: 20,
      y: 250,
      toJSON() {},
    })

    const initialTransform = world.style.transform
    fireEvent.pointerDown(joystick, { pointerId: 5, clientX: 120, clientY: 300 })
    pumpFrame()
    expect(world.style.transform).not.toBe(initialTransform)

    fireEvent.click(screen.getByLabelText('Recenter view'))
    expect(world.style.transform).toBe(initialTransform)
  })

  it('the joystick and Recenter control do not interfere with the activity content beside them', () => {
    // The analog only owns pointer input that begins on the joystick
    // itself — nested activity controls (Watch/Gaming/Door buttons) must
    // stay clickable regardless of the joystick/recenter being present in
    // the same close-up.
    mockViewport(400, 300)
    const onActivityClick = vi.fn()
    render(
      <RoomCloseUp
        videoSrc="/cozy-loft/tv-closeup.mp4"
        posterSrc="/cozy-loft/tv-closeup-poster.jpg"
        label="Watch"
        onBack={vi.fn()}
        isLeaving={false}
      >
        <button type="button" onClick={onActivityClick}>
          Continue with YouTube
        </button>
      </RoomCloseUp>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Continue with YouTube' }))
    expect(onActivityClick).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Recenter view')).toBeInTheDocument()
  })

  describe('enableDirectDrag (TV close-up experiment)', () => {
    it('does nothing when omitted — every other close-up stays analog-only by default (regression)', () => {
      mockViewport(400, 300)
      const { container } = render(
        <RoomCloseUp videoSrc="/cozy-loft/tv-closeup.mp4" posterSrc="/cozy-loft/tv-closeup-poster.jpg" label="Watch" onBack={vi.fn()} isLeaving={false}>
          <p>Activity content</p>
        </RoomCloseUp>,
      )
      const world = container.querySelector('video')!.parentElement as HTMLDivElement
      const viewport = world.parentElement as HTMLDivElement
      const before = world.style.transform
      fireEvent.pointerDown(viewport, pointer(1, 200, 150, 'touch'))
      fireEvent.pointerMove(viewport, pointer(1, 100, 150, 'touch'))
      expect(world.style.transform).toBe(before)
    })

    it('a one-finger TOUCH drag pans the environment IMMEDIATELY — no requestAnimationFrame pump needed, matching the proven preview pattern', () => {
      mockViewport(400, 300)
      const { container } = render(
        <RoomCloseUp
          videoSrc="/cozy-loft/tv-closeup.mp4"
          posterSrc="/cozy-loft/tv-closeup-poster.jpg"
          label="Watch"
          onBack={vi.fn()}
          isLeaving={false}
          enableDirectDrag
        >
          <p>Activity content</p>
        </RoomCloseUp>,
      )
      const world = container.querySelector('video')!.parentElement as HTMLDivElement
      const viewport = world.parentElement as HTMLDivElement
      const before = world.style.transform

      fireEvent.pointerDown(viewport, pointer(1, 200, 150, 'touch'))
      fireEvent.pointerMove(viewport, pointer(1, 100, 150, 'touch'))
      // No pumpFrame() call — the transform must already reflect the
      // drag synchronously, unlike the 'deferred' mode every other
      // close-up still uses.
      expect(world.style.transform).not.toBe(before)
    })

    it('a one-finger MOUSE drag also pans immediately', () => {
      mockViewport(400, 300)
      const { container } = render(
        <RoomCloseUp
          videoSrc="/cozy-loft/tv-closeup.mp4"
          posterSrc="/cozy-loft/tv-closeup-poster.jpg"
          label="Watch"
          onBack={vi.fn()}
          isLeaving={false}
          enableDirectDrag
        >
          <p>Activity content</p>
        </RoomCloseUp>,
      )
      const world = container.querySelector('video')!.parentElement as HTMLDivElement
      const viewport = world.parentElement as HTMLDivElement
      const before = world.style.transform

      fireEvent.pointerDown(viewport, pointer(1, 200, 150, 'mouse'))
      fireEvent.pointerMove(viewport, pointer(1, 100, 150, 'mouse'))
      expect(world.style.transform).not.toBe(before)
    })

    it('direction follows the pointer continuously within one gesture', () => {
      mockViewport(400, 300)
      const { container } = render(
        <RoomCloseUp
          videoSrc="/cozy-loft/tv-closeup.mp4"
          posterSrc="/cozy-loft/tv-closeup-poster.jpg"
          label="Watch"
          onBack={vi.fn()}
          isLeaving={false}
          enableDirectDrag
        >
          <p>Activity content</p>
        </RoomCloseUp>,
      )
      const world = container.querySelector('video')!.parentElement as HTMLDivElement
      const viewport = world.parentElement as HTMLDivElement

      fireEvent.pointerDown(viewport, pointer(1, 200, 150, 'touch'))
      fireEvent.pointerMove(viewport, pointer(1, 150, 150, 'touch'))
      const afterFirstMove = world.style.transform
      fireEvent.pointerMove(viewport, pointer(1, 100, 150, 'touch'))
      const afterSecondMove = world.style.transform
      expect(afterSecondMove).not.toBe(afterFirstMove)
    })

    it('releasing the pointer stops the drag', () => {
      mockViewport(400, 300)
      const { container } = render(
        <RoomCloseUp
          videoSrc="/cozy-loft/tv-closeup.mp4"
          posterSrc="/cozy-loft/tv-closeup-poster.jpg"
          label="Watch"
          onBack={vi.fn()}
          isLeaving={false}
          enableDirectDrag
        >
          <p>Activity content</p>
        </RoomCloseUp>,
      )
      const world = container.querySelector('video')!.parentElement as HTMLDivElement
      const viewport = world.parentElement as HTMLDivElement

      fireEvent.pointerDown(viewport, pointer(1, 200, 150, 'touch'))
      fireEvent.pointerMove(viewport, pointer(1, 100, 150, 'touch'))
      fireEvent.pointerUp(viewport, pointer(1, 100, 150, 'touch'))
      const afterRelease = world.style.transform

      fireEvent.pointerMove(viewport, pointer(1, 50, 150, 'touch'))
      expect(world.style.transform).toBe(afterRelease)
    })

    it('pointercancel cleans up the drag the same way release does', () => {
      mockViewport(400, 300)
      const { container } = render(
        <RoomCloseUp
          videoSrc="/cozy-loft/tv-closeup.mp4"
          posterSrc="/cozy-loft/tv-closeup-poster.jpg"
          label="Watch"
          onBack={vi.fn()}
          isLeaving={false}
          enableDirectDrag
        >
          <p>Activity content</p>
        </RoomCloseUp>,
      )
      const world = container.querySelector('video')!.parentElement as HTMLDivElement
      const viewport = world.parentElement as HTMLDivElement

      fireEvent.pointerDown(viewport, pointer(1, 200, 150, 'touch'))
      fireEvent.pointerMove(viewport, pointer(1, 100, 150, 'touch'))
      fireEvent.pointerCancel(viewport, pointer(1, 100, 150, 'touch'))
      const afterCancel = world.style.transform

      fireEvent.pointerMove(viewport, pointer(1, 50, 150, 'touch'))
      expect(world.style.transform).toBe(afterCancel)
    })

    it('a two-finger pinch still zooms', () => {
      mockViewport(400, 300)
      const { container } = render(
        <RoomCloseUp
          videoSrc="/cozy-loft/tv-closeup.mp4"
          posterSrc="/cozy-loft/tv-closeup-poster.jpg"
          label="Watch"
          onBack={vi.fn()}
          isLeaving={false}
          enableDirectDrag
        >
          <p>Activity content</p>
        </RoomCloseUp>,
      )
      const world = container.querySelector('video')!.parentElement as HTMLDivElement
      const viewport = world.parentElement as HTMLDivElement

      fireEvent.pointerDown(viewport, pointer(1, 190, 150))
      fireEvent.pointerDown(viewport, pointer(2, 210, 150))
      fireEvent.pointerMove(viewport, pointer(1, 150, 150))
      fireEvent.pointerMove(viewport, pointer(2, 250, 150))

      const match = /scale\(([\d.]+)\)/.exec(world.style.transform)
      expect(match).not.toBeNull()
    })

    it('the analog joystick still moves the camera, sharing the SAME camera state as drag — no fighting, no stale position', () => {
      mockViewport(400, 300)
      const { container } = render(
        <RoomCloseUp
          videoSrc="/cozy-loft/tv-closeup.mp4"
          posterSrc="/cozy-loft/tv-closeup-poster.jpg"
          label="Watch"
          onBack={vi.fn()}
          isLeaving={false}
          enableDirectDrag
        >
          <p>Activity content</p>
        </RoomCloseUp>,
      )
      const world = container.querySelector('video')!.parentElement as HTMLDivElement
      const viewport = world.parentElement as HTMLDivElement
      const joystick = screen.getByLabelText('Explore the environment')
      vi.spyOn(joystick, 'getBoundingClientRect').mockReturnValue({
        width: 100,
        height: 100,
        top: 250,
        left: 20,
        right: 120,
        bottom: 350,
        x: 20,
        y: 250,
        toJSON() {},
      })

      // Drag first.
      fireEvent.pointerDown(viewport, pointer(1, 200, 150, 'touch'))
      fireEvent.pointerMove(viewport, pointer(1, 100, 150, 'touch'))
      fireEvent.pointerUp(viewport, pointer(1, 100, 150, 'touch'))
      const afterDrag = world.style.transform

      // Analog continues from the dragged position, not a stale/reset one.
      fireEvent.pointerDown(joystick, { pointerId: 5, clientX: 120, clientY: 300 })
      pumpFrame()
      const afterAnalog = world.style.transform
      expect(afterAnalog).not.toBe(afterDrag)
      fireEvent.pointerUp(joystick, { pointerId: 5, clientX: 120, clientY: 300 })

      // Drag again, continuing from wherever the analog left the camera —
      // never jumping/snapping back to the pre-drag position.
      fireEvent.pointerDown(viewport, pointer(2, 200, 150, 'touch'))
      fireEvent.pointerMove(viewport, pointer(2, 250, 150, 'touch'))
      const afterSecondDrag = world.style.transform
      expect(afterSecondDrag).not.toBe(afterAnalog)
    })

    it('Recenter resets the one shared camera state regardless of which input moved it last', () => {
      mockViewport(400, 300)
      const { container } = render(
        <RoomCloseUp
          videoSrc="/cozy-loft/tv-closeup.mp4"
          posterSrc="/cozy-loft/tv-closeup-poster.jpg"
          label="Watch"
          onBack={vi.fn()}
          isLeaving={false}
          enableDirectDrag
        >
          <p>Activity content</p>
        </RoomCloseUp>,
      )
      const world = container.querySelector('video')!.parentElement as HTMLDivElement
      const viewport = world.parentElement as HTMLDivElement
      const joystick = screen.getByLabelText('Explore the environment')
      vi.spyOn(joystick, 'getBoundingClientRect').mockReturnValue({
        width: 100,
        height: 100,
        top: 250,
        left: 20,
        right: 120,
        bottom: 350,
        x: 20,
        y: 250,
        toJSON() {},
      })
      const initialTransform = world.style.transform

      // Drag, then analog, then Recenter — must land back at the exact
      // original fitted composition either input could have left it at.
      fireEvent.pointerDown(viewport, pointer(1, 200, 150, 'touch'))
      fireEvent.pointerMove(viewport, pointer(1, 100, 150, 'touch'))
      fireEvent.pointerUp(viewport, pointer(1, 100, 150, 'touch'))
      fireEvent.pointerDown(joystick, { pointerId: 5, clientX: 120, clientY: 300 })
      pumpFrame()
      fireEvent.pointerUp(joystick, { pointerId: 5, clientX: 120, clientY: 300 })
      expect(world.style.transform).not.toBe(initialTransform)

      fireEvent.click(screen.getByLabelText('Recenter view'))
      expect(world.style.transform).toBe(initialTransform)
    })
  })

  it('renders the isolated page-scroll controls, which only call window.scrollBy and never touch the camera', () => {
    mockViewport(400, 300)
    const scrollBySpy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const { container } = render(
      <RoomCloseUp
        videoSrc="/cozy-loft/tv-closeup.mp4"
        posterSrc="/cozy-loft/tv-closeup-poster.jpg"
        label="Watch"
        onBack={vi.fn()}
        isLeaving={false}
      >
        <p>Activity content</p>
      </RoomCloseUp>,
    )

    const video = container.querySelector('video')
    const world = video!.parentElement as HTMLDivElement
    const before = world.style.transform

    fireEvent.click(screen.getByLabelText('Scroll page down'))
    fireEvent.click(screen.getByLabelText('Scroll page up'))
    expect(scrollBySpy).toHaveBeenCalledTimes(2)
    expect(world.style.transform).toBe(before)
  })

  it('renders no .activity box at all for a pure exploration close-up (no children) — avoids an invisible pointer-events dead zone over the pannable world', () => {
    const { container } = render(
      <RoomCloseUp
        videoSrc="/cozy-loft/tv-closeup.mp4"
        posterSrc="/cozy-loft/tv-closeup-poster.jpg"
        label="Kitchen"
        onBack={vi.fn()}
        isLeaving={false}
      >
        {null}
      </RoomCloseUp>,
    )

    expect(container.querySelector(`.${styles.activity}`)).not.toBeInTheDocument()
  })

  it('defaults the back control to "Back to Room"', () => {
    render(
      <RoomCloseUp
        imageSrc="/lauruch/garage.jpg"
        label="Garage"
        onBack={vi.fn()}
        isLeaving={false}
      >
        {null}
      </RoomCloseUp>,
    )

    expect(screen.getByRole('button', { name: '‹ Back to Room' })).toBeInTheDocument()
  })

  it('uses a custom backLabel when given — for a close-up reached directly from another close-up rather than the room', () => {
    render(
      <RoomCloseUp
        imageSrc="/lauruch/garage.jpg"
        label="Garage"
        onBack={vi.fn()}
        backLabel="Back to Door"
        isLeaving={false}
      >
        {null}
      </RoomCloseUp>,
    )

    expect(screen.getByRole('button', { name: '‹ Back to Door' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '‹ Back to Room' })).not.toBeInTheDocument()
  })

  it('defaults to the normal fade+zoom entrance class (transitionStyle="enter" is implicit)', () => {
    const { container } = render(
      <RoomCloseUp imageSrc="/lauruch/garage.jpg" label="Garage" onBack={vi.fn()} isLeaving={false}>
        {null}
      </RoomCloseUp>,
    )

    expect(container.querySelector(`.${styles.entering}`)).toBeInTheDocument()
    expect(container.querySelector(`.${styles.switching}`)).not.toBeInTheDocument()
  })

  it('uses the opaque-only "switching" transition for a direct close-up-to-close-up transition, never the fade-from-transparent entrance', () => {
    // Regression test for a real bug real-device testing caught: the
    // normal entrance keyframe fades in FROM opacity 0, so if this were
    // used for a switchHotspot-driven remount (the caller re-keys this
    // component on every direct switch), this element's own first painted
    // frame would be transparent while the outgoing close-up has already
    // been removed in the same commit — exposing the room underneath for
    // a frame, even though the STATE machine never touches 'room'.
    // '.switching' has no opacity component at all, so this stays fully
    // opaque (and therefore fully covering the room) from frame one.
    const { container } = render(
      <RoomCloseUp imageSrc="/lauruch/garage.jpg" label="Garage" onBack={vi.fn()} isLeaving={false} transitionStyle="switch">
        {null}
      </RoomCloseUp>,
    )

    expect(container.querySelector(`.${styles.switching}`)).toBeInTheDocument()
    expect(container.querySelector(`.${styles.entering}`)).not.toBeInTheDocument()
  })

  it('still uses the leaving class while isLeaving is true, regardless of transitionStyle', () => {
    const { container } = render(
      <RoomCloseUp
        imageSrc="/lauruch/garage.jpg"
        label="Garage"
        onBack={vi.fn()}
        isLeaving={true}
        transitionStyle="switch"
      >
        {null}
      </RoomCloseUp>,
    )

    expect(container.querySelector(`.${styles.leaving}`)).toBeInTheDocument()
    expect(container.querySelector(`.${styles.switching}`)).not.toBeInTheDocument()
  })

  it('renders the .activity box when real activity content is given, so it stays interactive', () => {
    const { container } = render(
      <RoomCloseUp
        videoSrc="/cozy-loft/tv-closeup.mp4"
        posterSrc="/cozy-loft/tv-closeup-poster.jpg"
        label="Watch"
        onBack={vi.fn()}
        isLeaving={false}
      >
        <p>Activity content</p>
      </RoomCloseUp>,
    )

    expect(container.querySelector(`.${styles.activity}`)).toBeInTheDocument()
  })
})
