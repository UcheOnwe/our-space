import { describe, expect, it } from 'vitest'
import { arrowDirectionForKey, isEditableTarget, wasdDirectionForKey } from '../keyboardInput'

describe('wasdDirectionForKey', () => {
  it('maps lowercase and uppercase w/a/s/d to the four directions', () => {
    expect(wasdDirectionForKey('w')).toBe('up')
    expect(wasdDirectionForKey('W')).toBe('up')
    expect(wasdDirectionForKey('a')).toBe('left')
    expect(wasdDirectionForKey('s')).toBe('down')
    expect(wasdDirectionForKey('d')).toBe('right')
  })

  it('returns null for arrow keys and unrelated keys', () => {
    expect(wasdDirectionForKey('ArrowUp')).toBeNull()
    expect(wasdDirectionForKey('f')).toBeNull()
    expect(wasdDirectionForKey('Enter')).toBeNull()
  })
})

describe('arrowDirectionForKey', () => {
  it('maps all four arrow keys', () => {
    expect(arrowDirectionForKey('ArrowUp')).toBe('up')
    expect(arrowDirectionForKey('ArrowDown')).toBe('down')
    expect(arrowDirectionForKey('ArrowLeft')).toBe('left')
    expect(arrowDirectionForKey('ArrowRight')).toBe('right')
  })

  it('returns null for WASD and unrelated keys — this function never decides whether arrows are ALLOWED, only what they mean', () => {
    expect(arrowDirectionForKey('w')).toBeNull()
    expect(arrowDirectionForKey('Escape')).toBeNull()
  })
})

describe('isEditableTarget', () => {
  it('is true for input, textarea, and select elements', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true)
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableTarget(document.createElement('select'))).toBe(true)
  })

  it('is true for a contentEditable element (YouTube comments/search use this)', () => {
    const div = document.createElement('div')
    // Set via the attribute rather than the `contentEditable` IDL
    // property — jsdom doesn't compute `isContentEditable` (a known jsdom
    // limitation), so this exercises the same `[contenteditable="true"]`
    // attribute match a real browser's own contentEditable elements carry
    // too, rather than relying on jsdom's incomplete implementation.
    div.setAttribute('contenteditable', 'true')
    expect(isEditableTarget(div)).toBe(true)
  })

  it('is true for a descendant of a contentEditable ancestor', () => {
    const editableParent = document.createElement('div')
    editableParent.setAttribute('contenteditable', 'true')
    const span = document.createElement('span')
    editableParent.appendChild(span)
    expect(isEditableTarget(span)).toBe(true)
  })

  it('is false for ordinary page elements', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(document.createElement('button'))).toBe(false)
  })

  it('is false for null or a non-Element target', () => {
    expect(isEditableTarget(null)).toBe(false)
  })
})
