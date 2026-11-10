import { afterEach, describe, expect, it, vi } from 'vitest'
import { csrfHeaders } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'csrftoken=; Max-Age=0; path=/'
})

describe('CSRF token refresh', () => {
  it('replaces a stale browser token with the current Django token for provider navigation', async () => {
    document.cookie = 'csrftoken=stale-token; path=/'
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ csrfToken: 'fresh-server-token' }) })
    vi.stubGlobal('fetch', fetch)
    expect(await csrfHeaders(true)).toEqual({ 'X-CSRFToken': 'fresh-server-token' })
    expect(fetch).toHaveBeenCalledWith('/api/v1/accounts/csrf/', { credentials: 'same-origin', cache: 'no-store' })
  })

  it('does not submit a stale token when refreshing fails', async () => {
    document.cookie = 'csrftoken=stale-token; path=/'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    await expect(csrfHeaders(true)).rejects.toThrow('Unable to connect to the account service.')
  })
})
