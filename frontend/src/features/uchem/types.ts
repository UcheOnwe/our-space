/** The shape returned by both GET /api/uchem/personal/ and
 * GET /api/uchem/couple/ — matches uchem.serializers.PersonalWalletSerializer
 * / CoupleWalletSerializer field-for-field. Personal and couple wallets
 * share this same shape but are always fetched/held separately — one is
 * never derived from the other. */
export interface UchemWalletData {
  balance: number
  updated_at: string
}
