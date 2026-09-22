import { useRef } from 'react'
import { AmbientImage } from './AmbientImage'
import { ROOM_WORLD_HEIGHT, ROOM_WORLD_WIDTH } from './constants'
import { PageScrollControls } from './PageScrollControls'
import { useRoomCameraGestures } from './useRoomCameraGestures'
import styles from './RoomPosterPreview.module.css'

interface RoomPosterPreviewProps {
  src: string
}

/**
 * An explorable "browse the room" preview for a room whose gallery hero
 * is a static poster image rather than a live room component (currently
 * just Lauruch Loft — see roomPosters.ts). Before this existed, that
 * preview was a plain `<img>` locked to one crop, unlike Cozy Loft/After
 * Hours' own previews (their live room components are already pannable).
 *
 * Exploration is via `useRoomCameraGestures` — the EXACT SAME hook (and
 * event path/camera-update pattern) CozyLoftRoom.tsx's/AfterHoursRoom.tsx's
 * own previews already use, deliberately NOT `useAnalogCameraController`
 * (that hook's direct-drag path was previously used here and physically
 * tested as slow/frame-by-frame on a real phone, in contrast to Cozy
 * Loft's/After Hours' own smooth `useRoomCameraGestures`-driven previews
 * — the two working implementations are the template this now matches,
 * not a new camera design). Always `enabled` (a preview has no
 * hotspot-transition phases to pause for), and intentionally has NO
 * hotspots/activation of any kind — it only ever renders the poster
 * image, so there's nothing here that could accidentally trigger a room
 * activity while merely browsing.
 *
 * `PageScrollControls` is rendered alongside but is completely isolated
 * from this camera — see its own doc comment.
 */
export function RoomPosterPreview({ src }: RoomPosterPreviewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { camera, handlers } = useRoomCameraGestures(wrapperRef, true)

  return (
    <div ref={wrapperRef} className={styles.wrapper} {...handlers}>
      <div
        className={styles.world}
        style={{
          width: ROOM_WORLD_WIDTH,
          height: ROOM_WORLD_HEIGHT,
          transform: `translate(${camera.translateX}px, ${camera.translateY}px) scale(${camera.scale})`,
        }}
      >
        <AmbientImage className={styles.image} src={src} />
      </div>
      <PageScrollControls />
    </div>
  )
}
