import type { RoomHotspot } from './types'
import styles from './RoomHotspotIcon.module.css'

interface RoomHotspotIconProps {
  hotspot: RoomHotspot
  onActivate: (hotspotId: string) => void
}

/**
 * One clickable icon positioned over a physical object in the room.
 * Generic — knows nothing about what the hotspot leads to, only how to
 * announce and activate itself. Default state is a small, semi-
 * transparent glyph (discoverable without hovering); hover/focus
 * brightens it and reveals the label, per the approved visual spec.
 */
export function RoomHotspotIcon({ hotspot, onActivate }: RoomHotspotIconProps) {
  return (
    <button
      type="button"
      className={styles.hotspot}
      style={{ left: `${hotspot.position.xPercent}%`, top: `${hotspot.position.yPercent}%` }}
      onClick={() => onActivate(hotspot.id)}
      aria-label={hotspot.label}
    >
      <span className={styles.icon} aria-hidden="true">
        {hotspot.icon}
      </span>
      <span className={styles.label} aria-hidden="true">
        {hotspot.label}
      </span>
    </button>
  )
}
