import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../features/auth/AuthContext'
import { CoupleHomeSidebar } from '../CoupleHomeSidebar'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.endsWith('/api/auth/csrf/')) return Promise.resolve(jsonResponse(200, { detail: 'ok' }))
      if (url.endsWith('/api/auth/user-profile/')) {
        return Promise.resolve(jsonResponse(200, { id: 1, username: 'alice', email: '' }))
      }
      throw new Error(`Unexpected fetch to ${url}`)
    }),
  )
})

function renderSidebar(props: Partial<React.ComponentProps<typeof CoupleHomeSidebar>> = {}) {
  return render(
    <AuthProvider>
      <CoupleHomeSidebar
        isOpen={false}
        onClose={vi.fn()}
        onOpenWatch={vi.fn()}
        onOpenCompanion={vi.fn()}
        onOpenCompanionProfile={vi.fn()}
        onToggleGallery={vi.fn()}
        {...props}
      />
    </AuthProvider>,
  )
}

describe('CoupleHomeSidebar', () => {
  it('is inert/hidden from the accessibility tree while closed (isOpen=false)', () => {
    renderSidebar({ isOpen: false })

    // Not just visually hidden — `inert` removes items from the
    // accessibility tree entirely while closed, so a keyboard user can't
    // tab into a menu item that isn't visible yet.
    expect(screen.queryByRole('button', { name: 'Watch Together' })).not.toBeInTheDocument()
  })

  it('exposes every destination while open (isOpen=true)', () => {
    renderSidebar({ isOpen: true })

    expect(screen.getByRole('button', { name: 'Watch Together' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Space Companion' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Companion Profile' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Switch Room' })).toBeInTheDocument()
  })

  it('embeds the real AccountSummary — no duplicated logout logic', async () => {
    renderSidebar({ isOpen: true })

    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })

  it('invokes onOpenWatch and onClose when "Watch Together" is selected', async () => {
    const onOpenWatch = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderSidebar({ isOpen: true, onOpenWatch, onClose })

    await user.click(screen.getByRole('button', { name: 'Watch Together' }))

    expect(onOpenWatch).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('invokes onOpenCompanion and onClose when "Space Companion" is selected', async () => {
    const onOpenCompanion = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderSidebar({ isOpen: true, onOpenCompanion, onClose })

    await user.click(screen.getByRole('button', { name: 'Space Companion' }))

    expect(onOpenCompanion).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('invokes onOpenCompanionProfile and onClose when "Companion Profile" is selected', async () => {
    const onOpenCompanionProfile = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderSidebar({ isOpen: true, onOpenCompanionProfile, onClose })

    await user.click(screen.getByRole('button', { name: 'Companion Profile' }))

    expect(onOpenCompanionProfile).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('invokes onToggleGallery and onClose when "Switch Room" is selected', async () => {
    const onToggleGallery = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderSidebar({ isOpen: true, onToggleGallery, onClose })

    await user.click(screen.getByRole('button', { name: 'Switch Room' }))

    expect(onToggleGallery).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape is pressed while open', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderSidebar({ isOpen: true, onClose })

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not react to Escape while already closed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderSidebar({ isOpen: false, onClose })

    await user.keyboard('{Escape}')

    expect(onClose).not.toHaveBeenCalled()
  })
})
