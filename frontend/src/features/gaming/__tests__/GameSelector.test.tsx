import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GameSelector } from '../GameSelector'

describe('GameSelector', () => {
  it('renders all three configured games', () => {
    render(<GameSelector onSelectGame={vi.fn()} />)
    expect(screen.getByText('8 Ball Pool Multiplayer')).toBeInTheDocument()
    expect(screen.getByText('Basketball Stars')).toBeInTheDocument()
    expect(screen.getByText('Physics Drop')).toBeInTheDocument()
  })

  it('groups 8 Ball Pool Multiplayer and Basketball Stars under Play Together, and Physics Drop under Play Solo', () => {
    render(<GameSelector onSelectGame={vi.fn()} />)

    const togetherSection = screen.getByText('Play Together').closest('section')!
    expect(togetherSection).toHaveTextContent('8 Ball Pool Multiplayer')
    expect(togetherSection).toHaveTextContent('Basketball Stars')
    expect(togetherSection).not.toHaveTextContent('Physics Drop')

    const soloSection = screen.getByText('Play Solo').closest('section')!
    expect(soloSection).toHaveTextContent('Physics Drop')
    expect(soloSection).not.toHaveTextContent('Basketball Stars')
  })

  it('calls onSelectGame with the chosen game when its Play button is clicked', () => {
    const onSelectGame = vi.fn()
    render(<GameSelector onSelectGame={onSelectGame} />)

    const basketballCard = screen.getByText('Basketball Stars').closest('div')!
    fireEvent.click(within(basketballCard).getByRole('button', { name: /Play/ }))

    expect(onSelectGame).toHaveBeenCalledTimes(1)
    expect(onSelectGame.mock.calls[0][0]).toMatchObject({ id: 'basketball-stars', name: 'Basketball Stars' })
  })
})
