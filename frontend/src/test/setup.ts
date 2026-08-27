import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Explicit imports (no `test.globals: true`) mean React Testing Library's
// automatic afterEach cleanup never registers itself, so each rendered tree
// would otherwise leak into the next test. Do it manually instead.
afterEach(() => {
  cleanup()
})
