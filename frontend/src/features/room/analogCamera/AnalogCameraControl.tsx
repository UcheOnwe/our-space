import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { clampKnobPosition, computeStickVector } from './analogStick'
import type { StickVector } from './analogStick'
import styles from './AnalogCameraControl.module.css'

interface AnalogCameraControlProps {
  /** Called on every joystick pointer sample with the current continuous
   * 360° vector (see analogStick.ts) — `{x:0,y:0}` on release/cancel.
   * This is the ONLY thing the joystick tells the camera; it never
   * touches pan/zoom/bounds itself. */
  onVectorChange: (vector: StickVector) => void
  /** Restores the fitted composition — a completely separate control from
   * the joystick's own movement, rendered as part of the same visual
   * cluster. */
  onRecenter: () => void
  /** Overrides the default 16px bottom offset — for a consumer whose own
   * UI occupies the bottom of the same viewport (RoomGallery's own nav/
   * name/confirm/dots overlay, when this renders inside
   * RoomPosterPreview specifically). Omitted everywhere else. */
  bottomOffsetPx?: number
}

/**
 * The single 360° movement joystick + its Recenter control, rendered
 * together as one visual cluster. Fully self-contained: it owns its own
 * pointer handling and its own knob's visual position, and reports
 * intent outward through `onVectorChange` only — no camera state, no
 * room/hotspot knowledge.
 *
 * Pointer handling is scoped to THIS component's own base element only
 * (`onPointerDown` here, not on some ancestor covering the whole
 * environment) — this is what satisfies "the analog only owns pointer
 * input that begins on the joystick itself," and is exactly the design
 * that avoids the earlier class of bug where a shared gesture hook's
 * pointer capture on a large container broke nested buttons elsewhere in
 * the same view: this component has no ancestor relationship to any
 * activity control at all, so there is nothing for it to accidentally
 * capture.
 *
 * The knob's own visual position is written directly to a ref'd
 * element's `style.transform` on every pointer sample — never through
 * React state — so dragging the knob itself stays perfectly smooth
 * regardless of render cost elsewhere; only the idle/active visual class
 * (a real state toggle) is low-frequency enough for that not to matter.
 */
export function AnalogCameraControl({ onVectorChange, onRecenter, bottomOffsetPx }: AnalogCameraControlProps) {
  const baseRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const centerRef = useRef<{ x: number; y: number } | null>(null)
  const [active, setActive] = useState(false)

  function knobRadius(): number {
    // The base's own half-width IS the knob's max travel radius — one
    // measured value, not a hardcoded pixel constant that could drift
    // from the actual CSS sizing (including the mobile/desktop size
    // difference, which is CSS-only — see AnalogCameraControl.module.css).
    const base = baseRef.current
    return base ? base.getBoundingClientRect().width / 2 : 0
  }

  function setKnobPosition(x: number, y: number) {
    if (knobRef.current) knobRef.current.style.transform = `translate(${x}px, ${y}px)`
  }

  function handlePointerDown(event: ReactPointerEvent) {
    // Only one active contact drives the stick — a second finger landing
    // on the joystick while the first is already down is ignored rather
    // than fought over (this is a single-thumb control, not a pinch
    // surface itself).
    if (activePointerIdRef.current !== null) return
    const base = baseRef.current
    if (!base) return
    const rect = base.getBoundingClientRect()
    centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    activePointerIdRef.current = event.pointerId
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Safe to ignore — the gesture still works via ordinary hit-tested
        // events without capture, just more sensitive to the finger
        // drifting off the (small) joystick base mid-drag.
      }
    }
    setActive(true)
    updateFromPointer(event.clientX, event.clientY)
  }

  function updateFromPointer(clientX: number, clientY: number) {
    const center = centerRef.current
    if (!center) return
    const radius = knobRadius()
    const dx = clientX - center.x
    const dy = clientY - center.y

    const knobPos = clampKnobPosition(dx, dy, radius)
    setKnobPosition(knobPos.x, knobPos.y)

    onVectorChange(computeStickVector(dx, dy, radius))
  }

  function handlePointerMove(event: ReactPointerEvent) {
    if (activePointerIdRef.current !== event.pointerId) return
    if (event.cancelable) event.preventDefault()
    updateFromPointer(event.clientX, event.clientY)
  }

  function release(event: ReactPointerEvent) {
    if (activePointerIdRef.current !== event.pointerId) return
    activePointerIdRef.current = null
    centerRef.current = null
    setActive(false)
    setKnobPosition(0, 0)
    // {0,0} — the same "stop" signal release, cancel, and losing pointer
    // capture must ALL funnel through, so the camera's own continuous
    // loop reliably stops.
    onVectorChange({ x: 0, y: 0 })
  }

  return (
    <div
      className={styles.cluster}
      style={bottomOffsetPx !== undefined ? ({ '--analog-bottom-offset': `${bottomOffsetPx}px` } as CSSProperties) : undefined}
    >
      <button type="button" className={styles.recenterButton} onClick={onRecenter} aria-label="Recenter view">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <path
            d="M12 2v4M12 18v4M2 12h4M18 12h4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </button>
      <div
        ref={baseRef}
        className={`${styles.base} ${active ? styles.baseActive : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        role="presentation"
        aria-label="Explore the environment"
      >
        <div ref={knobRef} className={styles.knob} />
      </div>
    </div>
  )
}
