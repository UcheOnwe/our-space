/**
 * Pure math for the analog joystick — no DOM, no React, no camera state.
 * Two separate concerns deliberately kept apart:
 *
 * `computeStickVector` — the CAMERA-FACING output: how fast/which way the
 * environment should move. Applies the dead zone and speed curve, so its
 * magnitude is 0 inside the dead zone and ramps smoothly to 1 at the
 * outer edge.
 *
 * `clampKnobPosition` — the KNOB's own VISUAL position: a plain geometric
 * clamp to the base's radius, with NO dead zone and NO speed curve. The
 * knob should visually track the finger all the way to the edge of the
 * base regardless of how the camera responds to it — conflating the two
 * would make small deliberate movements look like the knob isn't
 * responding, which is exactly the "does this thing work?" confusion a
 * dead zone is meant to avoid causing.
 */

export interface StickVector {
  /** Each component's magnitude is in [0, 1] after the dead zone and
   * speed curve are applied — NOT a discretized direction. The vector's
   * own angle is whatever `Math.atan2(dy, dx)` says, preserved exactly;
   * nothing here snaps to eight (or any number of) directions. */
  x: number
  y: number
}

/** Below this fraction of the base's radius, the stick reports zero
 * velocity — absorbs touchscreen jitter/noise around dead-center so a
 * thumb resting near the middle doesn't cause a slow drift. Deliberately
 * small: this is a jitter guard, not a real "safe zone" the user has to
 * push through before anything happens. */
export const STICK_DEAD_ZONE_RATIO = 0.12

/** Quadratic ease-in: small displacements move the camera slowly enough
 * for precise inspection, larger displacements ramp up smoothly to full
 * speed at the outer edge — the standard analog-stick response curve
 * (this exact exponent is a common baseline in game controller input
 * handling), rather than a linear "half displacement = half speed" feel
 * that reads as twitchy for fine inspection. */
const SPEED_CURVE_EXPONENT = 2

/**
 * `dx`/`dy` are the raw pointer offset from the stick base's own center,
 * in the same units as `maxRadius` (CSS px). Returns a vector whose
 * DIRECTION is the exact, continuous angle of that offset (every angle
 * from 0-360° is reachable, never snapped to a discrete direction) and
 * whose MAGNITUDE is the dead-zone-and-curve-adjusted "how fast" value in
 * [0, 1], for the caller to multiply by its own max speed.
 */
export function computeStickVector(
  dx: number,
  dy: number,
  maxRadius: number,
  deadZoneRatio: number = STICK_DEAD_ZONE_RATIO,
): StickVector {
  if (maxRadius <= 0) return { x: 0, y: 0 }
  const rawMagnitude = Math.hypot(dx, dy)
  if (rawMagnitude === 0) return { x: 0, y: 0 }

  const normalizedMagnitude = Math.min(1, rawMagnitude / maxRadius)
  if (normalizedMagnitude <= deadZoneRatio) return { x: 0, y: 0 }

  // Remaps [deadZoneRatio, 1] -> [0, 1] so the response starts at
  // genuinely zero right past the dead zone's own edge, rather than
  // jumping straight to whatever the raw normalized magnitude happened
  // to be there.
  const strength = (normalizedMagnitude - deadZoneRatio) / (1 - deadZoneRatio)
  const curvedStrength = strength ** SPEED_CURVE_EXPONENT

  const directionX = dx / rawMagnitude
  const directionY = dy / rawMagnitude
  return { x: directionX * curvedStrength, y: directionY * curvedStrength }
}

/** Geometric clamp only — see this file's own doc comment for why the
 * knob's visual position is never run through the dead zone/curve above. */
export function clampKnobPosition(dx: number, dy: number, maxRadius: number): { x: number; y: number } {
  const magnitude = Math.hypot(dx, dy)
  if (magnitude <= maxRadius || magnitude === 0) return { x: dx, y: dy }
  const scale = maxRadius / magnitude
  return { x: dx * scale, y: dy * scale }
}
