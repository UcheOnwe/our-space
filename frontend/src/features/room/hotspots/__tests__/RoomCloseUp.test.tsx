import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoomCloseUp } from '../RoomCloseUp'

function mockViewport(width: number, height: number) {
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
}

afterEach(() => {
  vi.restoreAllMocks()
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

  it('supports the same one-finger pan the main room uses, so the close-up composition is explorable on mobile', () => {
    mockViewport(400, 300) // narrower/taller than the 16:9 video, so panning is meaningful
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
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 150 })
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 100, clientY: 150 })

    expect(world.style.transform).not.toBe(before)
  })
})
