import { expect, request, test } from '@playwright/test';
import {
  API_URL,
  DEFAULT_PASSWORD,
  authHeaders,
  createApiSession,
  loginBrowser
} from './helpers';

const ACTIVATION_TOKEN = 'e2e_activation_token_abcdefghijklmnopqrstuvwxyz012345';
const RESET_TOKEN = 'e2e_reset_token_abcdefghijklmnopqrstuvwxyz0123456789';

test.describe('authentication lifecycle', () => {
  test('shows generic failure for a wrong password and signs in with a valid password', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username or email').fill('e2e-manager');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('username or password is incorrect');

    await page.getByLabel('Password').fill(DEFAULT_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('does not let a pending tenant sign in', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username or email').fill('e2e-activation');
    await page.getByLabel('Password').fill(DEFAULT_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('username or password is incorrect');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('activates a tenant through the one-time link', async ({ page }) => {
    const activatedPassword = 'Activated tenant passphrase 2026';
    await page.goto(`/activate-account?token=${ACTIVATION_TOKEN}`);
    await expect(page.getByText('Set your password')).toBeVisible();
    await page.getByLabel('New password').fill(activatedPassword);
    await page.getByLabel('Confirm password').fill(activatedPassword);
    await page.getByRole('button', { name: 'Activate account' }).click();
    await expect(page.getByText('Account activated')).toBeVisible();

    await loginBrowser(page, 'e2e-activation', activatedPassword);
    await expect(page).toHaveURL(/\/my-room$/);
  });

  test('rotates refresh tokens and detects reuse', async () => {
    const session = await createApiSession('e2e-session');
    const before = await session.api.storageState();
    const oldCookie = before.cookies.find((cookie) => cookie.name === 'rent_refresh_token');
    expect(oldCookie).toBeDefined();

    const rotated = await session.api.post('/api/auth/refresh', { data: {} });
    expect(rotated.ok()).toBeTruthy();
    const after = await session.api.storageState();
    expect(after.cookies.find((cookie) => cookie.name === 'rent_refresh_token')?.value)
      .not.toBe(oldCookie?.value);

    const reused = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { Cookie: `${oldCookie!.name}=${oldCookie!.value}` }
    });
    expect((await reused.post('/api/auth/refresh', { data: {} })).status()).toBe(401);
    expect((await session.api.post('/api/auth/refresh', { data: {} })).status()).toBe(401);
    await reused.dispose();
    await session.api.dispose();
  });

  test('logout revokes the refresh session', async () => {
    const session = await createApiSession('e2e-manager');
    const state = await session.api.storageState();
    const refreshCookie = state.cookies.find((cookie) => cookie.name === 'rent_refresh_token')!;
    expect((await session.api.post('/api/auth/logout', { data: {} })).ok()).toBeTruthy();

    const replay = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { Cookie: `${refreshCookie.name}=${refreshCookie.value}` }
    });
    expect((await replay.post('/api/auth/refresh', { data: {} })).status()).toBe(401);
    await replay.dispose();
    await session.api.dispose();
  });

  test('changing a password revokes every active session', async () => {
    const first = await createApiSession('e2e-change');
    const second = await createApiSession('e2e-change');
    const nextPassword = 'Changed manager passphrase 2026';
    const changed = await first.api.put('/api/auth/password', {
      headers: authHeaders(first.accessToken),
      data: {
        currentPassword: DEFAULT_PASSWORD,
        newPassword: nextPassword,
        confirmPassword: nextPassword
      }
    });
    expect(changed.ok(), await changed.text()).toBeTruthy();
    expect((await second.api.get('/api/auth/me', {
      headers: authHeaders(second.accessToken)
    })).status()).toBe(401);

    const oldLogin = await request.newContext({ baseURL: API_URL });
    expect((await oldLogin.post('/api/auth/login', {
      data: { identifier: 'e2e-change', password: DEFAULT_PASSWORD }
    })).status()).toBe(401);
    expect((await oldLogin.post('/api/auth/login', {
      data: { identifier: 'e2e-change', password: nextPassword }
    })).ok()).toBeTruthy();
    await first.api.dispose();
    await second.api.dispose();
    await oldLogin.dispose();
  });

  test('forgot password is enumeration-safe and reset signs the account in only with the new password', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('unknown-account@example.test');
    await page.getByRole('button', { name: 'Send reset instructions' }).click();
    await expect(page.getByText(/If an active account exists/i)).toBeVisible();

    const nextPassword = 'Reset tenant passphrase 2026';
    await page.goto(`/reset-password?token=${RESET_TOKEN}`);
    await page.getByLabel('New password').fill(nextPassword);
    await page.getByLabel('Confirm password').fill(nextPassword);
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByText('Password changed')).toBeVisible();

    await loginBrowser(page, 'e2e-reset', nextPassword);
    await expect(page).toHaveURL(/\/my-room$/);
  });
});
