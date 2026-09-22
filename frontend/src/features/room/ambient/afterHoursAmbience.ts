import type { AmbientEffectSpec } from './types'

// Every entry below corresponds to something actually visible in the
// matching After Hours source still (viewed directly, not guessed) —
// see AfterHoursRoom.tsx's own doc comment for the asset paths. Durations
// and delays are hand-varied per entry so a room's effects never breathe
// in lockstep (the approved "the entire room must not pulse together"
// constraint).

/** main-room.jpg: the main room, seen from the couch side. */
export const AFTER_HOURS_MAIN_AMBIENT: AmbientEffectSpec[] = [
  // The round paper pendant lamp hanging center-top.
  { id: 'pendant-lamp', variant: 'flicker', xPercent: 44, yPercent: 9, widthPercent: 7, heightPercent: 12, color: '#ffcf8a', durationMs: 4200, delayMs: 0 },
  // The anime-still TV screen on the media console.
  { id: 'tv-screen', variant: 'glow', xPercent: 57, yPercent: 27, widthPercent: 24, heightPercent: 30, color: '#6fb7ff', durationMs: 5200, delayMs: 600 },
  // The blue LED strip running under the TV console.
  { id: 'tv-console-led', variant: 'strip', xPercent: 59, yPercent: 48, widthPercent: 26, heightPercent: 4, color: '#4aa8ff', durationMs: 3800, delayMs: 1300 },
  // The lit table lamp beside the red couch, bottom-right.
  { id: 'side-lamp', variant: 'flicker', xPercent: 73, yPercent: 79, widthPercent: 8, heightPercent: 12, color: '#ffb066', durationMs: 3400, delayMs: 2000 },
  // The blue-lit gaming setup glimpsed through the open doorway, right.
  { id: 'gaming-room-glimpse', variant: 'glow', xPercent: 91, yPercent: 26, widthPercent: 10, heightPercent: 18, color: '#8a5cff', durationMs: 6000, delayMs: 900 },
  // The cherry blossom tree, top-left — a single rare drifting petal.
  { id: 'cherry-blossom-petal', variant: 'petal', xPercent: 12, yPercent: 8, widthPercent: 2, heightPercent: 3, color: '#ffb7d5', durationMs: 26000, delayMs: 4000 },
]

/** gaming-closeup.jpg: the desk setup close-up. */
export const AFTER_HOURS_GAMING_AMBIENT: AmbientEffectSpec[] = [
  // The dual monitors' own screen glow.
  { id: 'monitor-glow', variant: 'glow', xPercent: 43, yPercent: 32, widthPercent: 46, heightPercent: 34, color: '#6fb7ff', durationMs: 5000, delayMs: 0 },
  // The amber LED strip along the desk's front edge.
  { id: 'desk-led-strip', variant: 'strip', xPercent: 40, yPercent: 63, widthPercent: 50, heightPercent: 4, color: '#ffb347', durationMs: 3600, delayMs: 800 },
  // The PC case's own RGB glow, lower-center.
  { id: 'pc-rgb-glow', variant: 'glow', xPercent: 62, yPercent: 80, widthPercent: 14, heightPercent: 16, color: '#8a5cff', durationMs: 3000, delayMs: 1500 },
  // The small lamp to the left of the monitors.
  { id: 'desk-lamp', variant: 'flicker', xPercent: 30, yPercent: 45, widthPercent: 6, heightPercent: 10, color: '#ffcf8a', durationMs: 4400, delayMs: 2200 },
  // The neon rabbit sign, top-right shelf.
  { id: 'neon-sign', variant: 'glow', xPercent: 87, yPercent: 32, widthPercent: 8, heightPercent: 12, color: '#ff5ec4', durationMs: 4800, delayMs: 700 },
]

/** garage-closeup.jpg: the tuner garage close-up. */
export const AFTER_HOURS_GARAGE_AMBIENT: AmbientEffectSpec[] = [
  // The hexagonal LED panel array on the ceiling.
  { id: 'ceiling-hex-led', variant: 'strip', xPercent: 35, yPercent: 10, widthPercent: 46, heightPercent: 5, color: '#cfe8ff', durationMs: 5600, delayMs: 0 },
  // The matching hex LED panel array on the right wall.
  { id: 'wall-hex-led', variant: 'glow', xPercent: 80, yPercent: 45, widthPercent: 24, heightPercent: 30, color: '#cfe8ff', durationMs: 5000, delayMs: 1200 },
  // The nearer car's tail lights.
  { id: 'tail-light-glow', variant: 'glow', xPercent: 57, yPercent: 53, widthPercent: 10, heightPercent: 10, color: '#ff3b3b', durationMs: 3200, delayMs: 600 },
  // A faint reflection of the overhead LEDs on the glossy checkered floor.
  { id: 'floor-reflection', variant: 'glow', xPercent: 50, yPercent: 86, widthPercent: 30, heightPercent: 10, color: '#cfe8ff', durationMs: 6200, delayMs: 2400 },
]

/** tv-closeup.jpg: the dedicated TV close-up (a birthday-message screen,
 * candle, and two lamps). */
export const AFTER_HOURS_TV_AMBIENT: AmbientEffectSpec[] = [
  // The TV screen's own warm glow (a bright, warm-toned message graphic).
  { id: 'tv-screen-glow', variant: 'glow', xPercent: 50, yPercent: 28, widthPercent: 36, heightPercent: 26, color: '#ffb066', durationMs: 5000, delayMs: 0 },
  // The lit candle on the console.
  { id: 'candle-flicker', variant: 'flicker', xPercent: 42, yPercent: 72, widthPercent: 4, heightPercent: 8, color: '#ffb347', durationMs: 2600, delayMs: 500 },
  // The floor lamp, lower-left.
  { id: 'floor-lamp', variant: 'flicker', xPercent: 8, yPercent: 62, widthPercent: 8, heightPercent: 14, color: '#ffcf8a', durationMs: 4000, delayMs: 1400 },
  // The small lamp on the right shelf.
  { id: 'shelf-lamp', variant: 'flicker', xPercent: 88, yPercent: 55, widthPercent: 6, heightPercent: 10, color: '#ffcf8a', durationMs: 3600, delayMs: 2200 },
]

/** kitchen-closeup.jpg: the fridge/stove close-up. */
export const AFTER_HOURS_KITCHEN_AMBIENT: AmbientEffectSpec[] = [
  // The lit lamp on the shelf above the stove.
  { id: 'shelf-lamp', variant: 'flicker', xPercent: 28, yPercent: 22, widthPercent: 8, heightPercent: 14, color: '#ffcf8a', durationMs: 4200, delayMs: 0 },
  // A restrained warm glow near the stove itself.
  { id: 'stove-glow', variant: 'glow', xPercent: 78, yPercent: 58, widthPercent: 14, heightPercent: 16, color: '#ffb066', durationMs: 5200, delayMs: 1500 },
]

/** hallway-closeup.jpg: the neon hallway. */
export const AFTER_HOURS_HALLWAY_AMBIENT: AmbientEffectSpec[] = [
  // The ceiling neon strip's red half.
  { id: 'ceiling-neon-red', variant: 'glow', xPercent: 42, yPercent: 8, widthPercent: 26, heightPercent: 10, color: '#ff3d6b', durationMs: 4600, delayMs: 0 },
  // The ceiling neon strip's blue half.
  { id: 'ceiling-neon-blue', variant: 'glow', xPercent: 60, yPercent: 9, widthPercent: 24, heightPercent: 10, color: '#38d0ff', durationMs: 4600, delayMs: 2300 },
  // The left wall's zigzag neon trim.
  { id: 'left-wall-neon', variant: 'strip', xPercent: 10, yPercent: 50, widthPercent: 4, heightPercent: 70, color: '#ff3d6b', durationMs: 3800, delayMs: 900 },
  // The right wall's matching zigzag neon trim.
  { id: 'right-wall-neon', variant: 'strip', xPercent: 90, yPercent: 50, widthPercent: 4, heightPercent: 70, color: '#38d0ff', durationMs: 3800, delayMs: 1700 },
  // The neon's own reflection on the glossy floor.
  { id: 'floor-reflection', variant: 'glow', xPercent: 50, yPercent: 88, widthPercent: 36, heightPercent: 10, color: '#a24cff', durationMs: 5400, delayMs: 1100 },
]
