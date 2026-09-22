import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PresenceExclusionZoneContext } from '../../presence/exclusionZone'
import { GamePlayer } from '../GamePlayer'
import { GAME_CATALOG } from '../gameCatalog'

const BASKETBALL_STARS = GAME_CATALOG.find((game) => game.id === 'basketball-stars')!
const PHYSICS_DROP = GAME_CATALOG.find((game) => game.id === 'physics-drop')!

// The real frame area/<iframe> is always portaled to document.body (see
// GamePlayer.tsx's own doc comment on why) — RTL's own render `container`
// only ever holds the invisible anchor placeholder now, so every query
// below goes through `document`/`screen` (which already searches the
// whole document) rather than the render container.

describe('GamePlayer', () => {
  it('points the iframe at the correct provider launch URL, with an accessible title and only the permissions the game needs', () => {
    render(<GamePlayer game={BASKETBALL_STARS} onBackToGames={vi.fn()} />)

    const iframe = document.querySelector('iframe')!
    expect(iframe).toHaveAttribute('src', 'https://html5gameshq.com/iframed/basketball-stars')
    expect(iframe).toHaveAttribute('title', 'Basketball Stars (embedded game)')
    // Only fullscreen (for the game's own in-game fullscreen button) — no
    // camera/mic/geolocation/payment or other unrelated permissions.
    expect(iframe).toHaveAttribute('allow', 'fullscreen')
  })

  it('shows a loading state before the iframe reports it has loaded', () => {
    render(<GamePlayer game={PHYSICS_DROP} onBackToGames={vi.fn()} />)
    expect(screen.getByText(/Loading Physics Drop/)).toBeInTheDocument()
  })

  it('clears the loading state once the iframe fires its load event', () => {
    render(<GamePlayer game={PHYSICS_DROP} onBackToGames={vi.fn()} />)
    fireEvent.load(document.querySelector('iframe')!)
    expect(screen.queryByText(/Loading Physics Drop/)).not.toBeInTheDocument()
  })

  it('calls onBackToGames when the Back to Games control is clicked', () => {
    const onBackToGames = vi.fn()
    render(<GamePlayer game={PHYSICS_DROP} onBackToGames={onBackToGames} />)

    fireEvent.click(screen.getByRole('button', { name: /Back to Games/ }))
    expect(onBackToGames).toHaveBeenCalledTimes(1)
  })

  it("renders the provider's required attribution link when the game specifies one", () => {
    render(<GamePlayer game={BASKETBALL_STARS} onBackToGames={vi.fn()} />)
    const link = screen.getByRole('link', { name: /More Games at HTML5GamesHQ/ })
    expect(link).toHaveAttribute('href', 'https://html5gameshq.com/?r=embed-ref')
  })

  it('renders no attribution link for a game that does not specify one', () => {
    render(<GamePlayer game={PHYSICS_DROP} onBackToGames={vi.fn()} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('registers its (portaled) frame area as a presence exclusion zone, and unregisters it on unmount', () => {
    const register = vi.fn()
    const { unmount } = render(
      <PresenceExclusionZoneContext.Provider value={register}>
        <GamePlayer game={PHYSICS_DROP} onBackToGames={vi.fn()} />
      </PresenceExclusionZoneContext.Provider>,
    )

    const frameArea = document.querySelector('iframe')!.parentElement
    expect(register).toHaveBeenCalledWith(frameArea)

    unmount()
    expect(register).toHaveBeenLastCalledWith(null)
  })

  describe('environment/expanded presentation modes', () => {
    it('defaults to environment (embedded) mode, with an Expand control', () => {
      render(<GamePlayer game={PHYSICS_DROP} onBackToGames={vi.fn()} />)
      expect(screen.getByRole('button', { name: /Expand/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument()
    })

    it('keeps the exact same iframe DOM node mounted across Expand and Restore — never remounted/reloaded', () => {
      render(<GamePlayer game={PHYSICS_DROP} onBackToGames={vi.fn()} />)
      const iframeBefore = document.querySelector('iframe')
      expect(iframeBefore).not.toBeNull()

      fireEvent.click(screen.getByRole('button', { name: /Expand/ }))
      const iframeWhileExpanded = document.querySelector('iframe')
      expect(iframeWhileExpanded).toBe(iframeBefore)

      fireEvent.click(screen.getByRole('button', { name: /Restore/ }))
      const iframeAfterRestore = document.querySelector('iframe')
      expect(iframeAfterRestore).toBe(iframeBefore)
    })

    it('Expand switches to a Restore control and a Back to Games control, without losing loaded state', () => {
      render(<GamePlayer game={PHYSICS_DROP} onBackToGames={vi.fn()} />)
      fireEvent.load(document.querySelector('iframe')!)

      fireEvent.click(screen.getByRole('button', { name: /Expand/ }))

      expect(screen.getByRole('button', { name: /Restore/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Back to Games/ })).toBeInTheDocument()
      // Loading text never reappears — the iframe's own load state persisted.
      expect(screen.queryByText(/Loading Physics Drop/)).not.toBeInTheDocument()
    })

    it('exactly one Back to Games control exists in expanded mode — no redundant hidden-but-focusable duplicate', () => {
      render(<GamePlayer game={PHYSICS_DROP} onBackToGames={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /Expand/ }))

      expect(screen.getAllByRole('button', { name: /Back to Games/ })).toHaveLength(1)
    })

    it('Restore returns to environment mode', () => {
      render(<GamePlayer game={PHYSICS_DROP} onBackToGames={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /Expand/ }))

      fireEvent.click(screen.getByRole('button', { name: /Restore/ }))

      expect(screen.getByRole('button', { name: /Expand/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument()
    })

    it('Back to Games works from expanded mode too', () => {
      const onBackToGames = vi.fn()
      render(<GamePlayer game={PHYSICS_DROP} onBackToGames={onBackToGames} />)
      fireEvent.click(screen.getByRole('button', { name: /Expand/ }))

      fireEvent.click(screen.getByRole('button', { name: /Back to Games/ }))

      expect(onBackToGames).toHaveBeenCalledTimes(1)
    })
  })
})
