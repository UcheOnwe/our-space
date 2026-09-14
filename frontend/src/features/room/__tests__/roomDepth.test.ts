import { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { computeAvatarDepthKey, syncFloorDepth } from '../roomDepth'

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

describe('computeAvatarDepthKey', () => {
  it('returns the plain floor Y unchanged while standing', () => {
    expect(computeAvatarDepthKey(700, 'standing', 'male')).toBe(700)
    expect(computeAvatarDepthKey(700, 'standing', 'female')).toBe(700)
  })

  it('returns the plain floor Y unchanged while sitting', () => {
    expect(computeAvatarDepthKey(615, 'sitting', 'male')).toBe(615)
    expect(computeAvatarDepthKey(615, 'sitting', 'female')).toBe(615)
  })

  it('nudges the female forward and the male back when lying, at the SAME floor Y', () => {
    const floorY = 350
    const maleDepth = computeAvatarDepthKey(floorY, 'lying', 'male')
    const femaleDepth = computeAvatarDepthKey(floorY, 'lying', 'female')

    // The locked V1 convention: female renders above/in front of male
    // where their sprites overlap on the bed.
    expect(femaleDepth).toBeGreaterThan(maleDepth)
  })

  it('keeps the lying nudge small enough to never override a genuinely different floor Y elsewhere in the room', () => {
    const bedFemaleDepth = computeAvatarDepthKey(350, 'lying', 'female')
    const standingElsewhereDepth = computeAvatarDepthKey(351, 'standing', 'male')
    // Even a 1-unit-larger real floor Y (an entirely different position)
    // must still sort after the bed — the lying bias is a tie-break for
    // an EXACT overlap, not a means of skipping the queue generally.
    expect(standingElsewhereDepth).toBeGreaterThan(bedFemaleDepth)
  })

  it('produces the correct front-to-back draw order when both are lying at the identical bed position', () => {
    const parent = new Container()
    parent.sortableChildren = true
    const male = new Container({ label: 'avatar-male' })
    const female = new Container({ label: 'avatar-female' })
    parent.addChild(male, female)

    const bedFloorY = 350
    syncFloorDepth({ container: male }, computeAvatarDepthKey(bedFloorY, 'lying', 'male'))
    syncFloorDepth({ container: female }, computeAvatarDepthKey(bedFloorY, 'lying', 'female'))
    parent.sortChildren()

    expect(parent.children.indexOf(female)).toBeGreaterThan(parent.children.indexOf(male))
  })
})
