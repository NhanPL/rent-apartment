import { apiRequest } from '../../services/apiClient'
import type { AuthUser, LoginPayload, LoginResponse } from './types/auth'

export function login(payload: LoginPayload) {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: payload,
    skipAuth: true,
  })
}

export function refresh(refreshToken: string) {
  return apiRequest<{ accessToken: string; refreshToken?: string }>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
    skipAuth: true,
  })
}

export function me() {
  return apiRequest<AuthUser>('/auth/me')
}

export function logoutApi(refreshToken: string | null) {
  return apiRequest<{ success: boolean }>('/auth/logout', {
    method: 'POST',
    body: refreshToken ? { refreshToken } : {},
    skipAuth: true,
  })
}
