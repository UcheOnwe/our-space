import type { PlaybackStatus } from './types'

/**
 * YouTube's IFrame API has no "onSeek" event — a seek just looks like a
 * sudden jump in getCurrentTime(). This is the "simplest reliable
 * inference" approach: compare where playback SHOULD be (an anchor
 * position plus elapsed wall-clock time) against where it ACTUALLY is,
 * and treat a large enough gap as a seek. Not frame-accurate by design —
 * reliability over precision, per this slice's approved scope.
 */
export function hasDrifted(expectedSeconds: number, actualSeconds: number, thresholdSeconds = 2): boolean {
  return Math.abs(actualSeconds - expectedSeconds) > thresholdSeconds
}

/** Where playback should be right now, given an anchor position/time and whether it's playing. */
export function estimatePosition(
  anchorSeconds: number,
  anchorTimestampMs: number,
  isPlaying: boolean,
  nowMs: number = Date.now(),
): number {
  if (!isPlaying) return anchorSeconds
  const elapsedSeconds = (nowMs - anchorTimestampMs) / 1000
  return anchorSeconds + Math.max(0, elapsedSeconds)
}

interface PlaybackSnapshot {
  status: PlaybackStatus
  position: number
}

/** Decides whether a remote (server) state is different enough from local state to act on. */
export function shouldApplyRemoteState(
  local: PlaybackSnapshot,
  remote: PlaybackSnapshot,
  thresholdSeconds = 2,
): boolean {
  if (local.status !== remote.status) return true
  return hasDrifted(local.position, remote.position, thresholdSeconds)
}
