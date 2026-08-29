import { apiClient } from '../../api/client'
import type { PlaybackStatus, WatchSessionResponse } from './types'

/** The single source of truth for the couple's Shared Watch state. */
export function fetchWatchSessionStatus(): Promise<WatchSessionResponse> {
  return apiClient.get('/watch/watch-session-status/')
}

/** Sets/replaces the couple's active video. Either partner may call this at any time. */
export function loadVideo(url: string): Promise<WatchSessionResponse> {
  return apiClient.post('/watch/load-video/', { url })
}

/** Covers play, pause, and seek alike — the client always sends the resulting intended state. */
export function setPlaybackState(
  playbackStatus: PlaybackStatus,
  positionSeconds: number,
): Promise<WatchSessionResponse> {
  return apiClient.post('/watch/set-playback-state/', {
    status: playbackStatus,
    position_seconds: positionSeconds,
  })
}
