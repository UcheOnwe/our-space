import contentStyles from './content-script.css?raw'
import type { Vector2 } from './companionMovement'

/**
 * The one deliberately-simple default Space Companion — a small cosmic
 * blob with two eyes, drawn as inline SVG rather than a loaded image file.
 * No asset pipeline, no `web_accessible_resources` manifest entry needed
 * (Chrome would require one to let a page-loadable image URL work), and
 * trivially replaceable later: swap this string (or point `<image>` at a
 * real asset URL) without touching any of the movement/control-mode code
 * below, which only ever manipulates the wrapper elements around it.
 */
const COMPANION_SVG = `
  <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
    <defs>
      <linearGradient id="our-space-companion-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#c98f8a" />
        <stop offset="100%" stop-color="#7a8450" />
      </linearGradient>
    </defs>
    <circle cx="10" cy="8" r="1.4" fill="#faf7f2" opacity="0.8" />
    <circle cx="54" cy="14" r="1" fill="#faf7f2" opacity="0.6" />
    <path
      d="M32 4C46 4 58 16 58 32C58 46 48 60 32 60C16 60 6 46 6 32C6 16 18 4 32 4Z"
      fill="url(#our-space-companion-gradient)"
    />
    <circle class="our-space-companion-eye" cx="24" cy="30" r="4" fill="#2e2c28" />
    <circle class="our-space-companion-eye our-space-companion-eye--right" cx="40" cy="30" r="4" fill="#2e2c28" />
  </svg>
`

export interface CompanionViewCallbacks {
  /** Fired on click, or Enter/Space while the companion has keyboard
   * focus — contentScriptEntry.ts turns this into Companion Control Mode
   * activation. This view knows nothing about control mode itself, only
   * that "the companion was selected." */
  onCompanionActivate: () => void
  /** Fired on clicking the Focus Mode toggle — contentScriptEntry.ts owns
   * the actual FocusModeState transition; this view only reports the
   * click. */
  onFocusToggle: () => void
}

export interface CompanionView {
  /** Writes the companion's world position — called once per animation
   * frame from contentScriptEntry.ts's requestAnimationFrame loop. */
  setPosition(position: Vector2): void
  /** Flips the companion to face left/right. `facingX` is the horizontal
   * component of the current movement direction; 0 leaves the last
   * facing unchanged (an idle companion keeps facing whichever way it
   * last walked, rather than snapping back to a default). */
  setFacingX(facingX: number): void
  /** Swaps the idle float animation for the snappier "moving" bounce. */
  setMoving(isMoving: boolean): void
  /** Shows/hides the glow ring that signals Companion Control Mode. */
  setControlModeActive(isActive: boolean): void
  /** Hides the companion (Focus Mode) without touching the focus toggle
   * itself, which must stay visible as the restore control. */
  setFocusModeActive(isActive: boolean): void
}

/**
 * Builds the whole Our Space overlay (companion + Focus Mode toggle)
 * inside `shadowRoot` and wires up the DOM events `CompanionViewCallbacks`
 * cares about. Everything here is plain DOM — no React/PixiJS — since the
 * content script is a completely separate, tiny bundle from the main web
 * app (see vite.extension.config.ts) and pulling in a UI framework for one
 * blob and one button would be a lot of bundle weight for nothing.
 */
export function createCompanionView(shadowRoot: ShadowRoot, callbacks: CompanionViewCallbacks): CompanionView {
  const style = document.createElement('style')
  style.textContent = contentStyles
  shadowRoot.appendChild(style)

  const overlay = document.createElement('div')
  overlay.className = 'our-space-overlay'

  const companion = document.createElement('button')
  companion.type = 'button'
  companion.className = 'our-space-companion'
  companion.setAttribute('aria-label', 'Space Companion — select to control it with the arrow keys too')
  companion.innerHTML = `
    <span class="our-space-companion-ring"></span>
    <div class="our-space-companion-flip">
      <div class="our-space-companion-bob">${COMPANION_SVG}</div>
    </div>
  `
  companion.addEventListener('click', () => callbacks.onCompanionActivate())

  const focusToggle = document.createElement('button')
  focusToggle.type = 'button'
  focusToggle.className = 'our-space-focus-toggle'
  focusToggle.setAttribute('aria-pressed', 'false')
  focusToggle.setAttribute('aria-label', 'Toggle Focus Mode')
  focusToggle.innerHTML = `
    <span class="our-space-focus-toggle-dot"></span>
    <span class="our-space-focus-toggle-label">Focus Mode</span>
  `
  focusToggle.addEventListener('click', () => callbacks.onFocusToggle())

  overlay.append(companion, focusToggle)
  shadowRoot.appendChild(overlay)

  let lastNonZeroFacingX = -1 // faces left by default, matching the SVG's own resting eye layout

  return {
    setPosition(position) {
      companion.style.transform = `translate(${position.x}px, ${position.y}px)`
    },
    setFacingX(facingX) {
      if (facingX !== 0) lastNonZeroFacingX = facingX
      const flip = companion.querySelector<HTMLElement>('.our-space-companion-flip')
      if (flip) flip.style.transform = `scaleX(${lastNonZeroFacingX < 0 ? -1 : 1})`
    },
    setMoving(isMoving) {
      companion.classList.toggle('our-space-companion--moving', isMoving)
    },
    setControlModeActive(isActive) {
      companion.classList.toggle('our-space-companion--control-active', isActive)
    },
    setFocusModeActive(isActive) {
      companion.classList.toggle('our-space-companion--focus-hidden', isActive)
      focusToggle.classList.toggle('our-space-focus-toggle--focused', isActive)
      focusToggle.setAttribute('aria-pressed', String(isActive))
    },
  }
}
