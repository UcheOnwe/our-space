import { AfterHoursRoom } from './AfterHoursRoom'
import { CozyLoftRoom } from './CozyLoftRoom'
import { ROOM_POSTER_SRC } from './roomPosters'
import { RoomPosterPreview } from './RoomPosterPreview'
import type { RoomGalleryItem } from '../rooms/types'
import styles from './RoomGallery.module.css'

interface RoomGalleryProps {
  rooms: RoomGalleryItem[]
  centeredIndex: number
  onCenterChange: (index: number) => void
  /** Fires only when the user explicitly confirms the CENTERED/focused
   * room — browsing (arrows, dots) never fires this on its own, keeping a
   * purchase/selection a deliberate second step. */
  onConfirm: (room: RoomGalleryItem) => void
  isSubmitting: boolean
  error: string | null
}

/** Renders one room's full-size hero preview. Couple Home (Lauruch Loft)
 * uses its existing static backplate image — no live Pixi instance (a
 * second simultaneous Application is unnecessary cost for a browsing
 * preview) — but wrapped in RoomPosterPreview so it's still explorable
 * (pan/pinch) rather than locked to one fixed crop, which used to be a
 * real mobile bug (a plain `<img>` here couldn't be panned the way the
 * other two rooms' live previews already could). Cozy Loft and After
 * Hours both reuse their actual live room component, `enableHotspots=false`
 * — someone deciding whether to spend Uchem on a room still needs to be
 * able to pan around and inspect all of it first (the same bounded
 * camera the live room uses, not a separate one — see
 * CozyLoftRoom.tsx's/AfterHoursRoom.tsx's own doc comments), just without
 * hotspots or the ability to enter a close-up while merely browsing.
 * After Hours' preview is cheap (a still image, not a video) so mounting
 * it alongside Cozy Loft's actual playing video adds negligible cost.
 * See roomPosters.ts's own doc comment for why there's no static poster
 * for either of these two instead. */
function renderRoomPreview(roomType: string) {
  if (roomType === 'cozy_loft') return <CozyLoftRoom enableHotspots={false} />
  if (roomType === 'after_hours') return <AfterHoursRoom enableHotspots={false} />
  const posterSrc = ROOM_POSTER_SRC[roomType]
  return posterSrc ? <RoomPosterPreview src={posterSrc} /> : null
}

function confirmLabel(room: RoomGalleryItem): string {
  if (room.is_active) return 'Current room'
  if (room.is_owned) return `Enter ${room.display_name}`
  return `Unlock for ${room.price.toLocaleString()} Uchem`
}

/**
 * The room collection/discovery surface — both owned and locked rooms,
 * one at a time, full-size. This is the "hybrid immersive" browser: the
 * focused room's own hero preview fills the whole room slot (the same
 * footprint the live room normally occupies), and left/right CROSSFADES
 * to the next room's preview rather than scrolling a row of smaller
 * cards — the goal is "moving between spaces," not "browsing product
 * tiles." Navigation (arrows + name), ownership/price/action, and
 * position dots all overlay that full-size preview.
 *
 * All rooms' previews are mounted simultaneously and crossfaded via
 * opacity — simplest correct approach at today's catalog size (2 rooms).
 * Worth revisiting (mount only the focused ± 1 neighbor) once the catalog
 * grows enough that keeping every room's preview alive at once — Cozy
 * Loft's is a genuinely playing video — becomes wasteful.
 */
export function RoomGallery({ rooms, centeredIndex, onCenterChange, onConfirm, isSubmitting, error }: RoomGalleryProps) {
  const centeredRoom = rooms[centeredIndex]
  const canGoPrevious = centeredIndex > 0
  const canGoNext = centeredIndex < rooms.length - 1

  return (
    <div className={styles.gallery}>
      <div className={styles.heroLayer}>
        {rooms.map((room, index) => (
          <div
            key={room.room_type}
            className={`${styles.heroSlide} ${index === centeredIndex ? styles.heroSlideFocused : ''}`}
            aria-hidden={index !== centeredIndex}
          >
            {renderRoomPreview(room.room_type)}
          </div>
        ))}
      </div>

      {/* Absolutely positioned OVER the hero preview (a translucent
          gradient scrim behind the bottom content only, not a solid
          panel) — see .gallery's own `position: sticky` in
          RoomGallery.module.css for how this whole box (art + overlaid
          controls together) stays reachable regardless of page scroll,
          without needing a separate control panel below the artwork. */}
      <div className={styles.overlay}>
        <div className={styles.navRow}>
          <button
            type="button"
            className={styles.navButton}
            onClick={() => onCenterChange(centeredIndex - 1)}
            disabled={!canGoPrevious}
            aria-label="Previous room"
          >
            ‹
          </button>
          <span className={styles.roomName}>{centeredRoom?.display_name}</span>
          <button
            type="button"
            className={styles.navButton}
            onClick={() => onCenterChange(centeredIndex + 1)}
            disabled={!canGoNext}
            aria-label="Next room"
          >
            ›
          </button>
        </div>

        {centeredRoom && (
          <div className={styles.infoRow}>
            {centeredRoom.is_owned ? (
              <span className={styles.status}>{centeredRoom.is_active ? 'Active' : 'Owned'}</span>
            ) : (
              <span className={styles.status}>🔒 {centeredRoom.price.toLocaleString()} Uchem</span>
            )}
          </div>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {centeredRoom && (
          <button
            type="button"
            className={styles.confirmButton}
            onClick={() => onConfirm(centeredRoom)}
            disabled={isSubmitting || centeredRoom.is_active}
          >
            {isSubmitting ? 'Please wait…' : confirmLabel(centeredRoom)}
          </button>
        )}

        <div className={styles.dots}>
          {rooms.map((room, index) => (
            <button
              key={room.room_type}
              type="button"
              className={`${styles.dot} ${index === centeredIndex ? styles.dotFocused : ''}`}
              onClick={() => onCenterChange(index)}
              aria-label={`Show ${room.display_name}`}
              aria-current={index === centeredIndex}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

