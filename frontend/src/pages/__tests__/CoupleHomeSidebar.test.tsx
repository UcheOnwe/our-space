import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CoupleHomeSidebar } from '../CoupleHomeSidebar'

describe('CoupleHomeSidebar', () => {
  it('starts closed with an accessible, collapsed menu toggle', () => {
    render(<CoupleHomeSidebar onOpenWatch={vi.fn()} />)

    const toggle = screen.getByRole('button', { name: 'Open menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // Not just visually hidden — `inert` removes "Watch Together" from the
    // accessibility tree entirely while the drawer is closed, so a
    // keyboard user can't tab into a menu item that isn't visible yet.
    expect(screen.queryByRole('button', { name: 'Watch Together' })).not.toBeInTheDocument()
  })

  it('opens the drawer and exposes "Watch Together" when the hamburger is clicked', async () => {
    const user = userEvent.setup()
    render(<CoupleHomeSidebar onOpenWatch={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Watch Together' })).toBeInTheDocument()
  })

  it('invokes onOpenWatch and closes itself when "Watch Together" is selected', async () => {
    const onOpenWatch = vi.fn()
    const user = userEvent.setup()
    render(<CoupleHomeSidebar onOpenWatch={onOpenWatch} />)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('button', { name: 'Watch Together' }))

    expect(onOpenWatch).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Watch Together' })).not.toBeInTheDocument()
  })

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup()
    render(<CoupleHomeSidebar onOpenWatch={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByRole('button', { name: 'Watch Together' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: 'Watch Together' })).not.toBeInTheDocument()
  })
})
