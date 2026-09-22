import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { RefObject } from 'react'
import { GamingActivity } from '../gaming/GamingActivity'
import { AmbientVideo } from './AmbientVideo'
import { ROOM_WORLD_HEIGHT, ROOM_WORLD_WIDTH } from './constants'
import { RoomCloseUp } from './hotspots/RoomCloseUp'
import { RoomHotspotIcon } from './hotspots/RoomHotspotIcon'
import { useRoomHotspotInteraction } from './hotspots/useRoomHotspotInteraction'
import type { RoomHotspot } from './hotspots/types'
import { useRoomCameraGestures } from './useRoomCameraGestures'
import styles from './CozyLoftRoom.module.css'

// This is an UNCHANGED RUNTIME COPY of art-source/cozyLoftroom/
// Main_room_lights_off.mp4, not an optimized encode — inspected directly
// (no ffmpeg/ffprobe available on this machine, so via a small
// dependency-free MP4-box parser plus direct playback review in-browser).
//
// DELIBERATELY the "lights off" video, not "lights on": the lights-on
// master has a continuous generated camera push-in that resets abruptly
// on every ~1.94s loop, producing a visible shake/pulse — confirmed by
// stepping through both videos frame-by-frame. The lights-off master's
// camera is genuinely locked (checked start/middle/end of its ~2.09s
// duration — identical framing throughout), so it loops with no
// perceptible jump. This makes the room's V1 default a night/lights-off
// presentation with no working light switch yet — an accepted tradeoff,
// not an oversight. `Main_room_lights_on.mp4` stays in art-source/ for a
// future regeneration with a properly locked camera, when the actual
// lighting interaction is built.
const VIDEO_SRC = '/cozy-loft/main-room-lights-off.mp4'
const VIDEO_POSTER = '/cozy-loft/main-room-poster.jpg'

// The "Good Games Better Together" neon wall sign near the upper-right is
// present (glitchy/illegible) from t=0 onward, but resolves into a fully
// clear, sharply-legible render specifically from ~1.946s to the clip's
// ~2.091s end (confirmed via direct frame-by-frame browser playback
// review of this exact, unchanged file). That's a genuinely TEMPORAL
// problem, not a spatial one baked in throughout — the sign itself is
// acceptable ambient decor while glitchy; it's only the late "AI-clean"
// resolution that reads as an artifact. Since no lossless trim tool
// exists on this machine (checked again: no ffmpeg/ffprobe/mp4box, only
// ffmpeg.dll bundled inside unrelated GUI apps), the video file itself is
// left byte-for-byte unchanged. Instead, playback is looped a little
// early — the video never actually reaches the clear segment before
// jumping back to 0 — which fully prevents the artifact from ever being
// shown, with zero risk to the source file. 1.8s leaves a safety margin
// ahead of the 1.946s onset for timeupdate's non-guaranteed firing
// interval.
const LOOP_RESET_BEFORE_SECONDS = 1.8

const HOTSPOTS: RoomHotspot[] = [
  {
    id: 'tv',
    label: 'Watch',
    icon: '📺',
    position: { xPercent: 24, yPercent: 42 },
    closeUpSrc: '/cozy-loft/tv-closeup.mp4',
  },
  {
    id: 'gaming',
    label: 'Play',
    icon: '🎮',
    position: { xPercent: 76, yPercent: 48 },
    closeUpSrc: '/cozy-loft/gaming-closeup.mp4',
  },
]

const CLOSEUP_POSTERS: Record<string, string> = {
  tv: '/cozy-loft/tv-closeup-poster.jpg',
  gaming: '/cozy-loft/gaming-closeup-poster.jpg',
}

// How much of a hotspot's own world position to bias the zoom's
// transform-origin toward — 1 would zoom exactly centered on the
// hotspot (i.e. right at its physical location), 0 would ignore it
// entirely and always zoom on the room's dead center. A fraction keeps
// this a "safe/clamped" hint of direction (per the approved plan) rather
// than a full re-aim, so the effect never depends on exactly where the
// user had panned/zoomed to before clicking.
const ACTIVITY_ORIGIN_BIAS = 0.4

function biasedOrigin(percent: number): number {
  return 50 + (percent - 50) * ACTIVITY_ORIGIN_BIAS
}

export interface CozyLoftRoomHandle {
  /** Leaves whatever hotspot close-up is active, back to the plain room —
   * a no-op if already there (mid-transition included). This is what lets
   * CoupleHomeNav's branding click work as a universal "return to my
   * active room" action (see RoomExperience.tsx) without RoomExperience
   * needing to know anything about hotspots/close-ups itself. */
  returnToRoom: () => void
}

interface CozyLoftRoomProps {
  /** Forwarded straight through to the TV close-up's "Continue with
   * YouTube" action — the exact same callback RoomCanvas's own TV
   * interaction already uses (CoupleGate.tsx swaps to the full
   * WatchTogetherPage). The hotspot/close-up layer only decides WHEN to
   * reveal that action; it doesn't rebuild or re-wire Watch Together
   * itself. Optional since passive preview contexts never call it. */
  onOpenWatch?: () => void
  /** false for RoomGallery's passive browsing preview — suppresses the
   * hotspot icons and the ability to enter a close-up (browsing a room
   * you may not even own yet shouldn't be able to trigger one), but pan
   * is INTENTIONALLY still available either way: someone deciding
   * whether to spend Uchem on this room needs to be able to inspect all
   * of it first, including the far side the preview's own crop hides on
   * mobile. Defaults to true for the live room. */
  enableHotspots?: boolean
}

/**
 * Cozy Loft's full-room experience — "the video owns the environment, our
 * code owns the interaction." Unlike RoomCanvas (a hand-built PixiJS
 * scene), this room's entire environmental animation, lighting, and
 * ambience comes from a single generated video loop; nothing here
 * recreates that with CSS/Pixi/cutout layers.
 *
 * On mobile, the video is rendered inside a `.world` box sized/positioned
 * by useRoomCameraGestures (one-finger pan, two-finger pinch-zoom, the
 * exact camera math RoomCanvas.tsx already proved out for Couple Home —
 * see that hook's own doc comment, including why it's now `translateX/Y`
 * rather than a raw pan offset) rather than relying on CSS `object-fit:
 * cover`'s fixed, non-interactive center-crop. The hotspot icons live
 * INSIDE the same `.world` box, positioned by the same percentage
 * coordinates as before — since they share one transformed coordinate
 * system with the video, panning/zooming carries them along
 * automatically; there's no separate position-syncing code to keep them
 * "attached" to the TV/gaming setup.
 *
 * Reused as-is for TWO purposes: the live full-screen room (RoomExperience),
 * and the gallery's own hero preview for Cozy Loft while browsing
 * (RoomGallery, `enableHotspots={false}`) — one bounded-camera
 * implementation for both, per the approved plan, not two competing ones.
 *
 * Hotspot/close-up interaction (TV, Gaming) is layered on top via the
 * reusable `hotspots/` module — see useRoomHotspotInteraction for the
 * room/entering/closeup/leaving state machine this drives. Entering a
 * hotspot plays a scale+blur "activity transition" EFFECT on a nested
 * `.activityEffect` wrapper (transform-origin biased toward that
 * hotspot's own position) — deliberately NOT a scripted move of the
 * user's own pan/zoom camera. An earlier version tried to compute an
 * exact destination pan/scale to "fly to" the hotspot; that's both
 * unnecessary (the illusion only needs the room to visibly grow toward
 * the viewer, not literally simulate flying to a coordinate) and risky
 * (any error in that math — real device testing found exactly one —
 * visibly launches the room off-screen, exposing background). Scaling an
 * already-viewport-covering box up from ANY transform-origin can never
 * expose empty space, by construction, which is what makes this approach
 * safe regardless of where the user had panned/zoomed to.
 */
export const CozyLoftRoom = forwardRef<CozyLoftRoomHandle, CozyLoftRoomProps>(function CozyLoftRoom(
  { onOpenWatch = () => {}, enableHotspots = true },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { phase, enterHotspot, leaveHotspot } = useRoomHotspotInteraction()
  // Pan/zoom works regardless of enableHotspots (RoomGallery's preview
  // wants it too — see this component's own doc comment) — only paused
  // mid hotspot-transition/close-up, where dragging the backdrop room
  // doesn't mean anything (it's covered by the close-up anyway).
  const { camera, handlers } = useRoomCameraGestures(wrapperRef, phase.status === 'room')

  useImperativeHandle(ref, () => ({
    returnToRoom: () => leaveHotspot(),
  }))

  useVideoLoopGuard(videoRef)

  const activeHotspot = phase.status === 'room' ? undefined : HOTSPOTS.find((h) => h.id === phase.hotspotId)
  const showCloseUp = phase.status === 'closeup' || phase.status === 'leaving'
  // Mounted only while entering — its one job is to get the destination
  // video's fetch/decode started early; once the real, visible
  // RoomCloseUp mounts at `closeup`, this becomes redundant (that element
  // takes over playback) and unmounts.
  const showPreload = phase.status === 'entering'
  const effectActive = phase.status !== 'room'

  return (
    <div ref={wrapperRef} className={styles.wrapper} {...handlers}>
      {/* The pannable/zoomable room world — video + hotspots share this
          ONE transformed box (see useRoomCameraGestures), so they always
          move/scale together. Stays mounted and fully opaque through
          every hotspot phase (only .activityEffect's transform changes)
          so there's always a solid layer behind the close-up crossfade —
          never a blank/white frame. */}
      <div
        className={styles.world}
        style={{
          width: ROOM_WORLD_WIDTH,
          height: ROOM_WORLD_HEIGHT,
          transform: `translate(${camera.translateX}px, ${camera.translateY}px) scale(${camera.scale})`,
        }}
      >
        {/* The "entering an activity" visual effect — a scale+blur on
            this nested layer only, never the outer .world transform
            above (which stays exactly at the user's own pan/zoom the
            whole time). transform-origin is set per-hotspot (a damped
            bias — see ACTIVITY_ORIGIN_BIAS) so the growth reads as
            "toward that object," not just a generic center-zoom. */}
        <div
          className={`${styles.activityEffect} ${effectActive ? styles.activityEffectActive : ''}`}
          style={
            activeHotspot
              ? {
                  transformOrigin: `${biasedOrigin(activeHotspot.position.xPercent)}% ${biasedOrigin(activeHotspot.position.yPercent)}%`,
                }
              : undefined
          }
        >
          <AmbientVideo ref={videoRef} className={styles.video} src={VIDEO_SRC} posterSrc={VIDEO_POSTER} />

          {enableHotspots &&
            phase.status === 'room' &&
            HOTSPOTS.map((hotspot) => (
              <RoomHotspotIcon key={hotspot.id} hotspot={hotspot} onActivate={enterHotspot} />
            ))}
        </div>
      </div>

      {showPreload && activeHotspot && (
        <AmbientVideo
          key={activeHotspot.id}
          className={styles.preloadVideo}
          src={activeHotspot.closeUpSrc}
          posterSrc={CLOSEUP_POSTERS[activeHotspot.id]}
        />
      )}

      {showCloseUp && activeHotspot && (
        <RoomCloseUp
          videoSrc={activeHotspot.closeUpSrc}
          posterSrc={CLOSEUP_POSTERS[activeHotspot.id]}
          label={activeHotspot.label}
          onBack={leaveHotspot}
          isLeaving={phase.status === 'leaving'}
          wideActivity={activeHotspot.id === 'gaming'}
          // Physically accepted on LaurUch's TV first (see RoomCloseUp's
          // own `enableDirectDrag` doc comment); this shared call site
          // renders both Cozy Loft close-ups (TV/Gaming), so promoting it
          // here covers both.
          enableDirectDrag
        >
          {activeHotspot.id === 'tv' && <TvActivity onOpenWatch={onOpenWatch} />}
          {activeHotspot.id === 'gaming' && <GamingActivity />}
        </RoomCloseUp>
      )}
    </div>
  )
})

/** See the top of this file for why this loops the video a little before
 * its true end (the "Good Games Better Together" sign's clear-text
 * segment). The base video stays mounted for CozyLoftRoom's whole
 * lifetime now, so this only ever attaches once. */
function useVideoLoopGuard(videoRef: RefObject<HTMLVideoElement | null>) {
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    function loopBeforeUnwantedSegment() {
      if (video && video.currentTime >= LOOP_RESET_BEFORE_SECONDS) {
        video.currentTime = 0
      }
    }
    video.addEventListener('timeupdate', loopBeforeUnwantedSegment)
    return () => video.removeEventListener('timeupdate', loopBeforeUnwantedSegment)
  }, [videoRef])
}

/** The TV close-up's activity selection — deliberately just a doorway
 * into the EXISTING Watch Together capability (onOpenWatch), not a
 * reimplementation of it. YouTube is the only real provider; anything
 * else shown must read as clearly non-functional, per the approved
 * scope, so it's a single disabled "coming soon" line rather than fake
 * provider buttons. */
function TvActivity({ onOpenWatch }: { onOpenWatch: () => void }) {
  return (
    <div className={styles.activityPanel}>
      <h3 className={styles.activityTitle}>Watch Together</h3>
      <button type="button" className={styles.activityPrimaryButton} onClick={onOpenWatch}>
        ▶ Continue with YouTube
      </button>
      <p className={styles.activityNote}>More providers coming soon.</p>
    </div>
  )
}

