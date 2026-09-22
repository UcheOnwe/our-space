import type { AmbientEffectSpec } from './types'

// Every entry below corresponds to something actually visible in the
// matching LaurUch close-up still (viewed directly). Durations/delays are
// hand-varied per entry so a room's effects never breathe in lockstep —
// see afterHoursAmbience.ts's own doc comment for the same convention.

/** tv-closeup.jpg: the TV close-up (a birthday-message screen, a lit
 * candle, and warm lamps). */
export const LAURUCH_TV_AMBIENT: AmbientEffectSpec[] = [
  { id: 'tv-screen-glow', variant: 'glow', xPercent: 50, yPercent: 25, widthPercent: 34, heightPercent: 24, color: '#ffb066', durationMs: 5000, delayMs: 0 },
  { id: 'candle-flicker', variant: 'flicker', xPercent: 30, yPercent: 73, widthPercent: 4, heightPercent: 8, color: '#ffb347', durationMs: 2600, delayMs: 600 },
  { id: 'lamp-flicker', variant: 'flicker', xPercent: 10, yPercent: 58, widthPercent: 8, heightPercent: 14, color: '#ffcf8a', durationMs: 4000, delayMs: 1600 },
]

/** desktop-closeup.jpg: the desk/monitor close-up. */
export const LAURUCH_DESKTOP_AMBIENT: AmbientEffectSpec[] = [
  { id: 'monitor-glow', variant: 'glow', xPercent: 48, yPercent: 32, widthPercent: 40, heightPercent: 30, color: '#ff8a5c', durationMs: 4800, delayMs: 0 },
  { id: 'laptop-glow', variant: 'glow', xPercent: 20, yPercent: 48, widthPercent: 14, heightPercent: 16, color: '#6fb7ff', durationMs: 4200, delayMs: 900 },
  { id: 'desk-lamp-flicker', variant: 'flicker', xPercent: 38, yPercent: 38, widthPercent: 6, heightPercent: 12, color: '#ffcf8a', durationMs: 3800, delayMs: 1800 },
]

/** kitchen-closeup.jpg: the LaurUch kitchen close-up (fridge with photos,
 * a lit shelf lamp, stove). */
export const LAURUCH_KITCHEN_AMBIENT: AmbientEffectSpec[] = [
  { id: 'shelf-lamp-flicker', variant: 'flicker', xPercent: 20, yPercent: 25, widthPercent: 8, heightPercent: 14, color: '#ffcf8a', durationMs: 4200, delayMs: 0 },
  { id: 'stove-glow', variant: 'glow', xPercent: 55, yPercent: 68, widthPercent: 14, heightPercent: 14, color: '#ffb066', durationMs: 5200, delayMs: 1400 },
]

/** door-closeup.jpg: the LaurUch front door close-up. */
export const LAURUCH_DOOR_AMBIENT: AmbientEffectSpec[] = [
  { id: 'shelf-candle-flicker', variant: 'flicker', xPercent: 78, yPercent: 62, widthPercent: 6, heightPercent: 10, color: '#ffb347', durationMs: 3400, delayMs: 0 },
  { id: 'entry-lamp-glow', variant: 'glow', xPercent: 22, yPercent: 55, widthPercent: 10, heightPercent: 14, color: '#ffcf8a', durationMs: 4600, delayMs: 1200 },
]

/** garage.jpg (animatedLauruch_...png): the LaurUch garage — hex LED
 * ceiling, pink/green neon couple logos on both walls, tail lights. */
export const LAURUCH_GARAGE_AMBIENT: AmbientEffectSpec[] = [
  { id: 'ceiling-hex-led', variant: 'strip', xPercent: 50, yPercent: 8, widthPercent: 46, heightPercent: 5, color: '#cfe8ff', durationMs: 5600, delayMs: 0 },
  { id: 'neon-logo-left', variant: 'glow', xPercent: 15, yPercent: 45, widthPercent: 14, heightPercent: 18, color: '#ff5ec4', durationMs: 4400, delayMs: 700 },
  { id: 'neon-logo-right', variant: 'glow', xPercent: 85, yPercent: 42, widthPercent: 14, heightPercent: 18, color: '#5cff8a', durationMs: 4400, delayMs: 2200 },
  { id: 'tail-light-glow', variant: 'glow', xPercent: 45, yPercent: 62, widthPercent: 12, heightPercent: 10, color: '#ff3b3b', durationMs: 3200, delayMs: 1500 },
]
