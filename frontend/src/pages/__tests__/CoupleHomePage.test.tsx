import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../features/auth/AuthContext'
import { CoupleProvider } from '../../features/couples/CoupleContext'
import { CoupleHomePage } from '../CoupleHomePage'

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
      if (url.endsWith('/api/couples/couple-status/')) {
        return Promise.resolve(
          jsonResponse(200, {
            status: 'paired',
            couple: {
              id: 1,
              members: [
                { id: 1, username: 'alice', email: '' },
                { id: 2, username: 'bob', email: '' },
              ],
            },
          }),
        )
      }
      throw new Error(`Unexpected fetch to ${url}`)
    }),
  )
})

describe('CoupleHomePage', () => {
  it('exposes a working entry into Watch Together', async () => {
    const onOpenWatch = vi.fn()
    const user = userEvent.setup()

    render(
      <AuthProvider>
        <CoupleProvider>
          <CoupleHomePage onOpenWatch={onOpenWatch} />
        </CoupleProvider>
      </AuthProvider>,
    )

    const button = await screen.findByRole('button', { name: 'Start Watching' })
    await user.click(button)

    expect(onOpenWatch).toHaveBeenCalledOnce()
  })
})
