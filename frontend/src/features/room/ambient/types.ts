/**
 * One small, localized "the room feels alive" touch — a lamp flicker, an
 * LED strip breathing, a rare drifting petal. Deliberately NOT a particle
 * system or a generic effects engine: each spec is a single absolutely
 * positioned, CSS-animated shape, and a room declares a short list of
 * them (see afterHoursAmbience.ts) the same way it declares its
 * RoomHotspot list — small, explicit, and grounded in something actually
 * visible in that room's own artwork (see afterHoursAmbience.ts's own
 * comments for what each entry corresponds to).
 */
export interface AmbientEffectSpec {
  /** Stable id, unique within one room/close-up's own list — becomes the
   * React key. */
  id: string
  /** Which CSS shape/animation this renders as — see
   * AmbientEffectsLayer.module.css for exactly what each one looks like.
   * 'glow' = a soft radial blob (a lamp, a monitor, a screen).
   * 'strip' = a linear gradient bar (an LED strip along an edge).
   * 'flicker' = a glow with slightly irregular (not smooth-sine) timing,
   *   for a candle/lamp-like effect rather than a steady breathing light.
   * 'petal' = a single small drifting shape on a rare, slow cycle (the
   *   cherry blossom tree) — CSS-only, no JS timer. */
  variant: 'glow' | 'strip' | 'flicker' | 'petal'
  /** Center (glow/flicker/petal) or position (strip), as percentages of
   * the room/close-up's own world box (0-100) — same coordinate
   * convention RoomHotspot.position already uses, so effects and
   * hotspots line up against the same artwork without a second mapping. */
  xPercent: number
  yPercent: number
  /** Size as percentages of the world box. */
  widthPercent: number
  heightPercent: number
  /** CSS color (any valid color string) the glow/strip is tinted. */
  color: string
  /** One full breathing/flicker cycle, in ms. Deliberately varied per
   * instance (see the config files) so a room's effects don't pulse in
   * lockstep. */
  durationMs: number
  /** Offset into the cycle each instance starts at, in ms — the other half
   * of "don't pulse in lockstep." */
  delayMs: number
}
