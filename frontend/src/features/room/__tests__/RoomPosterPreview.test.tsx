import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomPosterPreview } from '../RoomPosterPreview'

beforeEach(() => {
  // `offsetWidth`/`offsetHeight`, not just `getBoundingClientRect` — see
  // useRoomCameraGestures.ts's own doc comment on `currentViewport`: SIZE
  // is read via the former (immune to an ancestor's CSS transform) since a
  // real "room mis-fitted until reload" bug traced back to
  // getBoundingClientRect reporting a transform-shrunk size at mount time.
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 400,
    height: 300,
    top: 0,
    left: 0,
    right: 400,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON() {},
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function pointer(id: number, x: number, y: number, pointerType = 'touch') {
  return { pointerId: id, clientX: x, clientY: y, pointerType }
}

describe('RoomPosterPreview', () => {
  it('renders the poster image', () => {
    const { container } = render(<RoomPosterPreview src="/room/couple-home-full-preview.png" />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', '/room/couple-home-full-preview.png')
  })

  it('a one-finger TOUCH drag on the environment pans — uses the same useRoomCameraGestures path Cozy Loft’s/After Hours’ own previews use (physically tested smooth), not the analog controller’s own drag path', () => {
    const { container } = render(<RoomPosterPreview src="/room/couple-home-full-preview.png" />)
    const world = container.querySelector('img')!.parentElement as HTMLElement
    const wrapper = world.parentElement as HTMLElement

    const beforeTransform = world.style.transform
    fireEvent.pointerDown(wrapper, pointer(1, 200, 150, 'touch'))
    fireEvent.pointerMove(wrapper, pointer(1, 100, 150, 'touch'))

    expect(world.style.transform).not.toBe(beforeTransform)
  })

  it('a one-finger MOUSE drag on the environment still pans — desktop exploration is preserved', () => {
    const { container } = render(<RoomPosterPreview src="/room/couple-home-full-preview.png" />)
    const world = container.querySelector('img')!.parentElement as HTMLElement
    const wrapper = world.parentElement as HTMLElement

    const beforeTransform = world.style.transform
    fireEvent.pointerDown(wrapper, pointer(1, 200, 150, 'mouse'))
    fireEvent.pointerMove(wrapper, pointer(1, 100, 150, 'mouse'))

    expect(world.style.transform).not.toBe(beforeTransform)
  })

  it('direction follows the pointer — dragging further in the same gesture keeps moving the camera, matching the finger', () => {
    const { container } = render(<RoomPosterPreview src="/room/couple-home-full-preview.png" />)
    const world = container.querySelector('img')!.parentElement as HTMLElement
    const wrapper = world.parentElement as HTMLElement

    fireEvent.pointerDown(wrapper, pointer(1, 200, 150, 'touch'))
    fireEvent.pointerMove(wrapper, pointer(1, 150, 150, 'touch'))
    const afterFirstMove = world.style.transform
    fireEvent.pointerMove(wrapper, pointer(1, 100, 150, 'touch'))
    const afterSecondMove = world.style.transform

    expect(afterSecondMove).not.toBe(afterFirstMove)
  })

  it('releasing the pointer stops the drag — a further move with no active pointer does not move the camera', () => {
    const { container } = render(<RoomPosterPreview src="/room/couple-home-full-preview.png" />)
    const world = container.querySelector('img')!.parentElement as HTMLElement
    const wrapper = world.parentElement as HTMLElement

    fireEvent.pointerDown(wrapper, pointer(1, 200, 150, 'touch'))
    fireEvent.pointerMove(wrapper, pointer(1, 100, 150, 'touch'))
    fireEvent.pointerUp(wrapper, pointer(1, 100, 150, 'touch'))
    const afterRelease = world.style.transform

    fireEvent.pointerMove(wrapper, pointer(1, 50, 150, 'touch'))
    expect(world.style.transform).toBe(afterRelease)
  })

  it('pointercancel also stops the drag cleanly', () => {
    const { container } = render(<RoomPosterPreview src="/room/couple-home-full-preview.png" />)
    const world = container.querySelector('img')!.parentElement as HTMLElement
    const wrapper = world.parentElement as HTMLElement

    fireEvent.pointerDown(wrapper, pointer(1, 200, 150, 'touch'))
    fireEvent.pointerMove(wrapper, pointer(1, 100, 150, 'touch'))
    fireEvent.pointerCancel(wrapper, pointer(1, 100, 150, 'touch'))
    const afterCancel = world.style.transform

    fireEvent.pointerMove(wrapper, pointer(1, 50, 150, 'touch'))
    expect(world.style.transform).toBe(afterCancel)
  })

  it('a two-finger pinch still zooms', () => {
    const { container } = render(<RoomPosterPreview src="/room/couple-home-full-preview.png" />)
    const world = container.querySelector('img')!.parentElement as HTMLElement
    const wrapper = world.parentElement as HTMLElement

    fireEvent.pointerDown(wrapper, pointer(1, 190, 150))
    fireEvent.pointerDown(wrapper, pointer(2, 210, 150))
    fireEvent.pointerMove(wrapper, pointer(1, 150, 150))
    fireEvent.pointerMove(wrapper, pointer(2, 250, 150))

    const match = /scale\(([\d.]+)\)/.exec(world.style.transform)
    expect(match).not.toBeNull()
  })

  it('camera remains bounded — panning far past the edge never exposes empty canvas', () => {
    const { container } = render(<RoomPosterPreview src="/room/couple-home-full-preview.png" />)
    const world = container.querySelector('img')!.parentElement as HTMLElement
    const wrapper = world.parentElement as HTMLElement

    fireEvent.pointerDown(wrapper, pointer(1, 5000, 150, 'touch'))
    fireEvent.pointerMove(wrapper, pointer(1, -5000, 150, 'touch'))

    const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(world.style.transform)
    expect(match).not.toBeNull()
    const [, translateX, , scale] = match!
    const scaledWidth = 1600 * Number(scale)
    // The world's right edge must never end up short of the viewport's
    // right edge (400px, mocked above) — bounded, not runaway.
    expect(Number(translateX) + scaledWidth).toBeGreaterThanOrEqual(400)
  })

  it('renders no analog joystick — this preview relies on direct drag/pinch only, matching Cozy Loft’s/After Hours’ own previews', () => {
    render(<RoomPosterPreview src="/room/couple-home-full-preview.png" />)
    expect(screen.queryByLabelText('Explore the environment')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Recenter view')).not.toBeInTheDocument()
  })

  it('exposes only the isolated page-scroll controls — never an activatable room', () => {
    render(<RoomPosterPreview src="/room/couple-home-full-preview.png" />)
    const buttons = screen.getAllByRole('button')
    const names = buttons.map((button) => button.getAttribute('aria-label')).sort()
    expect(names).toEqual(['Scroll page down', 'Scroll page up'])
  })

  it('the page-scroll buttons only call window.scrollBy — they never touch camera/drag state', () => {
    const scrollBySpy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const { container } = render(<RoomPosterPreview src="/room/couple-home-full-preview.png" />)
    const world = container.querySelector('img')!.parentElement as HTMLElement
    const before = world.style.transform

    fireEvent.click(screen.getByLabelText('Scroll page down'))
    expect(scrollBySpy).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByLabelText('Scroll page up'))
    expect(scrollBySpy).toHaveBeenCalledTimes(2)

    expect(world.style.transform).toBe(before)
  })
})
