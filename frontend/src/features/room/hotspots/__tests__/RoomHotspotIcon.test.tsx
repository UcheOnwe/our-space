import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoomHotspotIcon } from '../RoomHotspotIcon'
import type { RoomHotspot } from '../types'

const HOTSPOT: RoomHotspot = {
  id: 'tv',
  label: 'Watch',
  icon: '📺',
  position: { xPercent: 24, yPercent: 42 },
  closeUpSrc: '/cozy-loft/tv-closeup.mp4',
}

describe('RoomHotspotIcon', () => {
  it('renders an accessibly-labelled, positioned button', () => {
    render(<RoomHotspotIcon hotspot={HOTSPOT} onActivate={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Watch' })
    expect(button).toHaveStyle({ left: '24%', top: '42%' })
  })

  it('calls onActivate with the hotspot id when clicked', () => {
    const onActivate = vi.fn()
    render(<RoomHotspotIcon hotspot={HOTSPOT} onActivate={onActivate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Watch' }))
    expect(onActivate).toHaveBeenCalledWith('tv')
  })
})
