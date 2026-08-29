export type PlaybackStatus = 'paused' | 'playing'

export interface WatchSessionData {
  provider: 'youtube'
  provider_video_id: string
  playback_status: PlaybackStatus
  position_seconds: number
  updated_by: string | null
  updated_at: string
}

/** Shape shared by GET watch-session-status and both POST responses. */
export interface WatchSessionResponse {
  video_loaded: boolean
  session: WatchSessionData | null
}
