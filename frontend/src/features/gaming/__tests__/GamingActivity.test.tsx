import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GamingActivity } from '../GamingActivity'

describe('GamingActivity', () => {
  it('starts on the game selector', () => {
    render(<GamingActivity />)
    expect(screen.getByText('Play Together')).toBeInTheDocument()
    expect(screen.getByText('Play Solo')).toBeInTheDocument()
  })

  it('selecting a game opens the reusable player with an iframe pointed at that game\'s launch URL', () => {
    render(<GamingActivity />)

    fireEvent.click(screen.getAllByRole('button', { name: /Play/ })[0])

    expect(screen.getByRole('button', { name: /Back to Games/ })).toBeInTheDocument()
    // GamePlayer always portals its real frame area to document.body (see
    // GamePlayer.tsx's own doc comment) — not a descendant of this
    // render's own container.
    const iframe = document.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('src')).toContain('html5gameshq.com')
  })

  it('Back to Games returns to the selector without leaving the Gaming close-up', () => {
    render(<GamingActivity />)

    fireEvent.click(screen.getAllByRole('button', { name: /Play/ })[0])
    fireEvent.click(screen.getByRole('button', { name: /Back to Games/ }))

    expect(screen.getByText('Play Together')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Back to Games/ })).not.toBeInTheDocument()
  })
})
