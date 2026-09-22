import { createPortal } from 'react-dom'
import styles from './PageScrollControls.module.css'

// A "useful amount" per screen, not a fixed pixel guess that reads
// differently on a small phone vs a tall desktop window — most of one
// viewport height reads as a deliberate, substantial page move without
// jumping so far the user loses their place entirely.
const SCROLL_STEP_FRACTION = 0.7

function scrollPage(direction: 1 | -1) {
  window.scrollBy({ top: direction * window.innerHeight * SCROLL_STEP_FRACTION, behavior: 'smooth' })
}

/**
 * An isolated, mobile-only "scroll the actual page" affordance — NOT
 * part of the camera/analog system in any way. It exists only because a
 * room preview/close-up fills nearly the whole mobile screen, leaving no
 * obvious surface to touch for ordinary page scroll.
 *
 * Deliberately separate from AnalogCameraControl: it never calls
 * `setStickVector`/`recenter`/any camera-related function, and the
 * camera system has no awareness this component exists. `window.
 * scrollBy` is the only thing either button does.
 *
 * Portaled + fixed so it stays reachable while the room fills the
 * screen — this is safe to do here specifically because it carries zero
 * camera state; the camera/analog cluster itself is NOT given this same
 * treatment (see AnalogCameraControl.module.css's own doc comment on why
 * it stays a plain absolutely-positioned descendant instead).
 */
export function PageScrollControls() {
  return createPortal(
    <div className={styles.cluster}>
      <button type="button" className={styles.button} onClick={() => scrollPage(-1)} aria-label="Scroll page up">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
      <button type="button" className={styles.button} onClick={() => scrollPage(1)} aria-label="Scroll page down">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
    </div>,
    document.body,
  )
}
