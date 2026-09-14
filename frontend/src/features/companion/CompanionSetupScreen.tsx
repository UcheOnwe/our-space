import { useState } from 'react'
import { Button } from '../../components/shared/Button'
import { Card } from '../../components/shared/Card'
import styles from './CompanionSetupScreen.module.css'

const YOUTUBE_URL = 'https://www.youtube.com'
const DEV_INSTALL_URL = 'chrome://extensions'

/** The one small, self-contained "copy chrome://extensions" affordance —
 * not worth a shared component for a single use, per the approved plan's
 * "keep it subtle, don't over-engineer" direction. Browsers block a real
 * `<a href="chrome://extensions">` link from working at all, so copyable
 * text is the documented alternative rather than fighting that
 * restriction. */
function CopyableChromeUrl() {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(DEV_INSTALL_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied by the browser/OS — the URL is
      // still shown as selectable text right next to this button, so
      // there's always a manual fallback and nothing to surface as an
      // error here.
    }
  }

  return (
    <span className={styles.copyableUrl}>
      <code>{DEV_INSTALL_URL}</code>
      <button type="button" onClick={handleCopy} className={styles.copyButton}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </span>
  )
}

/** The same small cosmic-blob silhouette the extension itself renders (see
 * frontend/src/extension/companionView.ts's COMPANION_SVG) — kept as its
 * own separate copy here rather than shared at runtime, since this page
 * and the content script are two completely different bundles/documents
 * with no shared code path (see vite.extension.config.ts). Purely
 * decorative here, so it's inlined directly rather than given its own
 * component file. */
function CompanionPreview() {
  return (
    <svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true" className={styles.previewSvg}>
      <defs>
        <linearGradient id="companion-preview-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c98f8a" />
          <stop offset="100%" stopColor="#7a8450" />
        </linearGradient>
      </defs>
      <path
        d="M32 4C46 4 58 16 58 32C58 46 48 60 32 60C16 60 6 46 6 32C6 16 18 4 32 4Z"
        fill="url(#companion-preview-gradient)"
      />
      <circle cx="24" cy="30" r="4" fill="#2e2c28" />
      <circle cx="40" cy="30" r="4" fill="#2e2c28" />
    </svg>
  )
}

export function CompanionSetupScreen() {
  return (
    <div className={styles.screen}>
      <section className={styles.hero}>
        <CompanionPreview />
        <h1>Our Space Companion</h1>
        <p className={styles.tagline}>Our Space Companion brings your shared space onto supported websites.</p>
        <p className={styles.heroSubtext}>
          For this early proof-of-concept, only <strong>YouTube</strong> is supported.
        </p>
      </section>

      <Card className={styles.section}>
        <h2>How it works</h2>
        <p>
          Our Space Companion is a browser extension — it doesn't embed YouTube inside Our Space. Instead, it overlays
          your Space Companion directly onto the real youtube.com, so your shared space travels with you.
        </p>
        <ul>
          <li>A small companion appears floating over the page.</li>
          <li>Move it with W / A / S / D whenever you're not typing.</li>
          <li>Click the companion to select it — arrow keys work too while it's selected.</li>
          <li>Focus Mode hides the companion instantly, without ever touching YouTube's own interface.</li>
        </ul>
      </Card>

      <Card className={styles.section}>
        <h2>Desktop required</h2>
        <p>
          Our Space Companion is a desktop browser extension. Browser extensions aren't available on mobile browsers,
          so installation and use require a desktop computer running Chrome.
        </p>
      </Card>

      <Card className={styles.section}>
        <div className={styles.installHeader}>
          <h2>Install (development build)</h2>
          <span className={styles.betaBadge}>Development / Beta</span>
        </div>
        <p>
          Our Space Companion isn't published to the Chrome Web Store yet. For now, install it the same way any
          developer loads an unpacked extension:
        </p>
        <ol className={styles.steps}>
          <li>
            Open <CopyableChromeUrl /> — Chrome doesn't allow linking to this page directly, so copy/paste it into
            the address bar.
          </li>
          <li>Enable Developer mode (top-right toggle).</li>
          <li>Click &ldquo;Load unpacked&rdquo;.</li>
          <li>Select the Our Space extension directory (<code>extension/</code> in the project repository).</li>
          <li>Confirm &ldquo;Our Space Companion (Dev Build)&rdquo; is listed and enabled.</li>
          <li>Return to this page.</li>
          <li>Click &ldquo;Open YouTube&rdquo; below.</li>
        </ol>
      </Card>

      <Card className={styles.section}>
        <h2>Try it</h2>
        <p>Once the extension is loaded and enabled, open YouTube and look for your Space Companion.</p>
        <div className={styles.actions}>
          <Button onClick={() => window.open(YOUTUBE_URL, '_blank', 'noopener,noreferrer')}>Open YouTube</Button>
          {/* Future-safe slot for the real Chrome Web Store listing — see
              this button's own disabled state and title. Swapping this
              for a working "Get Our Space Companion" button once a store
              listing exists is the only change that section needs. */}
          <Button variant="secondary" disabled title="Coming soon — not published to the Chrome Web Store yet">
            Get Our Space Companion (Chrome Web Store — coming soon)
          </Button>
        </div>
      </Card>
    </div>
  )
}
