import { apiClient } from '../../api/client'
import type { LoginInput, RegisterInput, User } from './types'

/** Primes the CSRF cookie. Must resolve before any register/login/logout call. */
export function fetchCsrfCookie(): Promise<void> {
  return apiClient.get('/auth/csrf/')
}

export function registerUser(input: RegisterInput): Promise<User> {
  return apiClient.post('/auth/register/', input)
}

export function loginUser(input: LoginInput): Promise<User> {
  return apiClient.post('/auth/login/', input)
}

export function logoutUser(): Promise<void> {
  return apiClient.post('/auth/logout/')
}

export function fetchCurrentUser(): Promise<User> {
  return apiClient.get('/auth/user-profile/')
}
