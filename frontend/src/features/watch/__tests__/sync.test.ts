import { describe, expect, it } from 'vitest'
import { estimatePosition, hasDrifted, shouldApplyRemoteState } from '../sync'

describe('hasDrifted', () => {
  it('is false for a small gap', () => {
    expect(hasDrifted(10, 11, 2)).toBe(false)
  })

  it('is true for a gap beyond the threshold', () => {
    expect(hasDrifted(10, 20, 2)).toBe(true)
  })
})

describe('estimatePosition', () => {
  it('stays put while paused, regardless of elapsed time', () => {
    expect(estimatePosition(10, Date.now() - 5000, false)).toBe(10)
  })

  it('advances with elapsed time while playing', () => {
    const anchorTimeMs = Date.now() - 3000
    const result = estimatePosition(10, anchorTimeMs, true)
    expect(result).toBeGreaterThanOrEqual(12.9)
    expect(result).toBeLessThanOrEqual(13.1)
  })
})

describe('shouldApplyRemoteState', () => {
  it('applies when the status differs', () => {
    const local = { status: 'paused' as const, position: 5 }
    const remote = { status: 'playing' as const, position: 5 }
    expect(shouldApplyRemoteState(local, remote)).toBe(true)
  })

  it('applies when the position has drifted beyond the threshold', () => {
    const local = { status: 'playing' as const, position: 5 }
    const remote = { status: 'playing' as const, position: 20 }
    expect(shouldApplyRemoteState(local, remote)).toBe(true)
  })

  it('does not apply for a matching, near-identical state', () => {
    const local = { status: 'playing' as const, position: 5 }
    const remote = { status: 'playing' as const, position: 5.5 }
    expect(shouldApplyRemoteState(local, remote)).toBe(false)
  })
})
