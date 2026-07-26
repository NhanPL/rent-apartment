let accessToken: string | null = null

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token: string) {
  accessToken = token
  localStorage.removeItem('auth_access_token')
  localStorage.removeItem('auth_refresh_token')
  localStorage.removeItem('auth_user')
}

export function clearAuthStorage() {
  accessToken = null
  localStorage.removeItem('auth_access_token')
  localStorage.removeItem('auth_refresh_token')
  localStorage.removeItem('auth_user')
}
