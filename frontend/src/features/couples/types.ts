export interface CoupleMember {
  id: number
  username: string
  email: string
}

export interface Couple {
  id: number
  members: CoupleMember[]
}

export interface Invite {
  code: string
}

export type CoupleStatus = 'loading' | 'none' | 'waiting' | 'paired'

/** Shape of GET /api/couples/couple-status/. */
export interface CoupleStatusResponse {
  status: 'none' | 'waiting' | 'paired'
  couple?: Couple
  invite?: Invite
}
