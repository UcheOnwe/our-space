import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchCsrfCookie, fetchCurrentUser, loginUser, logoutUser, registerUser } from './api'
import type { AuthStatus, LoginInput, RegisterInput, User } from './types'

interface AuthState {
  status: AuthStatus
  user: User | null
}

interface AuthContextValue extends AuthState {
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null })

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      // Priming the CSRF cookie must happen before any unsafe request (login,
      // register, logout) can succeed, so it runs unconditionally on load,
      // independent of whether the user turns out to already be signed in.
      await fetchCsrfCookie().catch(() => {
        // Non-fatal here: if the backend is unreachable, the /me/ call below
        // will fail too and the user lands on the (accurate) signed-out view.
      })

      try {
        const user = await fetchCurrentUser()
        if (!cancelled) setState({ status: 'authenticated', user })
      } catch {
        if (!cancelled) setState({ status: 'unauthenticated', user: null })
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  async function login(input: LoginInput) {
    await loginUser(input)
    // Re-fetch the user profile rather than trusting the login response
    // body, so the frontend's authenticated state reflects what the
    // session actually is.
    const user = await fetchCurrentUser()
    setState({ status: 'authenticated', user })
  }

  async function register(input: RegisterInput) {
    await registerUser(input)
    const user = await fetchCurrentUser()
    setState({ status: 'authenticated', user })
  }

  async function logout() {
    try {
      await logoutUser()
    } finally {
      // Clear local state even if the request failed (e.g. network error) —
      // leaving the UI stuck showing "authenticated" after the user asked to
      // log out is worse than a rare stale-session edge case in this MVP.
      setState({ status: 'unauthenticated', user: null })
    }
  }

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
