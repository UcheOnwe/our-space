import { useState } from 'react'
import { ApiError } from '../../api/client'
import { Button } from '../../components/shared/Button'
import { Card } from '../../components/shared/Card'
import { PartnerBadge } from './PartnerBadge'
import { VideoLoadForm } from './VideoLoadForm'
import { useWatch } from './WatchContext'
import { YouTubePlayer } from './YouTubePlayer'
import type { PlaybackStatus } from './types'
import styles from './WatchTogetherScreen.module.css'

export function WatchTogetherScreen() {
  const { status, videoLoaded, session, setPlaybackState } = useWatch()
  // Gates autoplay-on-restore behind an explicit click (browsers block
  // unmuted autoplay without a fresh user gesture) — see the approved
  // Slice 3 proposal, decision 6.
  const [hasResumed, setHasResumed] = useState(false)
  const [playerError, setPlayerError] = useState<string | null>(null)

  if (status === 'loading') {
    return <p>Loading…</p>
  }

  const needsResume = session?.playback_status === 'playing' && !hasResumed

  async function handleLocalStateChange(nextStatus: PlaybackStatus, position: number) {
    try {
      await setPlaybackState(nextStatus, position)
    } catch (err) {
      setPlayerError(err instanceof ApiError ? err.message : 'Unable to sync playback. Please try again.')
    }
  }

  return (
    <div className={styles.screen}>
      <Card>
        {videoLoaded && session ? (
          <div className={styles.playerWrapper}>
            <YouTubePlayer
              videoId={session.provider_video_id}
              remoteState={
                needsResume
                  ? { status: 'paused', position: session.position_seconds }
                  : { status: session.playback_status, position: session.position_seconds }
              }
              onLocalStateChange={handleLocalStateChange}
              onError={setPlayerError}
            />
            {needsResume && (
              <div className={styles.resumeOverlay}>
                <Button onClick={() => setHasResumed(true)}>▶ Resume together</Button>
              </div>
            )}
          </div>
        ) : (
          <p className={styles.emptyState}>No video loaded yet — paste a link below to get started.</p>
        )}
      </Card>

      <PartnerBadge />

      {playerError && <p role="alert">{playerError}</p>}

      <VideoLoadForm />
    </div>
  )
}
