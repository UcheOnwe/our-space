import { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { createRoomLayers } from '../layers'

describe('createRoomLayers', () => {
  it('creates all six layers as children of the given parent, in back-to-front order', () => {
    const parent = new Container()
    const layers = createRoomLayers(parent)

    // furnitureBack/avatars/furnitureFront/lighting in that order — most
    // furniture sits behind the avatars, and the lamp's glow washes over
    // everything below it. See layers.ts for the full reasoning.
    expect(parent.children).toEqual([
      layers.environment,
      layers.furnitureBack,
      layers.avatars,
      layers.furnitureFront,
      layers.lighting,
      layers.effects,
    ])
  })

  it('labels each layer for easier debugging/inspection', () => {
    const layers = createRoomLayers(new Container())

    expect(layers.environment.label).toBe('room-environment')
    expect(layers.furnitureBack.label).toBe('room-furniture-back')
    expect(layers.avatars.label).toBe('room-avatars')
    expect(layers.furnitureFront.label).toBe('room-furniture-front')
    expect(layers.lighting.label).toBe('room-lighting')
    expect(layers.effects.label).toBe('room-effects')
  })

  it('parents every layer to the container it was given', () => {
    const parent = new Container()
    const layers = createRoomLayers(parent)

    for (const layer of Object.values(layers)) {
      expect(layer.parent).toBe(parent)
    }
  })

  it('makes the avatars layer Y-sortable, for the lamp/avatar depth ordering it also holds', () => {
    const layers = createRoomLayers(new Container())
    expect(layers.avatars.sortableChildren).toBe(true)
  })
})
