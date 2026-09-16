import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../features/auth/AuthContext'
import { CoupleProvider } from '../../features/couples/CoupleContext'
import { CoupleGate } from '../CoupleGate'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function stubFetchForCoupleStatus(coupleStatus: 'none' | 'waiting') {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.endsWith('/api/auth/csrf/')) return Promise.resolve(jsonResponse(200, { detail: 'ok' }))
      if (url.endsWith('/api/auth/user-profile/')) {
        return Promise.resolve(jsonResponse(200, { id: 1, username: 'alice', email: '' }))
      }
      if (url.endsWith('/api/couples/couple-status/')) {
        const body: Record<string, unknown> = { status: coupleStatus }
        if (coupleStatus === 'waiting') body.invite = { code: 'ABC123' }
        return Promise.resolve(jsonResponse(200, body))
      }
      throw new Error(`Unexpected fetch to ${url}`)
    }),
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('CoupleGate — Companion Profile/setup are reachable regardless of pairing status', () => {
  // Proves the approved plan's locked decision #2 on the frontend wiring
  // side (backend/companions/tests/test_api.py proves the same thing
  // server-side): an authenticated user who has never paired still has a
  // way to reach Companion Profile/setup — via PrePairingLayout, not
  // nested inside any couple-status branch.
  it('offers "Companion Profile" and "Space Companion" entry points when the user has never paired (status: none)', async () => {
    stubFetchForCoupleStatus('none')
    const onOpenCompanionProfile = vi.fn()
    const onOpenCompanionSetup = vi.fn()
    const user = userEvent.setup()

    render(
      <AuthProvider>
        <CoupleProvider>
          <CoupleGate onOpenCompanionProfile={onOpenCompanionProfile} onOpenCompanionSetup={onOpenCompanionSetup} />
        </CoupleProvider>
      </AuthProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Companion Profile' }))
    expect(onOpenCompanionProfile).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Space Companion' }))
    expect(onOpenCompanionSetup).toHaveBeenCalledOnce()

    // The normal pre-pairing choice screen is still there underneath —
    // this is additive, not a replacement of it.
    expect(screen.getByRole('heading', { name: 'Our Space' })).toBeInTheDocument()
  })

  it('offers the same entry points while waiting for a partner (status: waiting)', async () => {
    stubFetchForCoupleStatus('waiting')
    const onOpenCompanionProfile = vi.fn()
    const onOpenCompanionSetup = vi.fn()
    const user = userEvent.setup()

    render(
      <AuthProvider>
        <CoupleProvider>
          <CoupleGate onOpenCompanionProfile={onOpenCompanionProfile} onOpenCompanionSetup={onOpenCompanionSetup} />
        </CoupleProvider>
      </AuthProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Companion Profile' }))
    expect(onOpenCompanionProfile).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Space Companion' }))
    expect(onOpenCompanionSetup).toHaveBeenCalledOnce()
  })
})
