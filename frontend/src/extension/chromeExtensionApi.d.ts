/**
 * Minimal ambient types for the ONE slice of the Chrome extension API this
 * codebase actually uses (`chrome.storage.local` + `chrome.storage.onChanged`
 * + `chrome.runtime.id`) — written by hand rather than adding the
 * `@types/chrome` package as a dependency for a handful of calls. If a
 * future slice needs a meaningfully larger surface of the extension APIs,
 * reconsider `@types/chrome` at that point rather than keep growing this
 * file indefinitely.
 */
declare namespace chrome {
  namespace storage {
    interface StorageArea {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>): Promise<void>
    }

    interface StorageChange {
      oldValue?: unknown
      newValue?: unknown
    }

    const local: StorageArea

    const onChanged: {
      addListener(
        callback: (changes: Record<string, StorageChange>, areaName: string) => void,
      ): void
    }
  }

  namespace runtime {
    /** Present (a real extension id string) only when this script is
     * running as part of an installed extension — used to distinguish
     * "the extension isn't installed" from "chrome.storage isn't
     * available for some other reason" without throwing. */
    const id: string | undefined
  }
}
