import { COMPANION_TYPES, isColorAllowedForCompanion } from '../companions/registry'
import type { ColorVariantId, CompanionTypeId } from '../companions/types'

/**
 * Runs ONLY on Our Space's own web app origin (see manifest.json's second
 * `content_scripts` entry) — never on youtube.com; that's a separate
 * bundle, contentScriptEntry.ts. Its one job: listen for the web app's
 * own `notifyExtensionOfEquippedCompanion` postMessage (see
 * frontend/src/features/companions/extensionSync.ts) and cache it in
 * `chrome.storage.local`, where the YouTube content script
 * (equippedCompanionStore.ts) reads it from — see that module's own doc
 * comment for why this indirection (postMessage + chrome.storage, never
 * a direct authenticated request from youtube.com to the backend) is the
 * safe mechanism here.
 *
 * Validates the message the same way equippedCompanionStore.ts validates
 * what it reads back out — belt-and-suspenders, since this is the one
 * place data crosses from "whatever postMessage handed us" to "something
 * every other content script in this extension will trust."
 */

interface CompanionEquippedMessage {
  source: 'our-space-web'
  type: 'companion-equipped'
  companionType: CompanionTypeId
  colorVariant: ColorVariantId
}

export function isCompanionEquippedMessage(data: unknown): data is CompanionEquippedMessage {
  if (!data || typeof data !== 'object') return false
  const candidate = data as Record<string, unknown>
  if (candidate.source !== 'our-space-web' || candidate.type !== 'companion-equipped') return false
  const companionType = candidate.companionType
  const colorVariant = candidate.colorVariant
  if (typeof companionType !== 'string' || typeof colorVariant !== 'string') return false
  if (!Object.hasOwn(COMPANION_TYPES, companionType)) return false
  return isColorAllowedForCompanion(companionType as CompanionTypeId, colorVariant as ColorVariantId)
}

window.addEventListener('message', (event) => {
  // Both checks matter: `source` confirms THIS window sent it (not some
  // embedded iframe or another script), `origin` confirms it's genuinely
  // this same site (postMessage's own `targetOrigin` argument restricts
  // who the SENDER will deliver to, not who this listener will accept
  // from — this check is what does that on the receiving side).
  if (event.source !== window) return
  if (event.origin !== window.location.origin) return
  if (!isCompanionEquippedMessage(event.data)) return

  if (typeof chrome === 'undefined' || !chrome.storage?.local) return
  chrome.storage.local.set({
    equippedCompanion: {
      companionType: event.data.companionType,
      colorVariant: event.data.colorVariant,
    },
  })
})
