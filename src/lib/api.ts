/** All browser authentication uses same-origin Django sessions and CSRF. */
export class ApiError extends Error {
  constructor(public status: number, public data: any) {
    super(data?.errors?.map((item: any) => item.message).join(' ') || (typeof data?.detail === 'string' ? data.detail : null) ||
      (data?.data?.flows?.some((flow: any) => flow.id === 'account_inactive') ? 'This account is disabled. Contact support.' :
        status === 429 ? 'Too many attempts. Please wait and try again.' :
          data && typeof data === 'object' && !data.status ? Object.entries(data).map(([field, value]) => `${field}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join(' ') : `Request failed (${status})`))
  }
}

export async function csrfHeaders(forceRefresh = false): Promise<Record<string, string>> {
  // Django rotates its CSRF secret after login. Read the current cookie each time.
  let token = document.cookie.split('; ').find(value => value.startsWith('csrftoken='))?.split('=')[1]
  if (forceRefresh || !token) {
    const response = await fetch('/api/v1/accounts/csrf/', { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) throw new Error('Unable to connect to the account service. Please try again.')
    token = (await response.json()).csrfToken
  }
  if (!token) throw new Error('Unable to prepare a secure request. Please refresh and try again.')
  return { 'X-CSRFToken': decodeURIComponent(token!) }
}

export async function sessionFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const target = new URL(url, window.location.origin)
  if (target.origin !== window.location.origin) {
    throw new Error('Authenticated requests must use the same-origin Django API.')
  }
  const headers = new Headers(options.headers)
  if (!['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase())) {
    const csrf = await csrfHeaders()
    headers.set('X-CSRFToken', csrf['X-CSRFToken'])
  }
  return fetch(url, { ...options, headers, credentials: 'same-origin' })
}

export async function apiRequest(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await sessionFetch(path, { ...options, headers })
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, data)
  return data
}

export const AUTH_BASE = '/_allauth/browser/v1'
export function hasPendingVerification(data: any): boolean {
  return data?.data?.flows?.some((flow: any) => flow.id === 'verify_email' && flow.is_pending) === true
}
