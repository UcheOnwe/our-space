import { useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { AmbientImage } from '../AmbientImage'
import { AmbientVideo } from '../AmbientVideo'
import { AnalogCameraControl } from '../analogCamera/AnalogCameraControl'
import { useAnalogCameraController } from '../analogCamera/useAnalogCameraController'
import { ROOM_WORLD_HEIGHT, ROOM_WORLD_WIDTH } from '../constants'
import { PageScrollControls } from '../PageScrollControls'
import styles from './RoomCloseUp.module.css'

interface RoomCloseUpProps {
  /** Video-environment close-ups (Cozy Loft today): provide videoSrc +
   * posterSrc. Static-art close-ups (After Hours): provide imageSrc
   * instead. Exactly one of the two should be given — see AmbientVideo/
   * AmbientImage for why each room type needs its own element. */
  videoSrc?: string
  posterSrc?: string
  imageSrc?: string
  label: string
  onBack: () => void
  /** Overrides the back control's own text — for a close-up reached
   * directly from ANOTHER close-up rather than the room (see
   * useRoomHotspotInteraction's `switchHotspot`/`cameFrom`), where
   * `onBack` actually returns to that other close-up, not the room, and
   * the button should say so (e.g. "Back to Door" for Garage). Omitted by
   * every close-up reached the normal way, which keeps the existing
   * "Back to Room" wording unchanged. */
  backLabel?: string
  /** Drives the reverse (zoom-back-out/fade) animation while the parent's
   * phase is `leaving`, as opposed to the forward enter animation that
   * plays on mount. */
  isLeaving: boolean
  /** `'enter'` (default): the normal room -> close-up mount, a scale+FADE
   * animation (opacity 0 -> 1) — correct here because the close-up is the
   * ONLY thing appearing; whatever's behind it (the room) is meant to
   * still be settling into view underneath as this fades in.
   * `'switch'`: a DIRECT close-up-to-close-up transition (e.g. Door ->
   * Garage via useRoomHotspotInteraction's `switchHotspot`/`cameFrom`).
   * This close-up is re-keyed by the caller on every switch, so React
   * unmounts the outgoing one and mounts this one fresh in the same
   * commit — if this used the same opacity-from-0 fade, the FIRST painted
   * frame of the new close-up would be fully transparent while the old
   * one has already been removed, exposing the room underneath for a
   * frame (confirmed: this is exactly what real-device testing caught,
   * even though the STATE machine's `phase.status` never touches 'room'
   * during this transition — the state being correct doesn't guarantee
   * the paint is). `'switch'` plays a scale-only zoom with no opacity
   * component at all, so this element is fully opaque from its very first
   * frame and the room can never show through, regardless of exactly when
   * the outgoing instance's DOM nodes are removed. */
  transitionStyle?: 'enter' | 'switch'
  /** The activity content for this hotspot (Watch/Gaming UI) — rendered
   * by the room, not this component, which stays activity-agnostic. */
  children: ReactNode
  /** Widens/heightens the activity area beyond the default small,
   * narrow, centered panel (TV's "Continue with YouTube" note) — for
   * content that genuinely needs more room, like the Gaming close-up's
   * game selector/player. Defaults to the existing narrow behavior;
   * RoomCloseUp stays activity-agnostic either way, it just hands out a
   * bigger box. */
  wideActivity?: boolean
  /** Optional decorative ambience (AmbientEffectsLayer), rendered inside
   * the SAME pannable world box as the video/image so it pans/zooms with
   * the artwork. Omitted entirely for close-ups that don't declare any
   * (Cozy Loft today). */
  ambientEffects?: ReactNode
  /** EXPERIMENTAL, opt-in per caller — defaults to false (every close-up
   * keeps its current analog-only behavior unless it explicitly asks for
   * this). When true, ALSO wires direct touch/mouse drag + pinch onto
   * this close-up's own `useAnalogCameraController` instance, using that
   * hook's `'immediate'` drag mode (no pointer capture, synchronous
   * transform write — matching `useRoomCameraGestures`'s own physically-
   * proven-smooth preview drag pattern) — see that hook's own `dragMode`
   * doc comment for exactly what changes and why it's safe: drag and the
   * analog joystick still share the SAME single `panRef`/`zoomRef`/
   * `writeTransform`, so there is one authoritative camera position
   * either input can move and Recenter can reset, never two competing
   * ones. Currently set by only ONE caller (RoomCanvas.tsx, for LaurUch's
   * own TV close-up) as a controlled experiment — every other close-up
   * (Gaming/Kitchen/Door/Garage, and every Cozy Loft/After Hours
   * close-up) omits this and is completely unaffected. */
  enableDirectDrag?: boolean
}

/**
 * The reusable "inside a hotspot" surface: its own generated close-up
 * video owns the environment, exactly like the full room does, with a
 * restrained enter/leave zoom (CSS transform, no animation library) and
 * a "Back to Room" control. Generic across any hotspot/room — the actual
 * activity UI is passed in as children.
 *
 * The close-up video is rendered inside the SAME pannable/zoomable world
 * SHAPE CozyLoftRoom.tsx's own main room uses, sharing camera.ts's math —
 * but explored via `useAnalogCameraController` (a 360° joystick, see
 * analogCamera/) ONLY, NOT direct one-finger touch dragging, UNLESS the
 * caller explicitly opts in via `enableDirectDrag` (see that prop's own
 * doc comment — currently just LaurUch's TV close-up, as a controlled
 * experiment). Repeated physical-phone testing found one-finger drag
 * never felt genuinely smooth here despite several rounds of fixes to
 * the shared gesture hook — fixing it required touching that hook, which
 * regressed the entered rooms' own already-good mobile feel, so this
 * close-up environment uses a dedicated analog controller instead,
 * completely decoupled from that hook. Both close-up videos are generated at the identical
 * 16:9 ratio as the main room video (confirmed directly), so reusing
 * ROOM_WORLD_WIDTH/HEIGHT as the world's reference size is correct here
 * too. On mobile, where this box's own aspect ratio doesn't match 16:9,
 * that's what lets the user explore the full close-up composition
 * instead of being stuck with whatever `object-fit: cover` happened to
 * center-crop. The activity UI (children) is NOT inside this pannable
 * world — it stays fixed/centered over the video regardless of pan/zoom,
 * which is what keeps its buttons from drifting as the user explores.
 */
export function RoomCloseUp({
  videoSrc,
  posterSrc,
  imageSrc,
  label,
  onBack,
  backLabel = 'Back to Room',
  isLeaving,
  transitionStyle = 'enter',
  children,
  wideActivity = false,
  ambientEffects,
  enableDirectDrag = false,
}: RoomCloseUpProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  // `environmentHandlers` (direct drag/pinch) is only spread onto
  // `.viewport` below when `enableDirectDrag` is true — every other
  // close-up stays analog-only, exactly as before; see this component's
  // own `enableDirectDrag` doc comment.
  const { environmentHandlers, setStickVector, recenter } = useAnalogCameraController(
    wrapperRef,
    worldRef,
    !isLeaving,
    enableDirectDrag ? 'immediate' : 'deferred',
  )

  const mountClass = isLeaving ? styles.leaving : transitionStyle === 'switch' ? styles.switching : styles.entering

  return (
    <div className={`${styles.closeUp} ${mountClass}`}>
      <div ref={wrapperRef} className={styles.viewport} {...(enableDirectDrag ? environmentHandlers : undefined)}>
        {/* transform is written directly by useAnalogCameraController —
            see that hook's own doc comment for why. */}
        <div ref={worldRef} className={styles.world} style={{ width: ROOM_WORLD_WIDTH, height: ROOM_WORLD_HEIGHT }}>
          {imageSrc ? (
            <AmbientImage className={styles.video} src={imageSrc} />
          ) : (
            <AmbientVideo className={styles.video} src={videoSrc!} posterSrc={posterSrc!} />
          )}
          {ambientEffects}
        </div>
        <AnalogCameraControl onVectorChange={setStickVector} onRecenter={recenter} />
        <PageScrollControls />
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
          ‹ {backLabel}
        </button>,
        document.body,
      )}

      <div className={styles.overlay}>
        {/* Only rendered when there's real activity content (TV/Gaming/
            Door) — a pure exploration close-up (Kitchen/Garage) passes no
            children at all, and rendering this box anyway would leave an
            invisible pointer-events: auto dead zone centered over the
            close-up, blocking exactly the drag gestures Kitchen/Garage
            most need to support. See .overlay's own doc comment in
            RoomCloseUp.module.css for the matching fix on the interactive
            case. */}
        {children && (
          <div
            className={`${styles.activity} ${wideActivity ? styles.activityWide : ''}`}
            aria-label={`${label} activity`}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * A purely visual, non-interactive twin of RoomCloseUp — no gesture
 * handlers, no joystick, no Back button, no activity content — used
 * ONLY as a brief opaque safety net directly underneath an INCOMING
 * close-up during a direct switch (Door -> Garage and back). See
 * RoomCanvas.tsx's own doc comment on `outgoingHotspotId` for why this
 * exists: even with the incoming close-up's own opaque background and
 * no-opacity `.switching` keyframe (both already fixed), real-device
 * testing still found an occasional flash of the room underneath during
 * the hand-off — the remaining risk is paint/compositing timing (GPU
 * layer promotion for a freshly-mounted element, or any gap between the
 * outgoing instance's removal and the incoming instance's first real
 * paint) that a single, instantaneously-swapped instance can't fully
 * rule out no matter how its OWN CSS is tuned. Keeping the OUTGOING
 * close-up mounted as this stripped-down backdrop for the transition's
 * own duration removes that risk structurally: its image is
 * PROVABLY already decoded and painted (it was the visible close-up up
 * until the instant of the switch), so there is always at least one
 * fully opaque, already-rendered surface between the incoming close-up
 * and RoomCanvas for the whole hand-off, regardless of the incoming
 * one's own paint timing.
 *
 * Deliberately does NOT reuse the pannable `.world`/`.viewport`
 * structure or `useAnalogCameraController` — this never needs to be
 * interactive (it's removed before the user could plausibly try to pan
 * it), so a plain cover-fit fill is enough and avoids mounting a second,
 * redundant joystick/gesture-handler pair during the hand-off.
 */
export function RoomCloseUpBackdrop({ imageSrc, videoSrc, posterSrc }: Pick<RoomCloseUpProps, 'imageSrc' | 'videoSrc' | 'posterSrc'>) {
  return (
    <div className={styles.closeUp} aria-hidden="true">
      <div className={styles.backdropFill}>
        {imageSrc ? (
          <AmbientImage className={styles.video} src={imageSrc} />
        ) : (
          <AmbientVideo className={styles.video} src={videoSrc!} posterSrc={posterSrc!} />
        )}
      </div>
    </div>
  )
}
