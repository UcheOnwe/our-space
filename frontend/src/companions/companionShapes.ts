import type { ColorVariantId } from './types'

/**
 * One simple, hand-drawn inline-SVG silhouette per Companion type —
 * deliberately not a sprite-sheet/asset-pipeline system for V1 (see
 * registry.ts's own doc comment for why). Each function returns a
 * complete `<svg>...</svg>` markup string, so it can be dropped directly
 * into the DOM via `.innerHTML` (the extension's companionView.ts already
 * does this) or via `dangerouslySetInnerHTML` (the one place the React
 * preview uses it — see CompanionProfileScreen.tsx's own comment on why
 * that's safe here: the markup is entirely our own generated string,
 * never user input).
 *
 * Every builder takes `(colorId, colorHex)` — most only need `colorHex`
 * (a flat recolor), but `colorId` is passed to all of them uniformly so
 * ONE shape (currently just the Blob, for its "Default" style) can
 * special-case a specific color id without the shared `CompanionDefinition`
 * type needing a different `buildSvgMarkup` signature per entry.
 *
 * Every shape shares the same 64x64 viewBox — simple silhouettes, easy to
 * animate via CSS alone (see CompanionProfileScreen.module.css's
 * per-type idle-personality keyframes and content-script.css's matching
 * rules), not production-final art (see the approved product plan:
 * "does not need finalized production branding yet").
 */

const EYE_FILL = '#2e2c28'

/**
 * Cosmic Blob / Nebula Blob — the ORIGINAL, authoritative default
 * Companion design (the first one the extension ever shipped). Its own
 * "Default" style (`colorId === 'default'`) is this exact two-tone
 * gradient + two small sparkle accents + blinking eyes — NOT a flat
 * recolor, because that gradient treatment IS this Companion's real
 * identity and isn't expressible as a single hex value. Any OTHER chosen
 * color (olive/blush/lavender) is a deliberate, simpler flat recolor —
 * a genuine visual change the user opted into, not a second "default."
 *
 * The `our-space-companion-eye` class names are load-bearing, not
 * decorative — both content-script.css (extension) and
 * CompanionProfileScreen.module.css (`:global(...)`, web preview) target
 * this exact class to drive the same blink keyframe, which is how "the
 * Companion Profile preview and YouTube extension clearly represent the
 * same Cosmic Blob identity" actually holds true rather than just being
 * asserted in a comment.
 */
export function buildCosmicBlobSvg(colorId: ColorVariantId, colorHex: string): string {
  const isDefault = colorId === 'default'
  const bodyFill = isDefault ? 'url(#our-space-companion-gradient)' : colorHex

  return `
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      ${
        isDefault
          ? `<defs>
              <linearGradient id="our-space-companion-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#c98f8a" />
                <stop offset="100%" stop-color="#7a8450" />
              </linearGradient>
            </defs>
            <circle cx="10" cy="8" r="1.4" fill="#faf7f2" opacity="0.8" />
            <circle cx="54" cy="14" r="1" fill="#faf7f2" opacity="0.6" />`
          : ''
      }
      <path
        d="M32 4C46 4 58 16 58 32C58 46 48 60 32 60C16 60 6 46 6 32C6 16 18 4 32 4Z"
        fill="${bodyFill}"
      />
      <circle class="our-space-companion-eye" cx="24" cy="30" r="4" fill="${EYE_FILL}" />
      <circle class="our-space-companion-eye our-space-companion-eye--right" cx="40" cy="30" r="4" fill="${EYE_FILL}" />
    </svg>
  `
}

/** Cosmic Flyer — a sleek, wide-winged glider shape suggesting motion. */
export function buildCosmicFlyerSvg(_colorId: ColorVariantId, colorHex: string): string {
  return `
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <path
        d="M32 8 C40 8 60 24 60 34 C60 40 50 40 44 36 C40 44 36 52 32 58 C28 52 24 44 20 36 C14 40 4 40 4 34 C4 24 24 8 32 8 Z"
        fill="${colorHex}"
      />
      <circle cx="27" cy="28" r="3.2" fill="${EYE_FILL}" />
      <circle cx="37" cy="28" r="3.2" fill="${EYE_FILL}" />
    </svg>
  `
}

/** Mini UFO — a classic saucer-plus-dome silhouette with a cockpit window
 * and two small rim lights standing in for a face. */
export function buildMiniUfoSvg(_colorId: ColorVariantId, colorHex: string): string {
  return `
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <path d="M18 34 C18 20 46 20 46 34 Z" fill="${colorHex}" />
      <ellipse cx="32" cy="38" rx="28" ry="10" fill="${colorHex}" />
      <circle cx="32" cy="33" r="6" fill="#faf7f2" opacity="0.85" />
      <circle cx="14" cy="38" r="2.4" fill="${EYE_FILL}" />
      <circle cx="50" cy="38" r="2.4" fill="${EYE_FILL}" />
    </svg>
  `
}

/** Star Wisp — a tiny five-pointed starburst creature. */
export function buildStarWispSvg(_colorId: ColorVariantId, colorHex: string): string {
  return `
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <path
        d="M32 4 L38 24 L58 24 L42 36 L48 56 L32 44 L16 56 L22 36 L6 24 L26 24 Z"
        fill="${colorHex}"
      />
      <circle cx="27" cy="30" r="2.6" fill="${EYE_FILL}" />
      <circle cx="37" cy="30" r="2.6" fill="${EYE_FILL}" />
    </svg>
  `
}

/**
 * Nova Guardian — a simple humanoid alien/cosmic flyer, influenced only by
 * the classic forward-flying pose (arms/legs/cape trailing), never by any
 * particular character's copyrighted costume design. Built from a
 * handful of basic shapes (ellipses/rects/paths), not a detailed
 * illustration — "simple but readable," matching every other Companion
 * here, sized to fill noticeably more of its 64x64 box than the original
 * pass did (see novaGuardianPose.ts's own doc comment for why the first
 * version needed rebuilding — this file is the other half of that fix).
 *
 * NESTED HIERARCHY (this is the actual fix for "detached limbs"):
 *
 *   <svg>
 *     nova-guardian-wake            (MotionEffectsGroup — independent)
 *     nova-guardian-cape            (CapeGroup — independent)
 *       nova-guardian-cape-inner      (CSS-only secondary flutter)
 *     nova-guardian-mirror          (JS: scaleX, left/right facing)
 *       nova-guardian-bank            (JS: rotate, bounded diagonal lean)
 *         nova-guardian-body            (BodyGroup — data-pose-mode)
 *           nova-guardian-legs
 *           nova-guardian-trail-arm
 *           torso / chest crystal / head / eyes
 *           nova-guardian-lead-arm
 *
 * Arms/legs are CHILDREN of the body group now, not independent siblings
 * — they inherit the body's own mirror+bank transform automatically and
 * only need a small RELATIVE rotation of their own on top (see
 * companionView.ts's `setDirectionalPose`), which is what keeps them
 * visibly attached to the body at every angle instead of spinning around
 * their own pivot in place while the body moves independently.
 *
 * The cape and wake are deliberately OUTSIDE that mirror+bank stack,
 * each anchored at a fixed point close to the body's own visual center —
 * both are oriented directly from `trailDirection` (an absolute
 * direction, always exactly opposite travel) rather than inheriting the
 * body's mirrored/banked local frame, which is what makes both reliably
 * point the correct way regardless of which way the body itself is
 * currently facing/banked (see companionView.ts).
 *
 * The cape path is intentionally NOT the wide, symmetric "wings" shape
 * the first version used — it's narrower at the shoulder attachment and
 * widens only toward the bottom hem, reading as draped fabric rather
 * than a bat-wing spread, and stays that same shape whether idle
 * (hanging, gently swaying) or flying (the whole group rotated toward
 * `trailDirection` — see companionView.ts) — refinement: it does NOT
 * need a second, different "flying" shape to read as directional, since
 * rotating an already-narrow trailing shape away from straight-down is
 * what makes it look like it's streaming in the wind.
 *
 * Eyes reuse the SAME class (`our-space-companion-eye`) the Cosmic
 * Blob's own blink animation targets (see content-script.css /
 * CompanionProfileScreen.module.css) — safe to share, since it's a
 * generic scaleY keyframe with no Blob-specific geometry baked in, and
 * gives Nova Guardian real blinking with zero new CSS.
 */
export function buildNovaGuardianSvg(_colorId: ColorVariantId, colorHex: string): string {
  return `
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <g class="nova-guardian-wake" style="transform-origin: 32px 28px;">
        <line class="nova-guardian-speed-streak" x1="25" y1="22" x2="18" y2="46" stroke="${colorHex}" stroke-width="2.4" stroke-linecap="round" opacity="0" />
        <line class="nova-guardian-speed-streak" x1="32" y1="24" x2="32" y2="50" stroke="${colorHex}" stroke-width="2.4" stroke-linecap="round" opacity="0" />
        <line class="nova-guardian-speed-streak" x1="39" y1="22" x2="46" y2="46" stroke="${colorHex}" stroke-width="2.4" stroke-linecap="round" opacity="0" />
      </g>
      <g class="nova-guardian-cape" style="transform-box: fill-box; transform-origin: 50% 6%;">
        <g class="nova-guardian-cape-inner">
          <path
            d="M27 15 C18 21 14 36 17 54 C20 58 24 59 27 55 C27 43 28 29 32 20 C36 29 37 43 37 55 C40 59 44 58 47 54 C50 36 46 21 37 15 C34 18 30 18 27 15 Z"
            fill="${colorHex}"
            opacity="0.9"
          />
        </g>
      </g>
      <g class="nova-guardian-mirror" style="transform-box: fill-box; transform-origin: 50% 50%;">
        <g class="nova-guardian-bank" style="transform-box: fill-box; transform-origin: 50% 50%;">
          <g class="nova-guardian-body">
            <g class="nova-guardian-legs">
              <rect x="24" y="44" width="6" height="18" rx="3" fill="${colorHex}" />
              <rect x="34" y="44" width="6" height="18" rx="3" fill="${colorHex}" />
            </g>
            <g class="nova-guardian-trail-arm" style="transform-box: fill-box; transform-origin: 50% 10%;">
              <ellipse cx="19" cy="20" rx="5" ry="11" fill="${colorHex}" />
            </g>
            <ellipse cx="32" cy="31" rx="11" ry="15" fill="${colorHex}" />
            <path class="nova-guardian-crystal" d="M32 25 L36.5 30 L32 35 L27.5 30 Z" fill="#faf7f2" opacity="0.92" />
            <circle cx="32" cy="13" r="9" fill="${colorHex}" />
            <circle class="our-space-companion-eye" cx="28" cy="12" r="2.6" fill="#faf7f2" />
            <circle class="our-space-companion-eye our-space-companion-eye--right" cx="36" cy="12" r="2.6" fill="#faf7f2" />
            <g class="nova-guardian-lead-arm" style="transform-box: fill-box; transform-origin: 50% 10%;">
              <ellipse cx="45" cy="20" rx="5" ry="11" fill="${colorHex}" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  `
}
