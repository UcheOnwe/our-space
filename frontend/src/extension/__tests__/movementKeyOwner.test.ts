import { describe, expect, it, vi } from 'vitest'
import { createMovementKeyOwner } from '../movementKeyOwner'

function dispatchKeydown(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

function dispatchKeyup(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }))
}

describe('createMovementKeyOwner', () => {
  it('tracks WASD as active directions regardless of control mode', () => {
    const owner = createMovementKeyOwner(window, () => false, vi.fn())
    dispatchKeydown(document.body, 'w')
    expect(owner.getActiveDirections()).toEqual(new Set(['up']))
    owner.detach()
  })

  it('ignores arrow keys while Control Mode is inactive', () => {
    const owner = createMovementKeyOwner(window, () => false, vi.fn())
    dispatchKeydown(document.body, 'ArrowUp')
    expect(owner.getActiveDirections().size).toBe(0)
    owner.detach()
  })

  it('includes arrow keys once Control Mode is active', () => {
    const owner = createMovementKeyOwner(window, () => true, vi.fn())
    dispatchKeydown(document.body, 'ArrowUp')
    expect(owner.getActiveDirections()).toEqual(new Set(['up']))
    owner.detach()
  })

  it('never adds a direction, or preventDefaults, while typing in an editable field — even with Control Mode active', () => {
    const owner = createMovementKeyOwner(window, () => true, vi.fn())
    const input = document.createElement('input')
    document.body.appendChild(input)

    const wEvent = dispatchKeydown(input, 'w')
    expect(owner.getActiveDirections().size).toBe(0)
    expect(wEvent.defaultPrevented).toBe(false)

    const arrowEvent = dispatchKeydown(input, 'ArrowUp')
    expect(owner.getActiveDirections().size).toBe(0)
    expect(arrowEvent.defaultPrevented).toBe(false)

    input.remove()
    owner.detach()
  })

  it('calls onEscape only while Control Mode is active, and never preventDefaults it (YouTube may use Escape too, e.g. exiting fullscreen)', () => {
    let controlModeActive = false
    const onEscape = vi.fn()
    const owner = createMovementKeyOwner(window, () => controlModeActive, onEscape)

    const inactiveEvent = dispatchKeydown(document.body, 'Escape')
    expect(onEscape).not.toHaveBeenCalled()
    expect(inactiveEvent.defaultPrevented).toBe(false)

    controlModeActive = true
    const activeEvent = dispatchKeydown(document.body, 'Escape')
    expect(onEscape).toHaveBeenCalledOnce()
    expect(activeEvent.defaultPrevented).toBe(false)

    owner.detach()
  })

  it('clears all held directions on window blur (e.g. alt-tab while a key is held)', () => {
    const owner = createMovementKeyOwner(window, () => true, vi.fn())
    dispatchKeydown(document.body, 'w')
    dispatchKeydown(document.body, 'ArrowRight')
    expect(owner.getActiveDirections().size).toBe(2)

    window.dispatchEvent(new Event('blur'))

    expect(owner.getActiveDirections().size).toBe(0)
    owner.detach()
  })

  it('removes a direction on keyup', () => {
    const owner = createMovementKeyOwner(window, () => false, vi.fn())
    dispatchKeydown(document.body, 'd')
    expect(owner.getActiveDirections()).toEqual(new Set(['right']))
    dispatchKeyup(document.body, 'd')
    expect(owner.getActiveDirections().size).toBe(0)
    owner.detach()
  })

  it('stops listening after detach()', () => {
    const owner = createMovementKeyOwner(window, () => false, vi.fn())
    owner.detach()
    dispatchKeydown(document.body, 'w')
    expect(owner.getActiveDirections().size).toBe(0)
  })

  // Regression tests for the FIRST round of the reported bug: with
  // Control Mode active, YouTube kept reacting to the same arrow keys
  // (seeking, volume, Shorts navigation) even though `preventDefault()`
  // was already being called. `preventDefault()` alone never stops
  // ANOTHER listener from running — only `stopPropagation()` (called
  // during capture, before YouTube's own bubble-phase listener ever
  // fires) does. See movementKeyOwner.ts's own top-level doc comment for
  // the full explanation of why capture phase is what makes this
  // reliable. (See the "second round" describe block below for the
  // follow-up fix — capture phase alone wasn't enough either.)
  describe('arrow-key exclusivity while Control Mode is active', () => {
    it('claims the arrow key before it can reach a page-level bubble listener (simulating YouTube)', () => {
      let youtubeReacted = false
      const youtubeHandler = (event: Event) => {
        if ((event as KeyboardEvent).key === 'ArrowUp') youtubeReacted = true
      }
      document.addEventListener('keydown', youtubeHandler)

      const owner = createMovementKeyOwner(window, () => true, vi.fn())
      const event = dispatchKeydown(document.body, 'ArrowUp')

      // The core regression check: YouTube's simulated handler must never
      // run at all — not just have its default action suppressed.
      expect(youtubeReacted).toBe(false)
      expect(event.defaultPrevented).toBe(true)
      expect(owner.getActiveDirections()).toEqual(new Set(['up']))

      document.removeEventListener('keydown', youtubeHandler)
      owner.detach()
    })

    it('leaves the page-level bubble listener (simulating YouTube) completely untouched while Control Mode is inactive', () => {
      let youtubeReacted = false
      const youtubeHandler = (event: Event) => {
        if ((event as KeyboardEvent).key === 'ArrowUp') youtubeReacted = true
      }
      document.addEventListener('keydown', youtubeHandler)

      const owner = createMovementKeyOwner(window, () => false, vi.fn())
      const event = dispatchKeydown(document.body, 'ArrowUp')

      expect(youtubeReacted).toBe(true)
      expect(event.defaultPrevented).toBe(false)

      document.removeEventListener('keydown', youtubeHandler)
      owner.detach()
    })

    it('never claims WASD away from a page-level bubble listener, even while Control Mode is active — no conflict exists, so nothing should be blocked', () => {
      let pageReacted = false
      const pageHandler = (event: Event) => {
        if ((event as KeyboardEvent).key === 'w') pageReacted = true
      }
      document.addEventListener('keydown', pageHandler)

      const owner = createMovementKeyOwner(window, () => true, vi.fn())
      const event = dispatchKeydown(document.body, 'w')

      expect(pageReacted).toBe(true)
      expect(event.defaultPrevented).toBe(false)

      document.removeEventListener('keydown', pageHandler)
      owner.detach()
    })
  })

  // Regression tests for the SECOND round of this bug: capture phase
  // alone still lost to YouTube on Shorts specifically. Root cause:
  // capture-phase listeners on the SAME node (window) still run in
  // registration order among themselves, and YouTube's own listener was
  // realistically winning that race. The real fix for THAT half is
  // contentScriptEntry.ts attaching at `run_at: "document_start"` (not
  // unit-testable — it's about when Chrome injects relative to the page's
  // own scripts, not something jsdom simulates); this module's own half
  // is upgrading to `stopImmediatePropagation()`, which is what the test
  // below actually proves — it constructs the ONE scenario plain
  // `stopPropagation()` provably can't handle: another listener on the
  // exact same node, `window`, in the same capture phase.
  describe('arrow-key exclusivity (second round — stopImmediatePropagation)', () => {
    it('consumes ArrowDown exclusively when Control Mode is active — the exact reported Shorts scenario', () => {
      let youtubeReacted = false
      const youtubeHandler = (event: Event) => {
        if ((event as KeyboardEvent).key === 'ArrowDown') youtubeReacted = true
      }
      document.addEventListener('keydown', youtubeHandler)

      const owner = createMovementKeyOwner(window, () => true, vi.fn())
      const event = dispatchKeydown(document.body, 'ArrowDown')

      expect(owner.getActiveDirections()).toEqual(new Set(['down']))
      expect(youtubeReacted).toBe(false)
      expect(event.defaultPrevented).toBe(true)

      document.removeEventListener('keydown', youtubeHandler)
      owner.detach()
    })

    it('does not consume ArrowDown while Control Mode is inactive — YouTube keeps its normal arrow behavior', () => {
      let youtubeReacted = false
      const youtubeHandler = (event: Event) => {
        if ((event as KeyboardEvent).key === 'ArrowDown') youtubeReacted = true
      }
      document.addEventListener('keydown', youtubeHandler)

      const owner = createMovementKeyOwner(window, () => false, vi.fn())
      const event = dispatchKeydown(document.body, 'ArrowDown')

      expect(owner.getActiveDirections().size).toBe(0)
      expect(youtubeReacted).toBe(true)
      expect(event.defaultPrevented).toBe(false)

      document.removeEventListener('keydown', youtubeHandler)
      owner.detach()
    })

    it('never consumes ArrowDown while typing in an editable field, even with Control Mode active', () => {
      const owner = createMovementKeyOwner(window, () => true, vi.fn())
      const input = document.createElement('input')
      document.body.appendChild(input)

      const event = dispatchKeydown(input, 'ArrowDown')

      expect(owner.getActiveDirections().size).toBe(0)
      expect(event.defaultPrevented).toBe(false)

      input.remove()
      owner.detach()
    })

    it('blocks a second capture-phase listener on the SAME node (window) — the one gap stopPropagation alone leaves open', () => {
      const owner = createMovementKeyOwner(window, () => true, vi.fn())

      let otherWindowCaptureListenerRan = false
      const otherWindowCaptureListener = () => {
        otherWindowCaptureListenerRan = true
      }
      // Registered AFTER our owner, on the exact same node and phase —
      // this is what a same-page, window-level capture listener (were
      // YouTube's own arrow handling ever implemented that way) would
      // look like. Plain `stopPropagation()` cannot stop this; only
      // `stopImmediatePropagation()` can.
      window.addEventListener('keydown', otherWindowCaptureListener, { capture: true })

      dispatchKeydown(document.body, 'ArrowDown')

      expect(otherWindowCaptureListenerRan).toBe(false)

      window.removeEventListener('keydown', otherWindowCaptureListener, { capture: true })
      owner.detach()
    })
  })
})
