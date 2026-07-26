import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthStorage, getAccessToken, setAccessToken } from '../features/auth/authStorage'
import { apiRequest } from './apiClient'

const jsonResponse = (body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: { 'Content-Type': 'application/json' },
  },
)

describe('apiClient token handling', () => {
  beforeEach(() => {
    clearAuthStorage()
    vi.restoreAllMocks()
  })

  it('sends cookies and reads the access token from memory', async () => {
    setAccessToken('memory-token')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest<{ ok: boolean }>('/test')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer memory-token' }),
      }),
    )
    expect(localStorage.getItem('auth_access_token')).toBeNull()
    expect(localStorage.getItem('auth_refresh_token')).toBeNull()
  })

  it('shares one cookie refresh across concurrent unauthorized requests', async () => {
    setAccessToken('expired-access-token')
    let protectedCalls = 0
    let refreshCalls = 0
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      const url = String(args[0])
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1
        await new Promise((resolve) => window.setTimeout(resolve, 10))
        return jsonResponse({ accessToken: 'rotated-access-token' })
      }

      protectedCalls += 1
      return protectedCalls <= 2
        ? jsonResponse({ message: 'Unauthorized' }, 401)
        : jsonResponse({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([
      apiRequest<{ ok: boolean }>('/first'),
      apiRequest<{ ok: boolean }>('/second'),
    ])

    expect(refreshCalls).toBe(1)
    expect(getAccessToken()).toBe('rotated-access-token')
    const refreshRequest = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/auth/refresh'))
    expect(refreshRequest?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
    })
    expect(refreshRequest?.[1]).not.toHaveProperty('body')
  })
})
