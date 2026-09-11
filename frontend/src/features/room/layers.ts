import { Container } from 'pixi.js'

/**
 * The room's fixed back-to-front render order. Every room element —
 * background art, furniture sprites, the lamp's light overlay, the two
 * Room Avatars, particle/effect flourishes — attaches to one of these, so
 * draw order stays correct without any per-object z-index bookkeeping.
 *
 * `furnitureBack`/`furnitureFront` split around `avatars` on purpose: most
 * furniture sits behind the avatars (a couch/bed/desk they stand in front
 * of), but this slice's flat furniture placement doesn't yet need anything
 * in `furnitureFront` — it exists now specifically so a later slice can
 * put a piece that should visually occlude a standing/seated avatar (e.g.
 * a table edge nearer the camera) in front of them without a scene-graph
 * restructure at that point. `lighting` renders after both furniture
 * layers and avatars — used by effects that should always wash over the
 * whole room regardless of depth (e.g. the TV's hover glow).
 *
 * `avatars` is also where every OTHER depth-relevant movable/dynamic
 * entity lives — currently the lamp (base+glow, grouped — see
 * roomDepth.ts and RoomCanvas.tsx) alongside the two Room Avatars — not
 * just avatars despite the name. `sortableChildren = true` (set in
 * createRoomLayers below) means whatever's added here draws back-to-front
 * by its own `zIndex` rather than by insertion order, which is what lets a
 * walking avatar's depth relative to the lamp change naturally instead of
 * one of them always being permanently in front (see roomDepth.ts).
 */
export interface RoomLayers {
  environment: Container
  furnitureBack: Container
  avatars: Container
  furnitureFront: Container
  lighting: Container
  effects: Container
}

/**
 * Creates the six room layers, in order, and appends them to `parent`
 * (the camera-transformed "world" container — see RoomCanvas.tsx).
 *
 * `Container` is a plain PixiJS scene-graph node with no rendering of its
 * own — creating and nesting them doesn't touch WebGL or a real canvas at
 * all, which is what keeps this function unit-testable outside a browser.
 */
export function createRoomLayers(parent: Container): RoomLayers {
  const environment = new Container({ label: 'room-environment' })
  const furnitureBack = new Container({ label: 'room-furniture-back' })
  const avatars = new Container({ label: 'room-avatars' })
  // See the interface doc comment above — this layer's children draw in
  // zIndex order (floor Y), not insertion order.
  avatars.sortableChildren = true
  const furnitureFront = new Container({ label: 'room-furniture-front' })
  const lighting = new Container({ label: 'room-lighting' })
  const effects = new Container({ label: 'room-effects' })

  parent.addChild(environment, furnitureBack, avatars, furnitureFront, lighting, effects)

  return { environment, furnitureBack, avatars, furnitureFront, lighting, effects }
}
