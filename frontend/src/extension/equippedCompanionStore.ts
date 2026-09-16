import { COMPANION_TYPES, isColorAllowedForCompanion } from '../companions/registry'
import type { ColorVariantId, CompanionTypeId } from '../companions/types'

/**
 * The extension's read-through cache of the authenticated user's
 * Companion selection — see extensionSync.ts (web app side) and
 * webAppBridgeEntry.ts (the content script that actually writes this)
 * for the full sync mechanism this is one half of.
 *
 * `chrome.storage.local` is per-EXTENSION, not per-page: whatever the web
 * app's bridge script writes here is readable by ANY of this extension's
 * own content scripts, including the one running on youtube.com,
 * regardless of which tab wrote it — that's what makes cross-tab sync
 * possible without a backend round-trip from the extension itself.
 *
 * Django/PostgreSQL's CompanionProfile remains the one authoritative
 * source of truth — this module only ever READS a cache the web app
 * populated from its own already-authoritative fetch; nothing here ever
 * writes a preference on its own initiative.
 */

const STORAGE_KEY = 'equippedCompanion'

export interface EquippedCompanion {
  companionType: CompanionTypeId
  colorVariant: ColorVariantId
}

function isValidEquippedCompanion(value: unknown): value is EquippedCompanion {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const companionType = candidate.companionType
  const colorVariant = candidate.colorVariant
  if (typeof companionType !== 'string' || typeof colorVariant !== 'string') return false
  if (!Object.hasOwn(COMPANION_TYPES, companionType)) return false
  return isColorAllowedForCompanion(companionType as CompanionTypeId, colorVariant as ColorVariantId)
}

/**
 * Reads the last-synced equipped Companion. Returns null — never
 * throws — when: the extension APIs aren't available (defensive; always
 * true in the real MV3 environment this runs in), nothing has EVER
 * synced on this browser yet (fresh install, or the web app was never
 * visited while signed in), or the cached value fails validation (e.g. a
 * stale cache referencing a Companion/color combination that no longer
 * exists in the current registry). Every one of those cases is meant to
 * fall back to the registry's own default — see contentScriptEntry.ts.
 */
export async function readEquippedCompanion(): Promise<EquippedCompanion | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id || !chrome.storage?.local) return null
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const value = result[STORAGE_KEY]
    return isValidEquippedCompanion(value) ? value : null
  } catch {
    return null
  }
}

/**
 * Subscribes to LIVE updates — fires whenever the web app's bridge script
 * writes a new selection, even while this YouTube tab is already open, no
 * reload required. Only ever calls `onChange` with an already-validated
 * value, the same guard `readEquippedCompanion` applies.
 */
export function watchEquippedCompanion(onChange: (equipped: EquippedCompanion) => void): void {
  if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return
    const change = changes[STORAGE_KEY]
    if (!change) return
    if (isValidEquippedCompanion(change.newValue)) onChange(change.newValue)
  })
}
