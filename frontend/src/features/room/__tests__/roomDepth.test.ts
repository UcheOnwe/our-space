import { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { syncFloorDepth } from '../roomDepth'

describe('syncFloorDepth', () => {
  it("sets the entity's zIndex to the given floor Y", () => {
    const entity = { container: new Container() }
    syncFloorDepth(entity, 745)
    expect(entity.container.zIndex).toBe(745)
  })

  it('updates zIndex again on a later call, for a moving entity', () => {
    const entity = { container: new Container() }
    syncFloorDepth(entity, 500)
    syncFloorDepth(entity, 800)
    expect(entity.container.zIndex).toBe(800)
  })
})

describe('PixiJS sortableChildren + zIndex (the mechanism this module relies on)', () => {
  // Not testing our own logic here — confirming the underlying engine
  // behavior this whole depth-sorting approach depends on, with real
  // (GPU-free) Container/zIndex, no renderer needed.
  it('draws the smaller-zIndex (farther back) entity before the larger one after sorting', () => {
    const parent = new Container()
    parent.sortableChildren = true

    const lamp = new Container({ label: 'lamp-group' })
    const avatar = new Container({ label: 'avatar' })
    parent.addChild(lamp, avatar)

    // Avatar's feet are ABOVE the lamp's own floor Y — farther back —
    // so it must end up BEFORE the lamp in draw order (behind it).
    syncFloorDepth({ container: lamp }, 700)
    syncFloorDepth({ container: avatar }, 500)
    parent.sortChildren()

    expect(parent.children.indexOf(avatar)).toBeLessThan(parent.children.indexOf(lamp))
  })

  it('reorders as the moving entity passes from behind to in front', () => {
    const parent = new Container()
    parent.sortableChildren = true

    const lamp = new Container({ label: 'lamp-group' })
    const avatar = new Container({ label: 'avatar' })
    parent.addChild(lamp, avatar)
    syncFloorDepth({ container: lamp }, 700)

    // Behind the lamp first.
    syncFloorDepth({ container: avatar }, 500)
    parent.sortChildren()
    expect(parent.children.indexOf(avatar)).toBeLessThan(parent.children.indexOf(lamp))

    // Now walks past it, further down-screen than the lamp's own floor Y.
    syncFloorDepth({ container: avatar }, 900)
    parent.sortChildren()
    expect(parent.children.indexOf(avatar)).toBeGreaterThan(parent.children.indexOf(lamp))
  })
})
