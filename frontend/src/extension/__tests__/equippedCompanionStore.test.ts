import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readEquippedCompanion, watchEquippedCompanion } from '../equippedCompanionStore'

function stubChrome(overrides: Partial<typeof chrome> = {}): void {
  vi.stubGlobal('chrome', {
    runtime: { id: 'fake-extension-id' },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: { addListener: vi.fn() },
    },
    ...overrides,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readEquippedCompanion', () => {
  it('returns null when the extension APIs are unavailable (not a real extension context)', async () => {
    vi.stubGlobal('chrome', undefined)
    await expect(readEquippedCompanion()).resolves.toBeNull()
  })

  it('returns null when nothing has ever synced (empty storage)', async () => {
    stubChrome()
    await expect(readEquippedCompanion()).resolves.toBeNull()
  })

  it('returns the cached selection when it is a valid, currently-recognized Companion/color combination', async () => {
    stubChrome({
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            equippedCompanion: { companionType: 'mini_ufo', colorVariant: 'silver' },
          }),
          set: vi.fn(),
        },
        onChanged: { addListener: vi.fn() },
      },
    } as never)

    await expect(readEquippedCompanion()).resolves.toEqual({
      companionType: 'mini_ufo',
      colorVariant: 'silver',
    })
  })

  it('returns null for an unrecognized companion_type (e.g. a stale/removed id)', async () => {
    stubChrome({
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            equippedCompanion: { companionType: 'not-a-real-companion', colorVariant: 'silver' },
          }),
          set: vi.fn(),
        },
        onChanged: { addListener: vi.fn() },
      },
    } as never)

    await expect(readEquippedCompanion()).resolves.toBeNull()
  })

  it('returns null for a color not valid for that companion (e.g. a stale combination)', async () => {
    stubChrome({
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            // "midnight" is not curated for cosmic_blob.
            equippedCompanion: { companionType: 'cosmic_blob', colorVariant: 'midnight' },
          }),
          set: vi.fn(),
        },
        onChanged: { addListener: vi.fn() },
      },
    } as never)

    await expect(readEquippedCompanion()).resolves.toBeNull()
  })

  it('returns null (never throws) if chrome.storage.local.get rejects', async () => {
    stubChrome({
      storage: {
        local: {
          get: vi.fn().mockRejectedValue(new Error('boom')),
          set: vi.fn(),
        },
        onChanged: { addListener: vi.fn() },
      },
    } as never)

    await expect(readEquippedCompanion()).resolves.toBeNull()
  })
})

describe('watchEquippedCompanion', () => {
  beforeEach(() => {
    stubChrome()
  })

  it('calls onChange with a valid new value from a "local" area change', () => {
    const onChange = vi.fn()
    watchEquippedCompanion(onChange)

    const listener = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0]
    listener(
      { equippedCompanion: { newValue: { companionType: 'star_wisp', colorVariant: 'starlight' } } },
      'local',
    )

    expect(onChange).toHaveBeenCalledWith({ companionType: 'star_wisp', colorVariant: 'starlight' })
  })

  it('ignores changes to a different storage area', () => {
    const onChange = vi.fn()
    watchEquippedCompanion(onChange)

    const listener = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0]
    listener(
      { equippedCompanion: { newValue: { companionType: 'star_wisp', colorVariant: 'starlight' } } },
      'sync',
    )

    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores an invalid new value rather than passing it through', () => {
    const onChange = vi.fn()
    watchEquippedCompanion(onChange)

    const listener = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0]
    listener({ equippedCompanion: { newValue: { companionType: 'nonsense' } } }, 'local')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores changes unrelated to the equippedCompanion key', () => {
    const onChange = vi.fn()
    watchEquippedCompanion(onChange)

    const listener = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0]
    listener({ someOtherKey: { newValue: 'whatever' } }, 'local')

    expect(onChange).not.toHaveBeenCalled()
  })
})
