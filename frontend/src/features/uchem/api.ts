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
