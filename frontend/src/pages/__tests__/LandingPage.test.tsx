import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LandingPage } from '../LandingPage'

describe('LandingPage', () => {
  // LandingPage portals its whole subtree into `#landing-root` (see its own
  // doc comment for why) — index.html provides that node in the real app,
  // so the test environment must too, or the component has nowhere to
  // render and silently returns null.
  beforeEach(() => {
    const portalTarget = document.createElement('div')
    portalTarget.id = 'landing-root'
    document.body.appendChild(portalTarget)
  })

  afterEach(() => {
    document.getElementById('landing-root')?.remove()
  })

  it('composes every section in the approved narrative order and wires both entry callbacks', async () => {
    const onLogin = vi.fn()
    const onGetStarted = vi.fn()
    const user = userEvent.setup()
    render(<LandingPage onLogin={onLogin} onGetStarted={onGetStarted} />)

    // A representative line from each section, confirming the whole
    // narrative is present in one composed page — not exhaustive
    // per-section assertions (those live in each section's own test).
    expect(screen.getByRole('heading', { level: 1, name: /your space/i })).toBeInTheDocument()
    expect(screen.getByText(/this isn't another chat window/i)).toBeInTheDocument()
    expect(screen.getByText(/exist together, inside your space/i)).toBeInTheDocument()
    expect(screen.getByText(/watch together, from the same couch/i)).toBeInTheDocument()
    expect(screen.getByText(/play together, without leaving the room/i)).toBeInTheDocument()
    expect(screen.getByText(/explore your space/i)).toBeInTheDocument()
    expect(screen.getByText(/make it yours/i)).toBeInTheDocument()
    expect(screen.getByText(/choose your companion/i)).toBeInTheDocument()
    expect(screen.getByText('Coming to your browser')).toBeInTheDocument()
    expect(screen.getByText('Built by Uche Onwe')).toBeInTheDocument()
    expect(screen.getByText(/ready to make this our space/i)).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Log in' })[0])
    expect(onLogin).toHaveBeenCalledTimes(1)

    await user.click(screen.getAllByRole('button', { name: 'Enter Our Space' })[0])
    expect(onGetStarted).toHaveBeenCalledTimes(1)
  })
})
