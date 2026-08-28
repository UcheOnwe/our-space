import { apiClient } from '../../api/client'
import type { Couple, CoupleStatusResponse, Invite } from './types'

/** The single source of truth for the caller's pairing state. */
export function fetchCoupleStatus(): Promise<CoupleStatusResponse> {
  return apiClient.get('/couples/couple-status/')
}

/** "Create Our Space" — creates the couple, membership #1, and the invite together. */
export function createCouple(): Promise<{ couple: Couple; invite: Invite }> {
  return apiClient.post('/couples/')
}

/** "Join Our Space". Codes are case-insensitive; normalized here as a client-side convenience
 * (the backend also normalizes, so this isn't the source of correctness). */
export function joinCouple(code: string): Promise<{ couple: Couple }> {
  return apiClient.post('/couples/join/', { code: code.trim().toUpperCase() })
}

/** "Cancel pairing" — backs out of a pending Create Our Space before a partner joins. */
export function cancelPendingPairing(): Promise<void> {
  return apiClient.post('/couples/cancel-pending-pairing/')
}
