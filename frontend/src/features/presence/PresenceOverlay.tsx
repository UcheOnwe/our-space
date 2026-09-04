import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useIsFullscreen } from '../../hooks/useIsFullscreen'
import { ClickRipple } from './ClickRipple'
import { DissolveEffect } from './DissolveEffect'
import { HugAnimation } from './HugAnimation'
import { MouseSpirit } from './MouseSpirit'
import { usePresence } from './PresenceContext'
import { computeSafeHugAnchor } from './sync'
import { FEATURE_LABELS } from './types'
import styles from './PresenceOverlay.module.css'

interface Point {
  x: number
  y: number
}

const CENTER: Point = { x: 0.5, y: 0.5 }
// How much of the remaining distance to the latest known partner position
// is closed each animation frame — lightweight easing, not a physics or
// animation engine, per the approved scope.
const SMOOTHING_FACTOR = 0.25
// How long the avatars take to glide to/from the Hug anchor. Applied as a
// CSS transition only for this window (see `hugTransitioning` below) —
// normal movement never gets a transition, so 1:1 cursor/tap tracking is
// completely unaffected outside a hug.
const HUG_TRANSITION_MS = 400
// "wait approximately 1 second" before dissolving over the video, per the
// approved design — avoids dissolving on a cursor just passing through.
const VIDEO_HOVER_DELAY_MS = 1000
const DISSOLVE_EFFECT_DURATION_MS = 550

interface PresenceOverlayProps {
  children: ReactNode
  /**
   * The real, measured video-player element (e.g. Watch Together's
   * `.playerWrapper`). Optional — Couple Home doesn't pass one, and
   * nothing here behaves differently when it's absent. Deliberately a DOM
   * element (updated via a state setter ref, not a plain `useRef`) so this
   * component correctly reacts once the element actually mounts — e.g.
   * only once a video has been loaded.
   */
  suppressZoneElement?: HTMLElement | null
}

/**
 * Wraps a screen's real content and adds a page-wide, non-blocking
 * presence layer on top of it — not a separate boxed "room". Two listeners
 * for movement/clicks, each with one clear job (see the clarification this
 * was built against): a window pointermove for continuous desktop
 * cursor-following, and one bubbling click handler for both "intentional
 * tap/click" effects (ripple) and mobile's only movement signal (a tap).
 * Native `click` already refuses to fire after a scroll/drag, on both
 * mouse and touch, so no manual distance/threshold tracking is needed to
 * tell a scroll from a tap.
 */
export function PresenceOverlay({ children, suppressZoneElement }: PresenceOverlayProps) {
  const {
    connectionStatus,
    selfAvatar,
    partner,
    activeInteraction,
    ripples,
    sendMove,
    sendClick,
    sendHug,
    sendVisibility,
  } = usePresence()
  const containerRef = useRef<HTMLDivElement>(null)
  const isFullscreen = useIsFullscreen()

  const [selfPos, setSelfPos] = useState<Point>(CENTER)
  const [displayedPartnerPos, setDisplayedPartnerPos] = useState<Point>(CENTER)
  const targetPartnerPosRef = useRef<Point>(CENTER)

  // Always-current mirrors of the two values above, read (not written) by
  // the Hug-anchor and dissolve-flourish effects — kept as refs purely so
  // those effects can depend on booleans alone (not re-run on every
  // position update) while still seeing up-to-date positions the moment
  // they fire. Refs are only meant to be touched outside of render, so
  // these are synced in their own effects rather than assigned directly in
  // the render body.
  const selfPosRef = useRef<Point>(CENTER)
  useEffect(() => {
    selfPosRef.current = selfPos
  }, [selfPos])
  const partnerPosRef = useRef<Point>(CENTER)
  useEffect(() => {
    partnerPosRef.current = displayedPartnerPos
  }, [displayedPartnerPos])

  // While non-null, both avatars render from this shared point instead of
  // their real positions — see the Hug-anchor effect below.
  // selfPos/displayedPartnerPos themselves are never written here, so
  // nothing about a hug ever reaches presence.move, the presence registry,
  // or the WebSocket protocol.
  const [hugAnchor, setHugAnchor] = useState<Point | null>(null)
  const [hugTransitioning, setHugTransitioning] = useState(false)

  // Local video-hover suppression: true once the pointer has rested inside
  // suppressZoneElement for VIDEO_HOVER_DELAY_MS, or while fullscreen.
  const [hoveringVideo, setHoveringVideo] = useState(false)
  const selfSuppressed = hoveringVideo || isFullscreen
  const [selfDissolveEffectAt, setSelfDissolveEffectAt] = useState<Point | null>(null)
  const [partnerDissolveEffectAt, setPartnerDissolveEffectAt] = useState<Point | null>(null)

  useEffect(() => {
    if (partner) {
      targetPartnerPosRef.current = { x: partner.x, y: partner.y }
    }
  }, [partner])

  // The interpolation loop: every frame, ease the displayed partner
  // position a bit closer to the latest value actually received over the
  // network, so ~20 updates/second reads as smooth motion, not steps.
  useEffect(() => {
    let frameId: number

    function tick() {
      setDisplayedPartnerPos((prev) => {
        const target = targetPartnerPosRef.current
        const dx = target.x - prev.x
        const dy = target.y - prev.y
        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return prev
        return { x: prev.x + dx * SMOOTHING_FACTOR, y: prev.y + dy * SMOOTHING_FACTOR }
      })
      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [])

  const isHugging = activeInteraction?.kind === 'hug'

  // Freezes a shared, edge-safe rendering position the instant a hug
  // starts (fixing the mobile case: a stale `selfPos` no longer means the
  // avatar hugs from far away — it visually glides to the anchor first),
  // and releases it the instant the hug ends. On desktop `selfPosRef` is
  // already at/near the partner when this runs (continuous pointer
  // tracking got it there before the click could happen at all), so the
  // computed anchor is nearly identical to where the avatar already was —
  // existing desktop behavior is preserved because there's nothing
  // meaningful to correct, not because of any platform-specific branch.
  useEffect(() => {
    if (isHugging) {
      setHugAnchor(computeSafeHugAnchor(selfPosRef.current, partnerPosRef.current))
      setHugTransitioning(true)
      return
    }

    setHugAnchor(null)
    const timeoutId = window.setTimeout(() => setHugTransitioning(false), HUG_TRANSITION_MS)
    return () => window.clearTimeout(timeoutId)
  }, [isHugging])

  // Desktop-only: hovering the real player region for ~1s dissolves the
  // LOCAL avatar. Attached directly to the real player element (not
  // inferred from cursor position against measured bounds) so this keeps
  // working even though the cursor stops being trackable the instant it's
  // over a cross-origin YouTube iframe — pointerenter/pointerleave on OUR
  // OWN wrapper element fire reliably regardless of what's rendered inside
  // it. Nothing here touches selfPos/movement tracking, which continues
  // normally underneath.
  useEffect(() => {
    if (!suppressZoneElement) return

    let hoverTimeoutId: number | null = null

    function handleEnter() {
      hoverTimeoutId = window.setTimeout(() => setHoveringVideo(true), VIDEO_HOVER_DELAY_MS)
    }
    function handleLeave() {
      if (hoverTimeoutId !== null) window.clearTimeout(hoverTimeoutId)
      setHoveringVideo(false)
    }

    suppressZoneElement.addEventListener('pointerenter', handleEnter)
    suppressZoneElement.addEventListener('pointerleave', handleLeave)
    return () => {
      if (hoverTimeoutId !== null) window.clearTimeout(hoverTimeoutId)
      suppressZoneElement.removeEventListener('pointerenter', handleEnter)
      suppressZoneElement.removeEventListener('pointerleave', handleLeave)
    }
  }, [suppressZoneElement])

  // Tells the partner (and shows our own dissolve flourish) whenever our
  // own suppressed state actually changes — not on every render. This is
  // the presence.visibility signal, kept entirely separate from
  // online/offline — see PresenceContext.tsx.
  const previousSelfSuppressedRef = useRef(selfSuppressed)
  useEffect(() => {
    if (previousSelfSuppressedRef.current === selfSuppressed) return
    previousSelfSuppressedRef.current = selfSuppressed
    sendVisibility(selfSuppressed ? 'video-hidden' : 'visible')

    const point = selfPosRef.current
    setSelfDissolveEffectAt(point)
    const timeoutId = window.setTimeout(() => setSelfDissolveEffectAt(null), DISSOLVE_EFFECT_DURATION_MS)
    return () => window.clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfSuppressed])

  // The partner's dissolve flourish, triggered by the same
  // presence.visibility-derived state that already drives their rendered
  // appearance. Guarded to only fire while they're actually online — a
  // presence.leave also resets `visible` back to true, and that transition
  // is sleeping, not a video reform, so it must not also play this.
  const previousPartnerVisibleRef = useRef(partner?.visible ?? true)
  useEffect(() => {
    if (!partner?.online) {
      previousPartnerVisibleRef.current = partner?.visible ?? true
      return
    }
    if (previousPartnerVisibleRef.current === partner.visible) return
    previousPartnerVisibleRef.current = partner.visible

    const point = partnerPosRef.current
    setPartnerDissolveEffectAt(point)
    const timeoutId = window.setTimeout(() => setPartnerDissolveEffectAt(null), DISSOLVE_EFFECT_DURATION_MS)
    return () => window.clearTimeout(timeoutId)
  }, [partner?.online, partner?.visible])

  const normalizedFromClient = useCallback((clientX: number, clientY: number): Point | null => {
    const container = containerRef.current
    if (!container) return null
    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
  }, [])

  // The ONE listener for continuous desktop movement. Window-level and
  // read-only — it never sits in any element's event path, so it can't
  // block a click on real UI underneath it. Touch is deliberately ignored
  // here: it has no persistent pointer, so its only movement signal is the
  // tap handled by handleClick below, not a dragging/scrolling finger.
  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (event.pointerType !== 'mouse') return
      const point = normalizedFromClient(event.clientX, event.clientY)
      if (point) {
        setSelfPos(point)
        sendMove(point.x, point.y)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [normalizedFromClient, sendMove])

  // Video controls always win: a click/tap landing inside the real player
  // bounds is never treated as a presence interaction — it passes through
  // untouched to the actual video controls underneath (play/pause, seek,
  // YouTube's own fullscreen button, ...).
  function isInsideSuppressZone(clientX: number, clientY: number): boolean {
    if (!suppressZoneElement) return false
    const rect = suppressZoneElement.getBoundingClientRect()
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  }

  // The ONE handler for "intentional interaction" anywhere on the screen.
  // A real browser `click` event — which the browser itself refuses to
  // fire after a scroll or drag, on both mouse and touch — so this is
  // already scroll-safe with no bookkeeping of our own. It fires AFTER
  // whatever was actually clicked has already handled the click (normal
  // DOM bubbling), so real buttons/links/cards (and the video player) keep
  // working exactly as before; this only adds presence effects on top, and
  // skips them entirely over the player. Clicking the partner's avatar
  // never reaches here — its own handler stops propagation, see below —
  // so it only ever produces a hug, never also a click ripple.
  function handleClick(event: ReactMouseEvent<HTMLDivElement>) {
    // event.detail is 0 for a keyboard-activated click (e.g. pressing
    // Enter on a focused button), which carries no meaningful pointer
    // position — skip presence effects for those rather than teleporting
    // the avatar to (0, 0).
    if (event.detail === 0) return
    if (isInsideSuppressZone(event.clientX, event.clientY)) return

    const point = normalizedFromClient(event.clientX, event.clientY)
    if (!point) return

    // Also moves the avatar here. On desktop this is a no-op-feeling
    // correction (the cursor was already tracked there via pointermove);
    // on touch it's the only movement signal there is, since there's no
    // persistent pointer to follow continuously.
    setSelfPos(point)
    sendMove(point.x, point.y)
    sendClick(point.x, point.y)
  }

  const partnerIsRight = displayedPartnerPos.x >= selfPos.x
  const selfLean = partnerIsRight ? 'right' : 'left' // self reaches toward the partner
  const partnerLean = partnerIsRight ? 'left' : 'right' // partner reaches toward self

  // What's actually rendered: the real position, unless a hug has frozen a
  // shared anchor in its place. selfPos/displayedPartnerPos keep updating
  // normally underneath the whole time either way.
  const selfRenderPos = hugAnchor ?? selfPos
  const partnerRenderPos = hugAnchor ?? displayedPartnerPos
  const avatarPositionClass = hugTransitioning ? styles.positionTransition : ''

  // Three distinct appearances, deliberately never collapsed into one
  // boolean: offline (sleeping/grayed-out) vs. online-but-video-hidden
  // (temporary dissolve) vs. fully active. See PresenceContext.tsx / the
  // Watch Together design notes for why these stay separate concepts.
  const partnerDissolved = partner != null && partner.online && !partner.visible
  const showLocationLabel = partner != null && !partner.online && partner.currentFeature != null
  const locationLabelText = partner?.currentFeature ? FEATURE_LABELS[partner.currentFeature] : null

  return (
    <div ref={containerRef} className={styles.container} onClick={handleClick}>
      {children}

      {/* pointer-events: none by default — see PresenceOverlay.module.css.
          This layer sits visually above the real UI without ever
          intercepting a click meant for it. */}
      <div className={styles.layer}>
        {connectionStatus !== 'open' && (
          <p className={styles.connectionNotice}>
            {connectionStatus === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
          </p>
        )}

        {ripples.map((ripple) => (
          <ClickRipple key={ripple.id} x={ripple.x} y={ripple.y} />
        ))}

        {partner && (
          <button
            type="button"
            className={[styles.avatarButton, avatarPositionClass, partnerDissolved ? styles.avatarDissolved : '']
              .filter(Boolean)
              .join(' ')}
            style={{ left: `${partnerRenderPos.x * 100}%`, top: `${partnerRenderPos.y * 100}%` }}
            onClick={(event) => {
              // The one hole punched back through the non-blocking layer
              // (pointer-events: auto in CSS) — stopping propagation here
              // is what keeps a hug-click from also bubbling up to
              // handleClick above and firing a redundant presence.click.
              event.stopPropagation()
              sendHug()
            }}
            aria-label={partner.online ? 'Hug your partner' : 'Partner is offline'}
          >
            <MouseSpirit
              variant={partner.avatar}
              online={partner.online}
              hugging={isHugging}
              leanTowards={partnerLean}
              label={partner.online ? 'Partner online' : 'Partner offline'}
            />
            {showLocationLabel && locationLabelText && (
              <span className={styles.locationLabel}>{locationLabelText}</span>
            )}
          </button>
        )}

        {selfAvatar && (
          <div
            className={[styles.avatar, avatarPositionClass, selfSuppressed ? styles.avatarDissolved : '']
              .filter(Boolean)
              .join(' ')}
            style={{ left: `${selfRenderPos.x * 100}%`, top: `${selfRenderPos.y * 100}%` }}
          >
            <MouseSpirit variant={selfAvatar} online hugging={isHugging} leanTowards={selfLean} label="You" />
          </div>
        )}

        {isHugging && <HugAnimation x={selfRenderPos.x} y={selfRenderPos.y} />}
        {selfDissolveEffectAt && <DissolveEffect x={selfDissolveEffectAt.x} y={selfDissolveEffectAt.y} />}
        {partnerDissolveEffectAt && (
          <DissolveEffect x={partnerDissolveEffectAt.x} y={partnerDissolveEffectAt.y} />
        )}
      </div>
    </div>
  )
}
