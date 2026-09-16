import type { ColorVariantId, CompanionTypeId } from '../../companions/types'

/**
 * Tells the Chrome extension (if installed) which Companion the
 * authenticated user currently has equipped, so the YouTube overlay can
 * render the right one — see extension/webAppBridgeEntry.ts, which is
 * the ONLY thing listening for this message.
 *
 * WHY postMessage, not a direct API call from the extension: Django's
 * session cookie is scoped to the backend's own origin, and a Chrome
 * MV3 content script's fetch() runs in the PAGE's origin (youtube.com),
 * not a privileged one — there is no CORS/cookie configuration that
 * safely lets a youtube.com script authenticate as this user without
 * either broadening the backend's CORS/cookie posture to trust
 * youtube.com (a real security posture change) or giving the extension
 * its own separate credential (extension authentication — explicitly out
 * of scope). Instead, the ALREADY-authenticated web app — this file,
 * running on Our Space's own origin, already trusted — is what relays
 * the preference outward, using two ordinary, sanctioned browser
 * mechanisms:
 *   1. `window.postMessage` to a content script the extension ALSO
 *      injects on this same origin (see extension/manifest.json's second
 *      `content_scripts` entry) — same-tab, same-origin, no new network
 *      request, nothing crosses an actual origin boundary here.
 *   2. That content script then writes to `chrome.storage.local`, a
 *      per-EXTENSION (not per-page) store any of the extension's own
 *      content scripts can read — including the one running on
 *      youtube.com, regardless of which tab wrote it.
 *
 * Persisted CompanionProfile in Postgres remains the one authoritative
 * source — this is a cache-population side effect of the web app talking
 * to its own already-authoritative backend, never a second place that
 * writes preferences on its own.
 *
 * Safe to call even if the extension isn't installed: with no listener,
 * this is a complete no-op — postMessage never throws for that.
 */
export function notifyExtensionOfEquippedCompanion(companionType: CompanionTypeId, colorVariant: ColorVariantId): void {
  window.postMessage(
    {
      source: 'our-space-web',
      type: 'companion-equipped',
      companionType,
      colorVariant,
    },
    window.location.origin,
  )
}
