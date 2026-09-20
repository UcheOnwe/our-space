import { useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { AmbientVideo } from '../AmbientVideo'
import { ROOM_WORLD_HEIGHT, ROOM_WORLD_WIDTH } from '../constants'
import { useRoomCameraGestures } from '../useRoomCameraGestures'
import styles from './RoomCloseUp.module.css'

interface RoomCloseUpProps {
  videoSrc: string
  posterSrc: string
  label: string
  onBack: () => void
  /** Drives the reverse (zoom-back-out/fade) animation while the parent's
   * phase is `leaving`, as opposed to the forward enter animation that
   * plays on mount. */
  isLeaving: boolean
  /** The activity content for this hotspot (Watch/Gaming UI) — rendered
   * by the room, not this component, which stays activity-agnostic. */
  children: ReactNode
}

/**
 * The reusable "inside a hotspot" surface: its own generated close-up
 * video owns the environment, exactly like the full room does, with a
 * restrained enter/leave zoom (CSS transform, no animation library) and
 * a "Back to Room" control. Generic across any hotspot/room — the actual
 * activity UI is passed in as children.
 *
 * The close-up video is rendered inside the SAME pannable/zoomable world
 * pattern CozyLoftRoom.tsx's own main room uses — the exact same
 * useRoomCameraGestures hook and camera.ts math, not a second
 * implementation. Both close-up videos are generated at the identical
 * 16:9 ratio as the main room video (confirmed directly), so reusing
 * ROOM_WORLD_WIDTH/HEIGHT as the world's reference size is correct here
 * too. On mobile, where this box's own aspect ratio doesn't match 16:9,
 * that's what lets the user explore the full close-up composition
 * instead of being stuck with whatever `object-fit: cover` happened to
 * center-crop. The activity UI (children) is NOT inside this pannable
 * world — it stays fixed/centered over the video regardless of pan/zoom,
 * which is what keeps its buttons from drifting as the user explores.
 */
export function RoomCloseUp({ videoSrc, posterSrc, label, onBack, isLeaving, children }: RoomCloseUpProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { camera, handlers } = useRoomCameraGestures(wrapperRef, !isLeaving)

  return (
    <div className={`${styles.closeUp} ${isLeaving ? styles.leaving : styles.entering}`}>
      <div ref={wrapperRef} className={styles.viewport} {...handlers}>
        <div
          className={styles.world}
          style={{
            width: ROOM_WORLD_WIDTH,
            height: ROOM_WORLD_HEIGHT,
            transform: `translate(${camera.translateX}px, ${camera.translateY}px) scale(${camera.scale})`,
          }}
        >
          <AmbientVideo className={styles.video} src={videoSrc} posterSrc={posterSrc} />
        </div>
      </div>

      {/* Portaled straight to <body> — NOT just `position: fixed` in
          place, because that alone doesn't reach the true viewport here.
          `.closeUp` (this element) carries an active `transform` for its
          own enter/leave animation, and RoomExperience.module.css's
          `.roomSlot` (an ancestor a few levels up) sets `transform:
          scale(1)` unconditionally even at rest — CSS spec: ANY ancestor
          with an active transform becomes the containing block for a
          `position: fixed` descendant instead of the real viewport. That
          silently turned "fixed" into "stuck to a box that scrolls with
          the page," which is exactly the persistence bug real device
          testing found. A portal sidesteps the whole transformed
          ancestor chain rather than trying to keep it transform-free. */}
      {createPortal(
        <button type="button" className={styles.backButton} onClick={onBack}>
          ‹ Back to Room
        </button>,
        document.body,
      )}

      <div className={styles.overlay}>
        <div className={styles.activity} aria-label={`${label} activity`}>
          {children}
        </div>
      </div>
    </div>
  )
}
