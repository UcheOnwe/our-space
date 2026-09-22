import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CozyLoftRoom } from '../CozyLoftRoom'
import type { CozyLoftRoomHandle } from '../CozyLoftRoom'

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
}

const MAIN_ROOM_VIDEO_SRC = '/cozy-loft/main-room-lights-off.mp4'
// findBy*'s default 1000ms polling window is exactly equal to
// useRoomHotspotInteraction's own TRANSITION_DURATION_MS — too tight a
// race in practice. Every wait for a phase transition below passes this
// explicitly instead.
const PHASE_TRANSITION_WAIT = { timeout: 2000 }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CozyLoftRoom', () => {
  it('renders a muted, looping, inline-playing video pointed at the runtime asset', () => {
    const { container } = render(<CozyLoftRoom />)

    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(video).toHaveAttribute('src', '/cozy-loft/main-room-lights-off.mp4')
    expect(video).toHaveAttribute('loop')
    expect(video).toHaveAttribute('playsinline')
    // A real extracted first-frame poster (see AmbientVideo.tsx) — what
    // lets the room exist visually before Safari has decoded any video
    // data, instead of showing its own "not yet playing" presentation.
    expect(video).toHaveAttribute('poster', '/cozy-loft/main-room-poster.jpg')
    // `muted` is a "live state" IDL property, not a reflected attribute —
    // React sets `video.muted` directly rather than a `muted` HTML
    // attribute, so this must be checked as a DOM property, not via
    // toHaveAttribute (which would incorrectly fail).
    expect(video?.muted).toBe(true)
    expect(video?.autoplay).toBe(true)
  })

  it('renders the TV and Gaming hotspot icons by default', () => {
    render(<CozyLoftRoom />)
    expect(screen.getByRole('button', { name: 'Watch' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('suppresses hotspot icons when enableHotspots=false, but still allows pan (RoomGallery preview usage)', () => {
    render(<CozyLoftRoom enableHotspots={false} />)
    expect(screen.queryByRole('button', { name: 'Watch' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()
  })

  it('only reveals the Watch activity after the TV close-up transition completes, then calls onOpenWatch', async () => {
    const onOpenWatch = vi.fn()
    render(<CozyLoftRoom onOpenWatch={onOpenWatch} />)

    fireEvent.click(screen.getByRole('button', { name: 'Watch' }))

    // Mid-transition: no activity UI yet, and hotspots are hidden (this is
    // what "prevent conflicting interactions while transitioning" means in
    // practice — there's nothing left to click).
    expect(screen.queryByRole('button', { name: /Continue with YouTube/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Watch' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument()

    const watchButton = await screen.findByRole('button', { name: /Continue with YouTube/ }, PHASE_TRANSITION_WAIT)
    fireEvent.click(watchButton)
    expect(onOpenWatch).toHaveBeenCalledTimes(1)
  })

  it('only reveals the Gaming selector after the Gaming close-up transition completes, with no game launched yet', async () => {
    render(<CozyLoftRoom />)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.queryByText('Play Together')).not.toBeInTheDocument()

    expect(await screen.findByText('Play Together', {}, PHASE_TRANSITION_WAIT)).toBeInTheDocument()
    expect(screen.getByText('Play Solo')).toBeInTheDocument()
    expect(screen.getByText('Physics Drop')).toBeInTheDocument()
  })

  it('returns to the room (hotspots visible again) after Back to Room', async () => {
    render(<CozyLoftRoom />)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await screen.findByText('Play Together', {}, PHASE_TRANSITION_WAIT)

    fireEvent.click(screen.getByRole('button', { name: /Back to Room/ }))
    expect(await screen.findByRole('button', { name: 'Watch' }, PHASE_TRANSITION_WAIT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(screen.queryByText('Play Together')).not.toBeInTheDocument()
  })

  it('keeps the base room video mounted throughout entering/closeup/leaving — never a blank gap behind the close-up', async () => {
    const { container } = render(<CozyLoftRoom />)
    const mainVideo = () => container.querySelector(`video[src="${MAIN_ROOM_VIDEO_SRC}"]`)

    expect(mainVideo()).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Watch' }))
    expect(mainVideo()).not.toBeNull() // still mounted mid-transition ("entering")

    await screen.findByRole('button', { name: /Continue with YouTube/ }, PHASE_TRANSITION_WAIT)
    expect(mainVideo()).not.toBeNull() // still mounted once inside the close-up

    fireEvent.click(screen.getByRole('button', { name: /Back to Room/ }))
    expect(mainVideo()).not.toBeNull() // still mounted while leaving
    await screen.findByRole('button', { name: 'Watch' }, PHASE_TRANSITION_WAIT)
    expect(mainVideo()).not.toBeNull()
  })

  it('preloads the destination close-up video while entering, and drops the preload copy once the real close-up takes over', async () => {
    const { container } = render(<CozyLoftRoom />)
    const closeUpVideos = () =>
      Array.from(container.querySelectorAll('video')).filter((v) => v.getAttribute('src') === '/cozy-loft/tv-closeup.mp4')

    fireEvent.click(screen.getByRole('button', { name: 'Watch' }))
    // A hidden copy is already mounted/decoding mid-transition, ahead of
    // the real, visible close-up.
    expect(closeUpVideos()).toHaveLength(1)

    await screen.findByRole('button', { name: /Continue with YouTube/ }, PHASE_TRANSITION_WAIT)
    // Exactly one copy remains once the real close-up is showing — the
    // preload copy is gone, not doubled up alongside it.
    expect(closeUpVideos()).toHaveLength(1)
  })

  it('positions hotspot icons inside the same transformed world box as the video, so pan/zoom carries them together', () => {
    const { container } = render(<CozyLoftRoom />)
    const video = container.querySelector(`video[src="${MAIN_ROOM_VIDEO_SRC}"]`)
    const watchButton = screen.getByRole('button', { name: 'Watch' })
    const playButton = screen.getByRole('button', { name: 'Play' })

    // Same DOM parent as the video = the same element useRoomCameraGestures
    // applies its transform to — there's no separate position-syncing
    // code keeping these "attached" to the TV/gaming setup; they just
    // share one transformed coordinate system.
    expect(watchButton.parentElement).toBe(video?.parentElement)
    expect(playButton.parentElement).toBe(video?.parentElement)
  })

  it('renders Back to Room via a portal straight to <body>, not nested under any transformed ancestor', async () => {
    render(<CozyLoftRoom />)
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }))

    const backButton = await screen.findByRole('button', { name: /Back to Room/ }, PHASE_TRANSITION_WAIT)
    expect(backButton.parentElement).toBe(document.body)
  })

  it('the TV close-up now supports direct drag (immediate mode), reaching through the shared enableDirectDrag prop passed at this room’s own RoomCloseUp call site', async () => {
    mockViewport(400, 300)
    const { container } = render(<CozyLoftRoom />)
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }))
    await screen.findByRole('button', { name: /Continue with YouTube/ }, PHASE_TRANSITION_WAIT)

    const world = container.querySelector('video[src="/cozy-loft/tv-closeup.mp4"]')!.parentElement as HTMLDivElement
    const viewport = world.parentElement as HTMLDivElement
    const before = world.style.transform

    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 150, pointerType: 'touch' })
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 100, clientY: 150, pointerType: 'touch' })
    // No rAF pump — 'immediate' mode writes synchronously.
    expect(world.style.transform).not.toBe(before)
  })

  it('allows one-finger panning even with enableHotspots=false (RoomGallery preview can inspect the whole room before unlocking)', () => {
    mockViewport(400, 300) // narrower/taller than the 16:9 world, so panning is meaningful
    const { container } = render(<CozyLoftRoom enableHotspots={false} />)
    const wrapper = container.querySelector(`video[src="${MAIN_ROOM_VIDEO_SRC}"]`)!.parentElement!.parentElement!
      .parentElement as HTMLDivElement
    // video -> .activityEffect -> .world -> .wrapper (the element the
    // pointer handlers are actually attached to).
    const world = wrapper.firstElementChild as HTMLDivElement

    const before = world.style.transform
    fireEvent.pointerDown(wrapper, { pointerId: 1, clientX: 200, clientY: 150 })
    fireEvent.pointerMove(wrapper, { pointerId: 1, clientX: 100, clientY: 150 })

    expect(world.style.transform).not.toBe(before)
  })

  it('never renders a world smaller than the viewport at any zoom — no reachable state exposes empty canvas', () => {
    mockViewport(390, 550) // a real iPhone-ish narrow/tall viewport
    const { container } = render(<CozyLoftRoom />)
    const video = container.querySelector(`video[src="${MAIN_ROOM_VIDEO_SRC}"]`)
    const world = video!.parentElement!.parentElement as HTMLDivElement

    const match = world.style.transform.match(/scale\(([\d.]+)\)/)
    const scale = match ? Number(match[1]) : 0
    expect(scale * 1600).toBeGreaterThanOrEqual(390)
    expect(scale * 900).toBeGreaterThanOrEqual(550)
  })

  it('exposes returnToRoom via ref — a no-op in the plain room, and leaves an active close-up when called', async () => {
    const ref = createRef<CozyLoftRoomHandle>()
    render(<CozyLoftRoom ref={ref} />)

    // No-op while already at the plain room — nothing to leave.
    ref.current?.returnToRoom()
    expect(screen.getByRole('button', { name: 'Watch' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await screen.findByText('Play Together', {}, PHASE_TRANSITION_WAIT)

    ref.current?.returnToRoom()
    expect(await screen.findByRole('button', { name: 'Watch' }, PHASE_TRANSITION_WAIT)).toBeInTheDocument()
    expect(screen.queryByText('Play Together')).not.toBeInTheDocument()
  })
})
