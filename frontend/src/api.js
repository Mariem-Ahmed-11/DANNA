const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim()

// Production builds default to same-origin requests so the shipped bundle never
// embeds a development host. Only the local Vite dev server falls back to the
// local Laravel server.
const API_BASE_URL = (
  configuredApiBaseUrl || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')
).replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status, errors = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

function getXsrfToken() {
  const tokenCookie = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('XSRF-TOKEN='))

  return tokenCookie ? decodeURIComponent(tokenCookie.slice('XSRF-TOKEN='.length)) : ''
}

async function ensureCsrfCookie() {
  const response = await fetch(`${API_BASE_URL}/sanctum/csrf-cookie`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new ApiError('Could not initialize the secure login session.', response.status)
  }

  if (!getXsrfToken()) {
    throw new Error(
      'The CSRF cookie was not set. Check the frontend and backend hostnames and cookie settings.'
    )
  }
}

export async function apiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const isMutatingRequest = !['GET', 'HEAD', 'OPTIONS'].includes(method)

  if (isMutatingRequest) {
    await ensureCsrfCookie()
  }

  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (options.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (isMutatingRequest) {
    const xsrfToken = getXsrfToken()
    if (!xsrfToken) {
      throw new Error('The secure request token is missing. Refresh the page and try again.')
    }
    headers.set('X-XSRF-TOKEN', xsrfToken)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
  })

  let payload = null
  const responseText = await response.text()

  if (responseText) {
    try {
      payload = JSON.parse(responseText)
    } catch {
      throw new Error('The server returned an invalid response.')
    }
  }

  if (!response.ok) {
    const error = new ApiError(
      payload?.message || 'The request could not be completed.',
      response.status,
      payload?.errors || {}
    )

    // A current-user check is the source of truth for the SPA session. Notify
    // the auth provider for every protected endpoint, including /api/user, so
    // no consumer can retain a stale in-memory identity after a 401.
    if (response.status === 401 && path !== '/api/login') {
      window.dispatchEvent(new Event('dhana:unauthorized'))
    }

    throw error
  }

  return payload
}

export { API_BASE_URL }
