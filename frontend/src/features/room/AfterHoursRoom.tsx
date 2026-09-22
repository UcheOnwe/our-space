import { forwardRef, useImperativeHandle, useRef } from 'react'
import { GamingActivity } from '../gaming/GamingActivity'
import { AmbientImage } from './AmbientImage'
import {
  AFTER_HOURS_GAMING_AMBIENT,
  AFTER_HOURS_GARAGE_AMBIENT,
  AFTER_HOURS_HALLWAY_AMBIENT,
  AFTER_HOURS_KITCHEN_AMBIENT,
  AFTER_HOURS_MAIN_AMBIENT,
  AFTER_HOURS_TV_AMBIENT,
} from './ambient/afterHoursAmbience'
import { AmbientEffectsLayer } from './ambient/AmbientEffectsLayer'
import { ROOM_WORLD_HEIGHT, ROOM_WORLD_WIDTH } from './constants'
import { buildHallwayDestinations } from './hallwayDestinations'
import { HallwayNavigation } from './HallwayNavigation'
import { RoomCloseUp } from './hotspots/RoomCloseUp'
import { RoomHotspotIcon } from './hotspots/RoomHotspotIcon'
import { useRoomHotspotInteraction } from './hotspots/useRoomHotspotInteraction'
import type { RoomHotspot } from './hotspots/types'
import { useRoomCameraGestures } from './useRoomCameraGestures'
import styles from './AfterHoursRoom.module.css'

// Runtime copies of art-source/After-hours/*.png — see
// scripts/optimize-after-hours-assets.mjs for how these are generated
// (re-encoded to quality JPEG at full resolution, source PNGs untouched).
const MAIN_ROOM_IMAGE = '/after-hours/main-room.jpg'
const GAMING_CLOSEUP_IMAGE = '/after-hours/gaming-closeup.jpg'
const GARAGE_CLOSEUP_IMAGE = '/after-hours/garage-closeup.jpg'
const HALLWAY_CLOSEUP_IMAGE = '/after-hours/hallway-closeup.jpg'
// The dedicated TV close-up (art-source/After-hours/tvcloseupCLLBH_...png)
// — previously missing, so the TV hotspot temporarily reused the main
// room image as a stand-in. Now wired to its own intended artwork.
const TV_CLOSEUP_IMAGE = '/after-hours/tv-closeup.jpg'
const KITCHEN_CLOSEUP_IMAGE = '/after-hours/kitchen-closeup.jpg'

// Door/Garage/Kitchen positions were re-measured directly against the
// source PNG (art-source/After-hours/collabcozy_...png, 3344x1882):
// cropped and enlarged the relevant regions, located each opening's
// actual visible boundaries in source pixels, then converted to
// percentages of the full image. Door centers on the neon zigzag-walled
// corridor entrance (~x1072,y502 of 3344x1882); Garage centers on the
// hex-LED-ceilinged opening showing the parked car (~x1353,y566); Kitchen
// centers on the breakfast-bar/kitchen counter visible on the room's far
// left (~x538,y699). TV/Gaming were left unchanged (confirmed acceptable).
const HOTSPOTS: RoomHotspot[] = [
  { id: 'tv', label: 'Watch', icon: '📺', position: { xPercent: 57, yPercent: 28 }, closeUpSrc: TV_CLOSEUP_IMAGE },
  { id: 'gaming', label: 'Play', icon: '🎮', position: { xPercent: 90, yPercent: 28 }, closeUpSrc: GAMING_CLOSEUP_IMAGE },
  { id: 'kitchen', label: 'Kitchen', icon: '🍳', position: { xPercent: 16, yPercent: 37 }, closeUpSrc: KITCHEN_CLOSEUP_IMAGE },
  { id: 'door', label: 'Hallway', icon: '🚪', position: { xPercent: 32, yPercent: 27 }, closeUpSrc: HALLWAY_CLOSEUP_IMAGE },
  { id: 'garage', label: 'Garage', icon: '🚗', position: { xPercent: 40, yPercent: 30 }, closeUpSrc: GARAGE_CLOSEUP_IMAGE },
]

const ACTIVITY_ORIGIN_BIAS = 0.4

function biasedOrigin(percent: number): number {
  return 50 + (percent - 50) * ACTIVITY_ORIGIN_BIAS
}

export interface AfterHoursRoomHandle {
  /** Same contract as CozyLoftRoomHandle.returnToRoom — leaves whatever
   * hotspot close-up is active, back to the plain room. */
  returnToRoom: () => void
}

interface AfterHoursRoomProps {
  /** Same as CozyLoftRoom's onOpenWatch — the TV hotspot's and the
   * hallway's "Watch Together" destination both call this. */
  onOpenWatch?: () => void
  /** Switches the couple's active room to Lauruch Loft from the hallway —
   * see RoomExperience.tsx's handleNavigateToRoom. Optional since passive
   * preview contexts (RoomGallery) never call it. */
  onNavigateToRoom?: (roomType: string) => void
  /** Same as CozyLoftRoom's enableHotspots — false for RoomGallery's
   * passive browsing preview. */
  enableHotspots?: boolean
}

/**
 * After Hours' full-room experience — structurally the same hotspot/
 * camera/close-up composition as CozyLoftRoom.tsx (same
 * useRoomCameraGestures, useRoomHotspotInteraction, RoomHotspotIcon,
 * RoomCloseUp — all reused, none forked), but built on high-quality
 * STATIC ART instead of generated video: "the original image owns the
 * environment, our code owns ambience and interaction" (see
 * ambient/AmbientEffectsLayer.tsx for the restrained, artwork-grounded
 * ambient touches layered on top — never a redraw/animation of the image
 * itself).
 *
 * Five hotspots instead of Cozy Loft's two: TV (Watch, same flow),
 * Gaming (same GamingActivity, no fork), Kitchen (pure exploration), Door
 * (in-world navigation to other real destinations — see
 * hallwayDestinations.ts), and Garage (a pure exploration space with no
 * activity — intentionally no gameplay/customization UI, per the
 * approved scope).
 *
 * Deliberately NOT extracted into a shared "room stage" with
 * CozyLoftRoom.tsx for this slice — the lower-level pieces (camera hook,
 * hotspot state machine, hotspot icon, close-up shell) are already the
 * shared layer; forcing a deeper extraction now risks Cozy Loft's
 * existing, already-tested behavior for a two-room reuse case. Worth
 * revisiting if a fourth room appears.
 */
export const AfterHoursRoom = forwardRef<AfterHoursRoomHandle, AfterHoursRoomProps>(function AfterHoursRoom(
  { onOpenWatch = () => {}, onNavigateToRoom, enableHotspots = true },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { phase, enterHotspot, leaveHotspot } = useRoomHotspotInteraction()
  const { camera, handlers } = useRoomCameraGestures(wrapperRef, phase.status === 'room')

  useImperativeHandle(ref, () => ({
    returnToRoom: () => leaveHotspot(),
  }))

  const activeHotspot = phase.status === 'room' ? undefined : HOTSPOTS.find((h) => h.id === phase.hotspotId)
  const showCloseUp = phase.status === 'closeup' || phase.status === 'leaving'
  const effectActive = phase.status !== 'room'

  const hallwayDestinations = buildHallwayDestinations({
    onGoToLauruchLoft: () => {
      leaveHotspot()
      onNavigateToRoom?.('couple_home')
    },
    onOpenWatch,
  })

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
          <AmbientImage className={styles.image} src={MAIN_ROOM_IMAGE} />
          <AmbientEffectsLayer effects={AFTER_HOURS_MAIN_AMBIENT} />

          {enableHotspots &&
            phase.status === 'room' &&
            HOTSPOTS.map((hotspot) => (
              <RoomHotspotIcon key={hotspot.id} hotspot={hotspot} onActivate={enterHotspot} />
            ))}
        </div>
      </div>

      {showCloseUp && activeHotspot && (
        <RoomCloseUp
          imageSrc={activeHotspot.closeUpSrc}
          label={activeHotspot.label}
          onBack={leaveHotspot}
          isLeaving={phase.status === 'leaving'}
          wideActivity={activeHotspot.id === 'gaming'}
          ambientEffects={<AmbientEffectsLayer effects={ambientEffectsFor(activeHotspot.id)} />}
          // Physically accepted on LaurUch's TV first (see RoomCloseUp's
          // own `enableDirectDrag` doc comment); this ONE shared call site
          // renders every After Hours close-up (TV/Gaming/Kitchen/Door/
          // Garage), so promoting it here covers all of them.
          enableDirectDrag
        >
          {activeHotspot.id === 'tv' && <TvActivity onOpenWatch={onOpenWatch} />}
          {activeHotspot.id === 'gaming' && <GamingActivity />}
          {activeHotspot.id === 'door' && <HallwayNavigation destinations={hallwayDestinations} />}
          {/* Kitchen/Garage: no activity children at all — pure
              exploration spaces, intentionally with no gameplay/
              customization UI. */}
        </RoomCloseUp>
      )}
    </div>
  )
})

function ambientEffectsFor(hotspotId: string) {
  switch (hotspotId) {
    case 'tv':
      return AFTER_HOURS_TV_AMBIENT
    case 'gaming':
      return AFTER_HOURS_GAMING_AMBIENT
    case 'kitchen':
      return AFTER_HOURS_KITCHEN_AMBIENT
    case 'garage':
      return AFTER_HOURS_GARAGE_AMBIENT
    case 'door':
      return AFTER_HOURS_HALLWAY_AMBIENT
    default:
      return AFTER_HOURS_MAIN_AMBIENT
  }
}

/** Identical in spirit to CozyLoftRoom's own TvActivity — a doorway into
 * the EXISTING Watch Together capability, not a reimplementation. */
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
