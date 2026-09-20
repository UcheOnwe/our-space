import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RoomGallery } from '../RoomGallery'
import type { RoomGalleryItem } from '../../rooms/types'

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
