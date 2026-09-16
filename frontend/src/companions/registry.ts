import {
  buildCosmicBlobSvg,
  buildCosmicFlyerSvg,
  buildMiniUfoSvg,
  buildNovaGuardianSvg,
  buildStarWispSvg,
} from './companionShapes'
import { computeNovaGuardianPose } from './novaGuardianPose'
import type { NovaGuardianPose } from './novaGuardianPose'
import type { ColorVariantId, CompanionTypeId, Vector2 } from './types'

/**
 * The ONE shared Companion registry — the single source of truth the
 * approved plan's decision #5 asks for, consumed identically by the main
 * React app (features/companions/CompanionProfileScreen.tsx) and the
 * Chrome extension (extension/companionView.ts). Neither imports from the
 * other; both import from here.
 *
 * SVG-first hybrid, not a sprite-sheet system (decision #6): each
 * Companion is a small pure function (companionShapes.ts) returning SVG
 * markup, plus a CSS "personality" preset id applied by whichever runtime
 * is rendering it. The web app's preview implements all five
 * `AnimationPresetId` keyframes for its idle-only preview
 * (CompanionProfileScreen.module.css); the extension additionally reads
 * `computeDirectionalPose` (Nova Guardian only, for now) every animation
 * frame to drive REAL, movement-linked posing — see
 * novaGuardianPose.ts's own doc comment for why that's a separate, pure
 * module rather than logic embedded here.
 */

export interface ColorVariantDefinition {
  id: ColorVariantId
  label: string
  /** CSS-color-compatible hex string — the ONE place a Companion's color
   * becomes a real pixel value. The backend never sees or needs this
   * (companions/catalog.py only knows the identifiers), matching decision
   * #6: "Django should not own visual animation implementation." For
   * `default`, this is a representative swatch color only — the Cosmic
   * Blob's own builder ignores it and renders its true two-tone gradient
   * instead (see companionShapes.ts's buildCosmicBlobSvg). */
  hex: string
}

/** The full curated color palette across every Companion — Our Space's
 * existing warm palette (frontend/src/index.css) extended with a few new
 * cosmic accents. Product data for V1, not an economy/store system. Not
 * every color is available on every Companion — see
 * CompanionDefinition.allowedColors below. */
export const COLOR_VARIANTS: Record<ColorVariantId, ColorVariantDefinition> = {
  default: { id: 'default', label: 'Default', hex: '#c98f8a' },
  olive: { id: 'olive', label: 'Olive', hex: '#7a8450' },
  blush: { id: 'blush', label: 'Blush', hex: '#c98f8a' },
  starlight: { id: 'starlight', label: 'Starlight', hex: '#e8c468' },
  lavender: { id: 'lavender', label: 'Lavender', hex: '#9b8fc9' },
  sunset: { id: 'sunset', label: 'Sunset', hex: '#e08a52' },
  mint: { id: 'mint', label: 'Mint', hex: '#8fc9a8' },
  midnight: { id: 'midnight', label: 'Midnight', hex: '#4a4570' },
  silver: { id: 'silver', label: 'Silver', hex: '#b8b4a8' },
}

/** Which idle-animation keyframes (CompanionProfileScreen.module.css) a
 * Companion's live preview uses — the "simple distinct idle/movement
 * personality" decision #8 asks for. A named id, not raw CSS, so the
 * DECISION of which personality belongs to which Companion lives here
 * (shared, canonical) even though the keyframes achieving it are
 * implemented per-runtime. */
export type AnimationPresetId = 'float-drift' | 'soar-glide' | 'hover-wobble' | 'twinkle-dart' | 'hero-hover'

export interface CompanionDefinition {
  id: CompanionTypeId
  displayName: string
  description: string
  /** The curated colors THIS Companion supports — deliberately not every
   * color in COLOR_VARIANTS (decision #4: per-Companion availability, not
   * one universal palette). Order is display order. */
  allowedColors: ColorVariantId[]
  defaultColor: ColorVariantId
  animationPreset: AnimationPresetId
  /** Pure function: (chosen color id, chosen color's hex) -> complete SVG
   * markup. See companionShapes.ts. */
  buildSvgMarkup: (colorId: ColorVariantId, colorHex: string) => string
  /** OPTIONAL: pure function turning a movement direction into a full
   * semantic Companion pose (see novaGuardianPose.ts) — only Companions
   * whose flight needs more than a left/right flip define this; the
   * other four just mirror (see companionView.ts's `setFacingX`) and
   * leave this undefined. Typed directly to `NovaGuardianPose` since
   * Nova Guardian is the only Companion that needs directional posing
   * today — if a second one ever does, that's the point to factor out a
   * shared base shape, not before (no speculative generality). */
  computeDirectionalPose?: (direction: Vector2) => NovaGuardianPose
}

export const DEFAULT_COMPANION_TYPE: CompanionTypeId = 'cosmic_blob'

export const COMPANION_TYPES: Record<CompanionTypeId, CompanionDefinition> = {
  cosmic_blob: {
    id: 'cosmic_blob',
    displayName: 'Cosmic Blob',
    description: 'A squishy little nebula creature that loves to float and jiggle.',
    allowedColors: ['default', 'olive', 'blush', 'lavender'],
    defaultColor: 'default',
    animationPreset: 'float-drift',
    buildSvgMarkup: buildCosmicBlobSvg,
  },
  cosmic_flyer: {
    id: 'cosmic_flyer',
    displayName: 'Cosmic Flyer',
    description: 'A sleek starborne glider that banks and swoops.',
    allowedColors: ['sunset', 'mint', 'silver', 'starlight'],
    defaultColor: 'sunset',
    animationPreset: 'soar-glide',
    buildSvgMarkup: buildCosmicFlyerSvg,
  },
  mini_ufo: {
    id: 'mini_ufo',
    displayName: 'Mini UFO',
    description: 'A tiny saucer that hovers and wobbles in place.',
    allowedColors: ['silver', 'midnight', 'mint', 'lavender'],
    defaultColor: 'silver',
    animationPreset: 'hover-wobble',
    buildSvgMarkup: buildMiniUfoSvg,
  },
  star_wisp: {
    id: 'star_wisp',
    displayName: 'Star Wisp',
    description: 'A tiny extraterrestrial spark that twinkles and darts.',
    allowedColors: ['starlight', 'blush', 'lavender', 'sunset'],
    defaultColor: 'starlight',
    animationPreset: 'twinkle-dart',
    buildSvgMarkup: buildStarWispSvg,
  },
  nova_guardian: {
    id: 'nova_guardian',
    displayName: 'Nova Guardian',
    description: 'A cosmic guardian that snaps into a forward-flying pose the moment it takes off.',
    allowedColors: ['midnight', 'starlight', 'silver', 'sunset'],
    defaultColor: 'midnight',
    animationPreset: 'hero-hover',
    buildSvgMarkup: buildNovaGuardianSvg,
    computeDirectionalPose: computeNovaGuardianPose,
  },
}

export function getCompanionDefinition(id: CompanionTypeId): CompanionDefinition {
  return COMPANION_TYPES[id]
}

export function isColorAllowedForCompanion(companionId: CompanionTypeId, colorId: ColorVariantId): boolean {
  return COMPANION_TYPES[companionId].allowedColors.includes(colorId)
}
