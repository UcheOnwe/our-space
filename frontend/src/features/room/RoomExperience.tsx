import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { fetchCoupleWallet } from '../uchem/api'
import { fetchRoomGallery, purchaseRoom, selectActiveRoom } from '../rooms/api'
import type { RoomGalleryItem } from '../rooms/types'
import { AfterHoursRoom } from './AfterHoursRoom'
import type { AfterHoursRoomHandle } from './AfterHoursRoom'
import { CozyLoftRoom } from './CozyLoftRoom'
import type { CozyLoftRoomHandle } from './CozyLoftRoom'
import { RoomCanvas } from './RoomCanvas'
import { RoomGallery } from './RoomGallery'
import styles from './RoomExperience.module.css'

// Must match RoomExperience.module.css's `.shrinking`/`.expanding`
// transition durations — same CSS-duration-matched setTimeout pattern
// PresenceContext.tsx already uses for its click ripples.
const TRANSITION_DURATION_MS = 320

type Mode = 'room' | 'gallery'
type TransitionPhase = 'idle' | 'shrinking' | 'expanding'

export interface RoomExperienceHandle {
  /** Opens the gallery if currently showing the room, or closes it
   * (without confirming anything) if already open. This is what
   * CoupleHomeNav's persistent "Switch Room"/"Close" control and
   * CoupleHomeSidebar's "Switch Room" drawer item both call — the timing
   * around the shrink/expand transition stays owned here, so callers
   * never need to know about it. */
  toggleGallery: () => void
  /** Closes the gallery if open; a no-op otherwise. Used by
   * CoupleHomeNav's branding click ("always return to the active room"),
   * which shouldn't ever OPEN the gallery, only ever close it. */
  closeGallery: () => void
  /** The universal "Home"/branding-click action: closes the gallery if
   * open, AND leaves whatever hotspot close-up the active room is
   * currently showing (Cozy Loft's TV/Gaming close-ups) — a harmless
   * no-op on either count if already at the plain room. This is what
   * lets clicking branding from inside a close-up return to "my
   * currently selected room, normal view" without ever switching rooms
   * or leaving Couple Home entirely. */
  returnToActiveRoom: () => void
}

interface RoomExperienceProps {
  onOpenWatch: () => void
  /** Reports whenever the gallery actually opens/closes — purely for
   * CoupleHomeNav's own display (button label, disabling branding-click
   * when already closed). RoomExperience remains the source of truth for
   * WHEN this happens; this is a notification, not a control. */
  onModeChange: (isGalleryOpen: boolean) => void
  /** Reports the Couple Wallet balance after it changes because of a
   * purchase made here — CoupleHomeNav is what actually displays it, so
   * this is how the number reaches it without CoupleHomeNav needing to
   * know anything about room purchases itself. */
  onBalanceChange: (balance: number) => void
}

/**
 * The room controller mounted by CoupleHomePage. Owns which room is
 * active (from the backend-authoritative /api/rooms/gallery/), whether
 * the full-screen room or the gallery/browser is showing, the
 * shrink/expand transition between them, and all purchase/select-active
 * mechanics. Exposes just enough via `RoomExperienceHandle`/the two
 * callback props for CoupleHomeNav to trigger and display room-browser
 * state without owning any of its mechanics itself.
 *
 * Deliberately only ONE live room renderer is ever mounted full-screen at
 * a time — RoomCanvas (Pixi) or CozyLoftRoom (video), never both. The
 * gallery mode shows its OWN hero preview for whichever room is focused
 * (see RoomGallery.tsx) — reusing CozyLoftRoom's video for Cozy Loft
 * specifically, so browsing to it doesn't need a second rendering
 * approach, at the accepted cost of that video restarting when the mode
 * boundary is crossed (a fresh mount each time, not a shared instance).
 *
 * The subtle pull-back/expand transition is preserved as its own thing,
 * distinct from the gallery's internal crossfade between focused rooms:
 * opening the browser scales/fades the live room down (`transitionPhase:
 * 'shrinking'`), THEN the gallery mounts; confirming a room in the
 * gallery reverses that (`'expanding'`) once the live room for the new
 * selection has mounted.
 */
export const RoomExperience = forwardRef<RoomExperienceHandle, RoomExperienceProps>(function RoomExperience(
  { onOpenWatch, onModeChange, onBalanceChange },
  ref,
) {
  const [gallery, setGallery] = useState<RoomGalleryItem[] | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [mode, setMode] = useState<Mode>('room')
  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('idle')
  const [centeredIndex, setCenteredIndex] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const transitionTimeoutRef = useRef<number | null>(null)
  const cozyLoftRef = useRef<CozyLoftRoomHandle>(null)
  const afterHoursRef = useRef<AfterHoursRoomHandle>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const galleryData = await fetchRoomGallery()
        if (cancelled) return
        setGallery(galleryData)
        setStatus('ready')
      } catch {
        if (cancelled) return
        setStatus('error')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Cleanup only — this effect never re-runs, it just guarantees a
  // pending transition timeout can't fire after unmount.
  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current !== null) window.clearTimeout(transitionTimeoutRef.current)
    }
  }, [])

  function closeGallery() {
    if (mode !== 'gallery') return
    // No API call — browsing without confirming leaves everything as it
    // was, including whichever room was already active.
    setMode('room')
    setActionError(null)
    onModeChange(false)
  }

  function toggleGallery() {
    if (mode === 'gallery') {
      closeGallery()
      return
    }

    if (!gallery) return
    const activeIndex = gallery.findIndex((room) => room.is_active)
    setCenteredIndex(activeIndex >= 0 ? activeIndex : 0)
    setActionError(null)
    setTransitionPhase('shrinking')
    transitionTimeoutRef.current = window.setTimeout(() => {
      setMode('gallery')
      setTransitionPhase('idle')
      onModeChange(true)
    }, TRANSITION_DURATION_MS)
  }

  function returnToActiveRoom() {
    closeGallery()
    cozyLoftRef.current?.returnToRoom()
    afterHoursRef.current?.returnToRoom()
  }

  useImperativeHandle(ref, () => ({ toggleGallery, closeGallery, returnToActiveRoom }))

  /** The hallway's "Lauruch Loft" destination — an in-world shortcut to
   * the exact same active-room switch the room gallery's own "Enter"
   * confirm already performs for an owned room (Lauruch Loft/Couple Home
   * is always owned), reusing selectActiveRoom directly rather than a
   * parallel navigation path. Mode/transition state stays untouched
   * (unlike handleConfirm) — this is a direct swap, not a gallery
   * browse-then-confirm flow. */
  async function handleNavigateToRoom(roomType: string) {
    try {
      const updated = await selectActiveRoom(roomType)
      setGallery(updated)
    } catch {
      // Best-effort: a failed in-world shortcut just leaves the couple in
      // After Hours — the room gallery remains the reliable fallback path
      // to switch rooms.
    }
  }

  async function handleConfirm(room: RoomGalleryItem) {
    if (room.is_active || isSubmitting) return
    setIsSubmitting(true)
    setActionError(null)
    try {
      const wasPurchase = !room.is_owned
      // Both endpoints return the same gallery shape the GET does — used
      // directly as the new state, no redundant refetch.
      const updated = room.is_owned ? await selectActiveRoom(room.room_type) : await purchaseRoom(room.room_type)
      setGallery(updated)
      // Only a real purchase spends Uchem — refetching after a plain
      // select-active would be harmless but pointless.
      if (wasPurchase) {
        const wallet = await fetchCoupleWallet()
        onBalanceChange(wallet.balance)
      }
      setMode('room')
      onModeChange(false)
      setTransitionPhase('expanding')
      transitionTimeoutRef.current = window.setTimeout(() => {
        setTransitionPhase('idle')
      }, TRANSITION_DURATION_MS)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (status === 'error') {
    return <p role="alert">Unable to load your rooms.</p>
  }

  if (status === 'loading' || !gallery) {
    return <div className={styles.loadingPlaceholder} />
  }

  const activeRoom = gallery.find((room) => room.is_active)

  return (
    <div className={`${styles.frame} ${transitionPhase !== 'idle' ? styles[transitionPhase] : ''}`}>
      {mode === 'room' && (
        <div className={styles.roomSlot}>
          {activeRoom?.room_type === 'couple_home' && <RoomCanvas onOpenWatch={onOpenWatch} />}
          {activeRoom?.room_type === 'cozy_loft' && <CozyLoftRoom ref={cozyLoftRef} onOpenWatch={onOpenWatch} />}
          {activeRoom?.room_type === 'after_hours' && (
            <AfterHoursRoom ref={afterHoursRef} onOpenWatch={onOpenWatch} onNavigateToRoom={handleNavigateToRoom} />
          )}
        </div>
      )}

      {mode === 'gallery' && (
        <RoomGallery
          rooms={gallery}
          centeredIndex={centeredIndex}
          onCenterChange={(index) => setCenteredIndex(Math.max(0, Math.min(gallery.length - 1, index)))}
          onConfirm={handleConfirm}
          isSubmitting={isSubmitting}
          error={actionError}
        />
      )}
    </div>
  )
})
