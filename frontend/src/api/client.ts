// Shared HTTP client for talking to the Django backend.
//
// All requests are relative to /api, which the Vite dev server proxies to
// the Django backend (see vite.config.ts). This keeps the browser's view of
// same-origin/cross-origin intact without needing CORS configuration.

const API_BASE = '/api'

/** Thrown for any non-2xx response, carrying enough detail to show the user a useful message. */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/**
 * Reads Django's CSRF cookie directly from document.cookie.
 *
 * Django's CSRF protection uses the double-submit cookie pattern: the
 * `csrftoken` cookie is deliberately not HttpOnly so client-side JS can
 * read it and echo it back in the `X-CSRFToken` header on unsafe requests.
 * The cookie itself is set by GET /api/auth/csrf/, which must be called
 * once before any POST/PUT/DELETE request.
 */
function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

function extractErrorMessage(body: unknown): string {
  if (body && typeof body === 'object') {
    const data = body as Record<string, unknown>
    if (typeof data.detail === 'string') {
      return data.detail
    }
    // DRF serializer validation errors look like { field: ["message", ...] }.
    // Surface the first one so the user gets an actionable message.
    for (const value of Object.values(data)) {
      if (Array.isArray(value) && typeof value[0] === 'string') {
        return value[0]
      }
    }
  }
  return 'Something went wrong. Please try again.'
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const isUnsafe = method !== 'GET'

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (isUnsafe) {
    const csrfToken = readCsrfCookie()
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    // Required so the Django session cookie is sent/received on every
    // request, including the proxied cross-origin dev setup.
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(extractErrorMessage(data), response.status, data)
  }

  return data as T
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
}
