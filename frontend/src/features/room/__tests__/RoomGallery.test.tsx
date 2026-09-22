import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RoomGallery } from '../RoomGallery'
import type { RoomGalleryItem } from '../../rooms/types'
import galleryStyles from '../RoomGallery.module.css'

const ROOMS: RoomGalleryItem[] = [
  { room_type: 'couple_home', display_name: 'Couple Home', order: 0, price: 0, is_owned: true, is_active: true },
  { room_type: 'cozy_loft', display_name: 'Cozy Loft', order: 1, price: 2500, is_owned: false, is_active: false },
]

describe('RoomGallery', () => {
  it('shows the focused room name, and a position dot per catalog room', () => {
    render(
      <RoomGallery rooms={ROOMS} centeredIndex={0} onCenterChange={vi.fn()} onConfirm={vi.fn()} isSubmitting={false} error={null} />,
    )

    expect(screen.getByText('Couple Home')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Couple Home' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Cozy Loft' })).toBeInTheDocument()
  })

  it('shows the locked focused room price, and the active status for an owned+active one', () => {
    const { rerender } = render(
      <RoomGallery rooms={ROOMS} centeredIndex={0} onCenterChange={vi.fn()} onConfirm={vi.fn()} isSubmitting={false} error={null} />,
    )
    expect(screen.getByText('Active')).toBeInTheDocument()

    rerender(
      <RoomGallery rooms={ROOMS} centeredIndex={1} onCenterChange={vi.fn()} onConfirm={vi.fn()} isSubmitting={false} error={null} />,
    )
    // Price legitimately appears twice for a locked room — the status
    // badge and the confirm button both show it.
    expect(screen.getAllByText(/2,500 Uchem/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: /Unlock for 2,500 Uchem/ })).toBeInTheDocument()
  })

  it('clicking a dot re-centers without confirming', async () => {
    const onCenterChange = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <RoomGallery rooms={ROOMS} centeredIndex={0} onCenterChange={onCenterChange} onConfirm={onConfirm} isSubmitting={false} error={null} />,
    )

    await user.click(screen.getByRole('button', { name: 'Show Cozy Loft' }))

    expect(onCenterChange).toHaveBeenCalledWith(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('prev/next buttons move the centered index, clamped at the catalog bounds', async () => {
    const onCenterChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <RoomGallery rooms={ROOMS} centeredIndex={0} onCenterChange={onCenterChange} onConfirm={vi.fn()} isSubmitting={false} error={null} />,
    )

    expect(screen.getByRole('button', { name: 'Previous room' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next room' }))
    expect(onCenterChange).toHaveBeenCalledWith(1)

    rerender(
      <RoomGallery rooms={ROOMS} centeredIndex={1} onCenterChange={onCenterChange} onConfirm={vi.fn()} isSubmitting={false} error={null} />,
    )
    expect(screen.getByRole('button', { name: 'Next room' })).toBeDisabled()
  })

  it('confirming the focused locked room calls onConfirm with that room', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <RoomGallery rooms={ROOMS} centeredIndex={1} onCenterChange={vi.fn()} onConfirm={onConfirm} isSubmitting={false} error={null} />,
    )

    await user.click(screen.getByRole('button', { name: /Unlock for 2,500 Uchem/ }))

    expect(onConfirm).toHaveBeenCalledWith(ROOMS[1])
  })

  it('disables the confirm button for the already-active room', () => {
    render(
      <RoomGallery rooms={ROOMS} centeredIndex={0} onCenterChange={vi.fn()} onConfirm={vi.fn()} isSubmitting={false} error={null} />,
    )

    expect(screen.getByRole('button', { name: 'Current room' })).toBeDisabled()
  })

  it('overlays the nav/confirm control cluster directly on the room artwork, not in a separate panel', () => {
    const { container } = render(
      <RoomGallery rooms={ROOMS} centeredIndex={0} onCenterChange={vi.fn()} onConfirm={vi.fn()} isSubmitting={false} error={null} />,
    )

    const gallery = container.querySelector(`.${galleryStyles.gallery}`)!
    const overlay = container.querySelector(`.${galleryStyles.overlay}`)!
    // The controls overlay the artwork — nested inside the same box, not
    // a separate block below it (that was the rejected "black panel"
    // version). Persistence across page scroll comes from .gallery's own
    // `position: sticky` (see RoomGallery.module.css), not from splitting
    // the controls out into their own sticky sibling.
    expect(gallery.contains(overlay)).toBe(true)
    expect(overlay.contains(screen.getByRole('button', { name: 'Previous room' }))).toBe(true)
    // jsdom doesn't apply imported stylesheet rules for getComputedStyle
    // (no real CSS engine) — .gallery's own class is where
    // `position: sticky` actually lives.
    expect(gallery.className).toBe(galleryStyles.gallery)
  })

  it('only the focused hero slide carries .heroSlideFocused (the class that restores pointer-events: auto) — regression test for the real-device bug where the focused preview was silently unclickable/undraggable', () => {
    // jsdom doesn't apply imported stylesheet rules (see the test above),
    // so this pins the fix at the class-membership level: .heroSlide
    // itself is pointer-events: none (it covers every room's preview,
    // stacked, only one visible at a time), and .heroSlideFocused is the
    // ONLY thing that restores pointer-events: auto for the one actually
    // on screen. Missing that restoration (the real bug this found) meant
    // NOTHING inside the visible preview — RoomPosterPreview's pan/pinch,
    // Cozy Loft's/After Hours' own live preview panning, even the confirm
    // button — could ever receive a pointer event, regardless of any other
    // pointer-events fix further down the tree.
    const { container } = render(
      <RoomGallery rooms={ROOMS} centeredIndex={0} onCenterChange={vi.fn()} onConfirm={vi.fn()} isSubmitting={false} error={null} />,
    )

    const slides = container.querySelectorAll(`.${galleryStyles.heroSlide}`)
    expect(slides).toHaveLength(2)
    expect(slides[0].className).toContain(galleryStyles.heroSlideFocused)
    expect(slides[1].className).not.toContain(galleryStyles.heroSlideFocused)
  })

  it('shows a passed-in error message', () => {
    render(
      <RoomGallery
        rooms={ROOMS}
        centeredIndex={1}
        onCenterChange={vi.fn()}
        onConfirm={vi.fn()}
        isSubmitting={false}
        error="This Couple Wallet does not have enough Uchem for this operation."
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('does not have enough Uchem')
  })
})
