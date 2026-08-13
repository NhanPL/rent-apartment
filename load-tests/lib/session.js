import http from 'k6/http';
import { check, fail } from 'k6';

export const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');

export function login() {
  const response = http.post(`${baseUrl}/api/auth/login`, JSON.stringify({
    identifier: __ENV.MANAGER_USERNAME || 'e2e-manager',
    password: __ENV.MANAGER_PASSWORD || 'E2E secure passphrase 2026'
  }), { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'auth_login' } });

  const valid = check(response, {
    'login returns 200': (result) => result.status === 200,
    'login returns access token': (result) => Boolean(result.json('accessToken'))
  });
  if (!valid) fail(`Login failed with status ${response.status}`);
  return String(response.json('accessToken'));
}

export const authParams = (accessToken) => ({
  headers: { Authorization: `Bearer ${accessToken}` }
});
