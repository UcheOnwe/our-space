import { describe, expect, it } from 'vitest'
import { ENVIRONMENT_TEXTURE_PATH, FURNITURE_PLACEMENTS, LAMP_BASE, LAMP_GLOW } from '../roomAssets'

// Every furniture piece the approved plan calls for placing into the
// backplate's held-out footprints — see roomAssets.ts. A missing key here
// means a piece silently isn't in the scene, not a loud failure (PixiJS
// asset loading is async/best-effort by design, same as the avatar rig),
// so this is the one place that catches it.
const EXPECTED_FURNITURE_KEYS = [
  'couch-base',
  'couch-blanket',
  'coffee-table',
  'tv',
  'bed',
  'desk',
  'chair',
]

// Pieces shipped on the shared 3072x2048 canvas (see roomAssets.ts) must
// render at the one shared world-unit size, not an independently-guessed
// number — that's the whole point of measuring them as a group. `bed` is
// the one deliberate exception: it lives in the bedroom alcove, which the
// master composition shows at a visibly smaller apparent scale than the
// main room's shared-canvas group — confirmed by measuring the master
// against the alcove's own doorway-frame width, a clean architectural
// reference the open-plan main room doesn't have. Forcing it to the
// shared size is exactly what caused it to protrude past the alcove's
// walls.
const SHARED_CANVAS_KEYS = ['couch-base', 'coffee-table', 'tv', 'desk']

describe('roomAssets', () => {
  it('points at the real production environment backplate', () => {
    expect(ENVIRONMENT_TEXTURE_PATH).toBe('/room/environment/room_environment_base.png')
  })

  it('includes every approved furniture piece exactly once', () => {
    const keys = FURNITURE_PLACEMENTS.map((piece) => piece.key)
    expect(new Set(keys).size).toBe(keys.length) // no duplicates
    for (const expectedKey of EXPECTED_FURNITURE_KEYS) {
      expect(keys).toContain(expectedKey)
    }
    expect(keys).toHaveLength(EXPECTED_FURNITURE_KEYS.length)
  })

  it('gives every furniture piece a real texture path, a positive world-unit size, and a floor position', () => {
    for (const piece of FURNITURE_PLACEMENTS) {
      expect(piece.texturePath).toMatch(/^\/room\/furniture\/furniture_.+\.png$/)
      expect(piece.width).toBeGreaterThan(0)
      expect(piece.height).toBeGreaterThan(0)
      expect(Number.isFinite(piece.position.x)).toBe(true)
      expect(Number.isFinite(piece.position.y)).toBe(true)
      expect(['back', 'front']).toContain(piece.layer)
    }
  })

  it('renders every piece on the shared 3072x2048 canvas at the one shared world-unit size', () => {
    // width/height are explicit world units (see FurniturePlacement's doc
    // comment in roomAssets.ts) — deliberately NOT derived from each
    // runtime texture's own pixel dimensions, so this stays a meaningful
    // check regardless of what resolution public/room/'s optimized PNGs
    // ship at.
    const sizes = SHARED_CANVAS_KEYS.map((key) => {
      const piece = FURNITURE_PLACEMENTS.find((candidate) => candidate.key === key)
      return { width: piece?.width, height: piece?.height }
    })
    for (const size of sizes) {
      expect(size).toEqual(sizes[0])
    }
  })

  it('sizes the bed independently, smaller than the shared group, to fit the bedroom alcove', () => {
    const bed = FURNITURE_PLACEMENTS.find((candidate) => candidate.key === 'bed')
    const sharedSize = FURNITURE_PLACEMENTS.find((candidate) => candidate.key === 'tv')
    expect(bed?.width).toBeLessThan(sharedSize!.width)
  })

  it('gives the lamp base and glow real texture paths, positive world-unit sizes, and finite positions', () => {
    for (const lampPiece of [LAMP_BASE, LAMP_GLOW]) {
      expect(lampPiece.texturePath).toMatch(/^\/room\/lighting\/lighting_lamp_.+\.png$/)
      expect(lampPiece.width).toBeGreaterThan(0)
      expect(lampPiece.height).toBeGreaterThan(0)
      expect(Number.isFinite(lampPiece.position.x)).toBe(true)
      expect(Number.isFinite(lampPiece.position.y)).toBe(true)
    }
  })

  it('positions the glow above (smaller world Y than) the base, matching where the lit shade actually is', () => {
    expect(LAMP_GLOW.position.y).toBeLessThan(LAMP_BASE.position.y)
  })

  it('orders the coffee table after desk/chair, so it renders in front of them where sprites overlap', () => {
    // Array order IS z-order within a layer (see loadFurniture in
    // RoomCanvas.tsx, and the comment above FURNITURE_PLACEMENTS) — the
    // coffee table sits nearer the viewer than the desk/chair grouping
    // against the back wall, so it must come later in this list or the
    // chair renders as if standing on the living-room table.
    const keys = FURNITURE_PLACEMENTS.map((piece) => piece.key)
    const coffeeTableIndex = keys.indexOf('coffee-table')
    expect(coffeeTableIndex).toBeGreaterThan(keys.indexOf('desk'))
    expect(coffeeTableIndex).toBeGreaterThan(keys.indexOf('chair'))
  })
})
