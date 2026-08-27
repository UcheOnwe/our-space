export interface User {
  id: number
  username: string
  email: string
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface RegisterInput {
  username: string
  email?: string
  password: string
}

export interface LoginInput {
  username: string
  password: string
}
