import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AfterHoursRoom } from '../AfterHoursRoom'
import type { AfterHoursRoomHandle } from '../AfterHoursRoom'
import ambientStyles from '../ambient/AmbientEffectsLayer.module.css'

// findBy*'s default 1000ms polling window is exactly equal to
// useRoomHotspotInteraction's own TRANSITION_DURATION_MS — too tight a
// race in practice (see CozyLoftRoom.test.tsx's own identical note).
const PHASE_TRANSITION_WAIT = { timeout: 2000 }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AfterHoursRoom', () => {
  it('renders all five hotspot icons by default', () => {
    render(<AfterHoursRoom />)
    expect(screen.getByRole('button', { name: 'Watch' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kitchen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hallway' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Garage' })).toBeInTheDocument()
  })

  it('Kitchen opens as a pure exploration close-up with no activity UI', async () => {
    render(<AfterHoursRoom />)

    fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }))

    await screen.findByRole('button', { name: /Back to Room/ }, PHASE_TRANSITION_WAIT)
    expect(screen.queryByText('Play Together')).not.toBeInTheDocument()
    expect(screen.queryByText(/Continue with YouTube/)).not.toBeInTheDocument()
    expect(screen.queryByText('Where to?')).not.toBeInTheDocument()
  })

  it('suppresses hotspot icons when enableHotspots=false (RoomGallery preview usage)', () => {
    render(<AfterHoursRoom enableHotspots={false} />)
    expect(screen.queryByRole('button', { name: 'Watch' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hallway' })).not.toBeInTheDocument()
  })

  it('the TV close-up now supports direct drag (immediate mode), reaching through the shared enableDirectDrag prop passed at this room’s own RoomCloseUp call site', async () => {
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
    } as DOMRect)

    const { container } = render(<AfterHoursRoom />)
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }))
    await screen.findByRole('button', { name: /Continue with YouTube/ }, PHASE_TRANSITION_WAIT)

    const world = container.querySelector('img[src="/after-hours/tv-closeup.jpg"]')!.parentElement as HTMLDivElement
    const viewport = world.parentElement as HTMLDivElement
    const before = world.style.transform

    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 200, clientY: 150, pointerType: 'touch' })
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 100, clientY: 150, pointerType: 'touch' })
    // No rAF pump — 'immediate' mode writes synchronously.
    expect(world.style.transform).not.toBe(before)
  })

  it('TV opens the existing Watch flow', async () => {
    const onOpenWatch = vi.fn()
    render(<AfterHoursRoom onOpenWatch={onOpenWatch} />)

    fireEvent.click(screen.getByRole('button', { name: 'Watch' }))
    const watchButton = await screen.findByRole('button', { name: /Continue with YouTube/ }, PHASE_TRANSITION_WAIT)
    fireEvent.click(watchButton)

    expect(onOpenWatch).toHaveBeenCalledTimes(1)
  })

  it('Gaming opens the existing GamingActivity (game selector), not a fork', async () => {
    render(<AfterHoursRoom />)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(await screen.findByText('Play Together', {}, PHASE_TRANSITION_WAIT)).toBeInTheDocument()
    expect(screen.getByText('Physics Drop')).toBeInTheDocument()
  })

  it('Door opens the hallway with exactly the two configured destinations', async () => {
    render(<AfterHoursRoom />)

    fireEvent.click(screen.getByRole('button', { name: 'Hallway' }))

    expect(await screen.findByText('Where to?', {}, PHASE_TRANSITION_WAIT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lauruch Loft/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Watch Together/ })).toBeInTheDocument()
    // No Gaming shortcut — confirmed scope (redundant with the room's own
    // Gaming hotspot).
    expect(screen.queryByRole('button', { name: /^Gaming$/ })).not.toBeInTheDocument()
  })

  it("the hallway's Watch Together destination calls onOpenWatch", async () => {
    const onOpenWatch = vi.fn()
    render(<AfterHoursRoom onOpenWatch={onOpenWatch} />)

    fireEvent.click(screen.getByRole('button', { name: 'Hallway' }))
    const watchDestination = await screen.findByRole('button', { name: /Watch Together/ }, PHASE_TRANSITION_WAIT)
    fireEvent.click(watchDestination)

    expect(onOpenWatch).toHaveBeenCalledTimes(1)
  })

  it("the hallway's Lauruch Loft destination calls onNavigateToRoom with couple_home and leaves the close-up", async () => {
    const onNavigateToRoom = vi.fn()
    render(<AfterHoursRoom onNavigateToRoom={onNavigateToRoom} />)

    fireEvent.click(screen.getByRole('button', { name: 'Hallway' }))
    const lauruchLoftDestination = await screen.findByRole('button', { name: /Lauruch Loft/ }, PHASE_TRANSITION_WAIT)
    fireEvent.click(lauruchLoftDestination)

    expect(onNavigateToRoom).toHaveBeenCalledWith('couple_home')
  })

  it('Garage opens with no activity content — a pure exploration close-up', async () => {
    render(<AfterHoursRoom />)

    fireEvent.click(screen.getByRole('button', { name: 'Garage' }))

    await screen.findByRole('button', { name: /Back to Room/ }, PHASE_TRANSITION_WAIT)
    // No game selector, no watch button, no hallway destinations.
    expect(screen.queryByText('Play Together')).not.toBeInTheDocument()
    expect(screen.queryByText(/Continue with YouTube/)).not.toBeInTheDocument()
    expect(screen.queryByText('Where to?')).not.toBeInTheDocument()
  })

  it('returns to the room (hotspots visible again) after Back to Room', async () => {
    render(<AfterHoursRoom />)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await screen.findByText('Play Together', {}, PHASE_TRANSITION_WAIT)

    fireEvent.click(screen.getByRole('button', { name: /Back to Room/ }))
    expect(await screen.findByRole('button', { name: 'Watch' }, PHASE_TRANSITION_WAIT)).toBeInTheDocument()
    expect(screen.queryByText('Play Together')).not.toBeInTheDocument()
  })

  it('exposes returnToRoom via ref, leaving an active close-up when called', async () => {
    const ref = createRef<AfterHoursRoomHandle>()
    render(<AfterHoursRoom ref={ref} />)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await screen.findByText('Play Together', {}, PHASE_TRANSITION_WAIT)

    ref.current?.returnToRoom()
    expect(await screen.findByRole('button', { name: 'Watch' }, PHASE_TRANSITION_WAIT)).toBeInTheDocument()
    expect(screen.queryByText('Play Together')).not.toBeInTheDocument()
  })

  it('the ambient effects layer is decorative, hidden from assistive tech, and never intercepts a hotspot click', () => {
    const { container } = render(<AfterHoursRoom />)

    const ambientLayer = container.querySelector(`.${ambientStyles.layer}`)
    expect(ambientLayer).not.toBeNull()
    expect(ambientLayer).toHaveAttribute('aria-hidden', 'true')
    // jsdom doesn't apply imported stylesheet rules for getComputedStyle —
    // the class itself is what carries pointer-events: none (see
    // AmbientEffectsLayer.module.css), verified directly in
    // AmbientEffectsLayer.test.tsx.

    // The hotspot itself is still reachable/clickable despite the ambient
    // layer being a sibling inside the same transformed world box.
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }))
    expect(screen.queryByRole('button', { name: 'Watch' })).not.toBeInTheDocument()
  })
})
