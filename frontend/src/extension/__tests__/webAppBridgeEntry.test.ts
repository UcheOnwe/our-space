import { describe, expect, it } from 'vitest'
import { isCompanionEquippedMessage } from '../webAppBridgeEntry'

describe('isCompanionEquippedMessage', () => {
  it('accepts a well-formed message with a valid companion/color combination', () => {
    expect(
      isCompanionEquippedMessage({
        source: 'our-space-web',
        type: 'companion-equipped',
        companionType: 'mini_ufo',
        colorVariant: 'silver',
      }),
    ).toBe(true)
  })

  it('rejects a message from the wrong source', () => {
    expect(
      isCompanionEquippedMessage({
        source: 'some-other-script',
        type: 'companion-equipped',
        companionType: 'mini_ufo',
        colorVariant: 'silver',
      }),
    ).toBe(false)
  })

  it('rejects a message with the wrong type', () => {
    expect(
      isCompanionEquippedMessage({
        source: 'our-space-web',
        type: 'something-else',
        companionType: 'mini_ufo',
        colorVariant: 'silver',
      }),
    ).toBe(false)
  })

  it('rejects an unrecognized companion_type', () => {
    expect(
      isCompanionEquippedMessage({
        source: 'our-space-web',
        type: 'companion-equipped',
        companionType: 'not-a-real-companion',
        colorVariant: 'silver',
      }),
    ).toBe(false)
  })

  it('rejects a color not valid for the given companion', () => {
    expect(
      isCompanionEquippedMessage({
        source: 'our-space-web',
        type: 'companion-equipped',
        companionType: 'cosmic_blob',
        colorVariant: 'midnight',
      }),
    ).toBe(false)
  })

  it('rejects null, undefined, and non-object data', () => {
    expect(isCompanionEquippedMessage(null)).toBe(false)
    expect(isCompanionEquippedMessage(undefined)).toBe(false)
    expect(isCompanionEquippedMessage('a string')).toBe(false)
    expect(isCompanionEquippedMessage(42)).toBe(false)
  })
})
