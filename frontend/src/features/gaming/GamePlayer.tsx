import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useExclusionZone } from '../presence/exclusionZone'
import { resolveGameLaunchUrl } from './launch'
import type { Game } from './types'
import styles from './GamePlayer.module.css'

// How long to wait for the iframe's own `load` event before treating the
// game as failed to start — a real network/DNS failure or a genuinely
// dead provider, not a normal "still fetching the game's own assets"
// delay. Measured directly (this session): all three games' own `load`
// events fire in ~1-3s under normal conditions, including across several
// rapid repeated reloads with no sign of rate-limiting — so this ceiling
// is deliberately several times more generous than the observed normal
// case, to absorb a slow ad-network round trip or a temporary network
// hiccup on the user's own side without misreporting it as broken. Raised
// from an initial 15s after a real (unreproduced) Physics Drop failure —
// 15s isn't unreasonably short for a healthy load, but ad-supported free
// embeds can occasionally take longer for reasons entirely outside this
// app's visibility; a genuinely dead provider still gets reported, just
// a little later.
const LOAD_TIMEOUT_MS = 25000

interface GamePlayerProps {
  game: Game
  /** Returns to the Gaming selector/catalog — NOT to the room. That's a
   * separate, existing control (RoomCloseUp's own "Back to Room"), which
   * this component has no involvement in and never duplicates. */
  onBackToGames: () => void
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

function measureRect(element: HTMLElement): Rect {
  const r = element.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

function rectsEqual(a: Rect | null, b: Rect): boolean {
  if (!a) return false
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

/**
 * The reusable shell for an actual playable game — one `<iframe>`
 * pointed at whatever `resolveGameLaunchUrl` resolves for this Game's
 * provider (see launch.ts), plus a loading state and a best-effort error
 * fallback. Also registers its own frame area as a presence exclusion
 * zone (see exclusionZone.ts) for as long as it's mounted, so Our Space
 * presence suspends while the real pointer is interacting inside it.
 *
 * TWO PRESENTATION MODES, ONE NEVER-REMOUNTED IFRAME:
 *
 * Environment mode (default) shows the game embedded in its normal spot
 * inside the room's close-up. Expanded mode blows it up to fill
 * essentially the whole application viewport. The hard requirement is
 * that the SAME `<iframe>` DOM node stays mounted across that toggle —
 * expanding/restoring must never restart the game or lose its state.
 *
 * That rules out the obvious-looking approach of conditionally wrapping
 * the frame in `createPortal(...)` only while expanded: React treats a
 * portal and a plain host element at the same tree position as different
 * fiber types, so toggling between them unmounts and remounts everything
 * inside — exactly the iframe reload this must avoid. Instead, this
 * component ALWAYS portals its real frame area to `document.body` (the
 * portal call itself never changes across renders), and only changes
 * that portaled container's OWN layout between the two modes:
 *
 * - An invisible anchor placeholder stays in this component's normal
 *   render position, using the exact same sizing classes `.frameArea`
 *   always used — so the surrounding room layout (including
 *   GamingActivity.module.css's `.activityWide` box) is completely
 *   unaffected by any of this.
 * - In environment mode, the portaled container is `position: fixed`
 *   with its `left/top/width/height` continuously matched to the
 *   anchor's own `getBoundingClientRect()` (already viewport-relative,
 *   so this is correct regardless of how many transformed ancestors sit
 *   between here and `<body>` — RoomCloseUp's close-up wrapper carries
 *   its own active transform, the same reason its "Back to Room" button
 *   already has to portal past it). This makes the portaled game LOOK
 *   embedded in the room even though it's a `<body>` sibling in the DOM.
 * - In expanded mode, the portaled container ignores the anchor and
 *   simply fills the viewport.
 *
 * Because the portal target and the iframe element itself never change
 * identity across Environment <-> Expanded <-> Restore, the exact same
 * DOM node persists the whole time — verified directly in
 * GamePlayer.test.tsx via a `===` reference check, not inferred from the
 * `src` attribute staying the same.
 *
 * KNOWN LIMITATION: an iframe's `onLoad` fires once its document
 * finishes loading, but a cross-origin page that refuses to be framed
 * (e.g. via an `X-Frame-Options`/CSP `frame-ancestors` restriction) can
 * still fire that same event with nothing usable actually rendered —
 * browsers give the parent page no reliable, standards-based way to
 * distinguish "loaded the real game" from "loaded a blocked/blank page"
 * for cross-origin content. The timeout below catches real network
 * failures and stalls; it cannot detect a provider-side embed
 * restriction. All three POC games were confirmed directly (this
 * session, in-browser) to embed and play successfully from this app's
 * own origin, so this is a documented edge case, not an observed one.
 */
export function GamePlayer({ game, onBackToGames }: GamePlayerProps) {
  // Starts 'loading' directly — GamingActivity always mounts a fresh
  // GamePlayer per game (never swaps `game` on an already-mounted
  // instance), so there's no "reset back to loading" case to handle here.
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [expanded, setExpanded] = useState(false)
  const launchUrl = resolveGameLaunchUrl(game)

  // Registers the portaled .frameArea (the box the iframe fills) as a
  // presence exclusion zone for as long as this player is mounted — see
  // exclusionZone.ts's own doc comment. Exclusion-zone registration only
  // cares about the element's real, measured rect, not where in the DOM
  // tree it lives, so portaling it doesn't affect this at all.
  const [frameAreaEl, setFrameAreaEl] = useState<HTMLDivElement | null>(null)
  useExclusionZone(frameAreaEl)

  const anchorRef = useRef<HTMLDivElement>(null)
  const [embeddedRect, setEmbeddedRect] = useState<Rect | null>(null)

  // Continuously mirrors the anchor's own on-screen box onto the portaled
  // container while in environment mode — a plain rAF loop (read +
  // compare + only setState on an actual change) rather than a one-shot
  // measurement, because the anchor sits inside RoomCloseUp's close-up
  // wrapper, which itself plays a one-time scale/opacity enter animation
  // on mount; a single "measure once after N ms" would visually snap
  // instead of tracking that animation. The comparison in rectsEqual
  // keeps this from re-rendering every frame once the box is settled.
  useLayoutEffect(() => {
    if (expanded) return
    let frameId: number
    function tick() {
      const anchor = anchorRef.current
      if (anchor) {
        const rect = measureRect(anchor)
        setEmbeddedRect((prev) => (rectsEqual(prev, rect) ? prev : rect))
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [expanded])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setStatus((current) => (current === 'loading' ? 'error' : current))
    }, LOAD_TIMEOUT_MS)
    return () => window.clearTimeout(timeoutId)
  }, [])

  const portalStyle: CSSProperties = expanded
    ? { position: 'fixed', inset: 0 }
    : embeddedRect
      ? {
          position: 'fixed',
          left: embeddedRect.left,
          top: embeddedRect.top,
          width: embeddedRect.width,
          height: embeddedRect.height,
        }
      : // Not measured yet (first paint) — stay off-screen rather than
        // flashing at (0,0) full-size for one frame.
        { position: 'fixed', left: -9999, top: -9999, width: 1, height: 1 }

  return (
    <div className={styles.player}>
      {/* Only rendered in environment mode — expanded mode's own portaled
          .expandedHeader below is the complete equivalent (Restore + Back
          to Games), and this component previously left this header
          mounted (just visually covered by the expanded overlay) while
          expanded, which left a redundant, focusable "Back to Games"
          reachable by keyboard/screen reader behind an opaque full-
          viewport overlay — not rendering it at all while expanded avoids
          that rather than trying to hide it with CSS alone. */}
      {!expanded && (
        <div className={styles.header}>
          <button type="button" className={styles.backButton} onClick={onBackToGames}>
            ‹ Back to Games
          </button>
          <span className={styles.gameName}>{game.name}</span>
          {status !== 'error' && (
            <button
              type="button"
              className={styles.expandButton}
              onClick={() => setExpanded(true)}
              aria-label="Expand game"
            >
              ⤢ Expand
            </button>
          )}
        </div>
      )}

      {/* Invisible placeholder occupying .frameArea's normal spot in the
          layout — the real frame area is always portaled (see this
          component's own doc comment above). Same sizing class as the
          portaled copy so GamingActivity's box math is unaffected. */}
      <div ref={anchorRef} className={styles.frameArea} style={{ visibility: 'hidden' }} aria-hidden="true" />

      {!expanded && game.attribution && (
        <a className={styles.attribution} href={game.attribution.url} target="_blank" rel="noopener noreferrer">
          {game.attribution.label}
        </a>
      )}

      {createPortal(
        <div className={expanded ? styles.expandedPortal : styles.embeddedPortal} style={portalStyle}>
          {expanded && (
            <div className={styles.expandedHeader}>
              <button type="button" className={styles.expandButton} onClick={() => setExpanded(false)}>
                ⤡ Restore
              </button>
              <span className={styles.gameName}>{game.name}</span>
              <button type="button" className={styles.backButton} onClick={onBackToGames}>
                ‹ Back to Games
              </button>
            </div>
          )}
          <div ref={setFrameAreaEl} className={styles.frameArea}>
            {status === 'loading' && <p className={styles.status}>Loading {game.name}…</p>}
            {status === 'error' && (
              <p className={styles.status} role="alert">
                {game.name} couldn't load right now. Check your connection and try again.
              </p>
            )}
            <iframe
              className={styles.frame}
              style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
              src={launchUrl}
              title={`${game.name} (embedded game)`}
              // Only what these HTML5 games actually need: fullscreen for
              // their own in-game fullscreen button. No camera/mic/
              // geolocation/payment or other unrelated permissions, and no
              // sandbox wildcard escape hatches — see this component's own
              // doc comment for the security posture this keeps.
              allow="fullscreen"
              allowFullScreen
              onLoad={() => setStatus('ready')}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
