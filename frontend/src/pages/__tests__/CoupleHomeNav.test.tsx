import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../features/auth/AuthContext'
import { CoupleHomeNav } from '../CoupleHomeNav'

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

function renderNav(props: Partial<React.ComponentProps<typeof CoupleHomeNav>> = {}) {
  return render(
    <AuthProvider>
      <CoupleHomeNav
        onOpenWatch={vi.fn()}
        onOpenCompanion={vi.fn()}
        onOpenCompanionProfile={vi.fn()}
        isGalleryOpen={false}
        onToggleGallery={vi.fn()}
        onBrandingClick={vi.fn()}
        coupleBalance={5000}
        onBalanceChange={vi.fn()}
        {...props}
      />
    </AuthProvider>,
  )
}

describe('CoupleHomeNav', () => {
  it('shows the Cosmic Blob branding and the Couple Uchem balance', () => {
    renderNav({ coupleBalance: 2500 })

    expect(screen.getByRole('button', { name: 'Our Space' })).toBeInTheDocument()
    expect(screen.getByLabelText('Couple Uchem balance')).toHaveTextContent('2,500 Uchem')
  })

  it('shows a placeholder while the balance is still loading', () => {
    renderNav({ coupleBalance: null })

    expect(screen.getByLabelText('Couple Uchem balance')).toHaveTextContent('— Uchem')
  })

  it('clicking the branding calls onBrandingClick', async () => {
    const onBrandingClick = vi.fn()
    const user = userEvent.setup()
    renderNav({ onBrandingClick })

    await user.click(screen.getByRole('button', { name: 'Our Space' }))

    expect(onBrandingClick).toHaveBeenCalledOnce()
  })

  it('the Switch Room control reflects gallery state and calls onToggleGallery', async () => {
    const onToggleGallery = vi.fn()
    const user = userEvent.setup()
    const { rerender } = renderNav({ isGalleryOpen: false, onToggleGallery })

    const button = screen.getByRole('button', { name: 'Switch Room' })
    await user.click(button)
    expect(onToggleGallery).toHaveBeenCalledOnce()

    rerender(
      <AuthProvider>
        <CoupleHomeNav
          onOpenWatch={vi.fn()}
          onOpenCompanion={vi.fn()}
          onOpenCompanionProfile={vi.fn()}
          isGalleryOpen
          onToggleGallery={onToggleGallery}
          onBrandingClick={vi.fn()}
          coupleBalance={5000}
          onBalanceChange={vi.fn()}
        />
      </AuthProvider>,
    )
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('embeds AccountSummary directly in the persistent bar', async () => {
    renderNav()

    // Two instances exist by design — the persistent bar's own copy
    // (hidden below 700px) and the drawer's mobile-overflow copy (see
    // CoupleHomeNav.module.css's `.desktopOnly`) — both render the same
    // AccountSummary component, no duplicated logout logic.
    expect(await screen.findAllByText('alice')).toHaveLength(2)
  })

  it('the hamburger opens the existing destinations drawer', async () => {
    const user = userEvent.setup()
    renderNav()

    expect(screen.queryByRole('button', { name: 'Watch Together' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByRole('button', { name: 'Watch Together' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Space Companion' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Companion Profile' })).toBeInTheDocument()
  })

  it('drawer "Switch Room" also calls onToggleGallery', async () => {
    const onToggleGallery = vi.fn()
    const user = userEvent.setup()
    renderNav({ onToggleGallery })

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    // Two "Switch Room" buttons now exist (persistent bar + drawer) —
    // the drawer's own copy is the last one rendered.
    const switchRoomButtons = screen.getAllByRole('button', { name: 'Switch Room' })
    await user.click(switchRoomButtons[switchRoomButtons.length - 1])

    expect(onToggleGallery).toHaveBeenCalledOnce()
  })

  it('the "+" button opens the Add Uchem panel', async () => {
    const user = userEvent.setup()
    renderNav()

    expect(screen.queryByRole('dialog', { name: 'Add Uchem' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add Uchem' }))

    expect(screen.getByRole('dialog', { name: 'Add Uchem' })).toBeInTheDocument()
  })

  it('closing the Add Uchem panel removes it', async () => {
    const user = userEvent.setup()
    renderNav()

    await user.click(screen.getByRole('button', { name: 'Add Uchem' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog', { name: 'Add Uchem' })).not.toBeInTheDocument()
  })
})
