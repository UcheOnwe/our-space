import { apiClient } from '../../api/client'
import type { UchemWalletData } from './types'

/** The caller's own Personal Uchem Wallet — lazily created server-side on
 * first access (see backend/uchem/services.py), so this never 404s. */
export function fetchPersonalWallet(): Promise<UchemWalletData> {
  return apiClient.get('/uchem/personal/')
}

/** The caller's Couple Uchem Wallet. Rejects with an ApiError (400) if the
 * caller isn't currently paired — there is no couple id to pass here, the
 * backend always resolves "which couple" from the authenticated caller. */
export function fetchCoupleWallet(): Promise<UchemWalletData> {
  return apiClient.get('/uchem/couple/')
}

/** DEVELOPMENT ONLY — restores the caller's Couple Wallet toward a fixed
 * 10,000-Uchem testing target using a local testing code (see
 * backend/uchem/views.py's DevRestoreCoupleWalletView, only registered
 * at all when the backend is running with DEBUG=True). Never sends an
 * amount, couple id, or username — the backend derives everything from
 * the authenticated session and the code is all that's validated.
 * Rejects with an ApiError (400) for an invalid code or an unpaired
 * caller, and with a 404-shaped ApiError if the backend isn't running in
 * development mode at all. */
export function restoreDevCoupleWallet(code: string): Promise<UchemWalletData> {
  return apiClient.post('/uchem/dev/restore/', { code })
}
