import { clearAuthStorage, getAccessToken, setAccessToken } from '../features/auth/authStorage'
import { API_ROUTES } from './apiRoutes'

const apiBaseUrlFromEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
const API_BASE_URL = apiBaseUrlFromEnv ? apiBaseUrlFromEnv.replace(/\/$/, '') : 'http://localhost:4000/api'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  headers?: Record<string, string>
  skipAuth?: boolean
  retry?: boolean
}

interface ApiErrorPayload {
  message?: string
  code?: string
}

export class ApiError extends Error {
  code: string
  status?: number

  constructor(message: string, code: string = 'REQUEST_FAILED', status?: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function parseError(response: Response): Promise<ApiError> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null
  return new ApiError(payload?.message ?? 'Request failed', payload?.code ?? 'REQUEST_FAILED', response.status)
}

let refreshPromise: Promise<boolean> | null = null

async function performRefresh() {
  const response = await fetch(`${API_BASE_URL}${API_ROUTES.auth.refresh}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })

  if (!response.ok) {
    return false
  }

  const data = (await response.json()) as { accessToken: string }
  setAccessToken(data.accessToken)
  return true
}

async function tryRefreshToken() {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers, skipAuth = false, retry = true } = options
  const requestHeaders: Record<string, string> = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  }

  const accessToken = getAccessToken()
  if (!skipAuth && accessToken) {
    requestHeaders.Authorization = `Bearer ${accessToken}`
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })

  if (response.status === 401 && !skipAuth && retry) {
    const refreshed = await tryRefreshToken()
    if (refreshed) {
      return apiRequest<T>(path, { ...options, retry: false })
    }

    clearAuthStorage()
    if (window.location.pathname !== '/login') {
      window.location.replace('/login')
    }
    throw new ApiError('Unauthorized', 'UNAUTHORIZED', 401)
  }

  if (!response.ok) {
    throw await parseError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function apiRequestText(path: string, options: RequestOptions = {}): Promise<string> {
  const { method = 'GET', body, headers, skipAuth = false, retry = true } = options
  const requestHeaders: Record<string, string> = {
    Accept: 'text/csv, text/plain, */*',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  }

  const accessToken = getAccessToken()
  if (!skipAuth && accessToken) {
    requestHeaders.Authorization = `Bearer ${accessToken}`
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })

  if (response.status === 401 && !skipAuth && retry) {
    const refreshed = await tryRefreshToken()
    if (refreshed) {
      return apiRequestText(path, { ...options, retry: false })
    }

    clearAuthStorage()
    if (window.location.pathname !== '/login') {
      window.location.replace('/login')
    }
    throw new ApiError('Unauthorized', 'UNAUTHORIZED', 401)
  }

  if (!response.ok) {
    throw await parseError(response)
  }

  return response.text()
}
