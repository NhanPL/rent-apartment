import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAuthStorage, getAccessToken, setAccessToken } from '../features/auth/authStorage'
import { ApiError, apiRequest, refreshAuthSession } from './apiClient'

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

  it('shares one refresh request across duplicate session bootstrap calls', async () => {
    const fetchMock = vi.fn(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 10))
      return jsonResponse({ accessToken: 'restored-access-token' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const firstRefresh = refreshAuthSession()
    const secondRefresh = refreshAuthSession()

    expect(firstRefresh).toBe(secondRefresh)
    await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([
      { accessToken: 'restored-access-token' },
      { accessToken: 'restored-access-token' },
    ])
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(getAccessToken()).toBe('restored-access-token')
  })

  it('shares a bootstrap refresh with an unauthorized request retry', async () => {
    setAccessToken('expired-access-token')
    let protectedCalls = 0
    let refreshCalls = 0
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      const url = String(args[0])
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1
        await new Promise((resolve) => window.setTimeout(resolve, 10))
        return jsonResponse({ accessToken: 'shared-access-token' })
      }

      protectedCalls += 1
      return protectedCalls === 1
        ? jsonResponse({ message: 'Unauthorized' }, 401)
        : jsonResponse({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    const [session, protectedResult] = await Promise.all([
      refreshAuthSession(),
      apiRequest<{ ok: boolean }>('/protected'),
    ])

    expect(session).toEqual({ accessToken: 'shared-access-token' })
    expect(protectedResult).toEqual({ ok: true })
    expect(refreshCalls).toBe(1)
    expect(protectedCalls).toBe(2)
  })

  it('allows a later refresh attempt after a failed request settles', async () => {
    let refreshCalls = 0
    const fetchMock = vi.fn(async () => {
      refreshCalls += 1
      return refreshCalls === 1
        ? jsonResponse({ message: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' }, 401)
        : jsonResponse({ accessToken: 'recovered-access-token' })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(refreshAuthSession()).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
      status: 401,
    })
    await expect(refreshAuthSession()).resolves.toEqual({
      accessToken: 'recovered-access-token',
    })
    expect(refreshCalls).toBe(2)
  })

  it('preserves the structured error contract for form handling and support', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      fieldErrors: { email: ['Enter a valid email address.'] },
      requestId: 'request-structured-error',
    }, 422)))

    const error = await apiRequest('/test', { skipAuth: true }).catch((requestError) => requestError)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
      fieldErrors: { email: ['Enter a valid email address.'] },
      requestId: 'request-structured-error',
    })
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
