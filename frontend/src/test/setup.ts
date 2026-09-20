import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Explicit imports (no `test.globals: true`) mean React Testing Library's
// automatic afterEach cleanup never registers itself, so each rendered tree
// would otherwise leak into the next test. Do it manually instead.
afterEach(() => {
  cleanup()
})

// jsdom doesn't implement ResizeObserver at all — any component that uses
// one (RoomCanvas.tsx, useRoomCameraGestures.ts) would otherwise throw
// synchronously on mount in every test, real browsers just never call
// back into a no-op observer, so tests that care about resize-driven
// behavior mock/trigger it explicitly instead of relying on this stub to
// do anything.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
