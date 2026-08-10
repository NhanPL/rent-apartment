import crypto from 'crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db', async () => import('./support/mock-db'));

const emailServiceMocks = vi.hoisted(() => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  sendTenantActivationEmail: vi.fn().mockResolvedValue(true),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(true)
}));

vi.mock('../src/shared/services/email.service', () => ({
  sendEmail: emailServiceMocks.sendEmail,
  sendTenantActivationEmail: emailServiceMocks.sendTenantActivationEmail,
  sendPasswordResetEmail: emailServiceMocks.sendPasswordResetEmail,
  sendPasswordChangedEmail: emailServiceMocks.sendPasswordChangedEmail
}));
vi.mock('../src/modules/fixed-charges/fixed-charges.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/fixed-charges/fixed-charges.service')>();
  return {
    ...actual,
    resolveFixedChargesForContract: vi.fn().mockResolvedValue([])
  };
});

const uploadServiceMocks = vi.hoisted(() => ({
  deleteCloudinaryUpload: vi.fn().mockResolvedValue(undefined),
  validateStoredUpload: vi.fn().mockReturnValue('image'),
  normalizeStoredUpload: vi.fn((_: string, payload: Record<string, any>) => ({
    publicId: payload.public_id ?? `rent-apartment/test/${payload.file_name ?? 'asset'}`,
    assetId: payload.asset_id ?? null,
    resourceType: payload.resource_type ?? (String(payload.mime_type).startsWith('image/') ? 'image' : 'raw'),
    version: payload.version ?? 1,
    format: payload.format ?? (String(payload.mime_type) === 'application/pdf' ? 'pdf' : 'jpg'),
    deliveryType: payload.delivery_type ?? 'authenticated'
  }))
}));

vi.mock('../src/modules/uploads/uploads.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/uploads/uploads.service')>();
  return {
    ...actual,
    deleteCloudinaryUpload: uploadServiceMocks.deleteCloudinaryUpload,
    validateStoredUpload: uploadServiceMocks.validateStoredUpload,
    normalizeStoredUpload: uploadServiceMocks.normalizeStoredUpload
  };
});

const assetJobMocks = vi.hoisted(() => ({
  enqueueCloudinaryDeletion: vi.fn().mockResolvedValue(undefined),
  processCloudinaryAssetJobs: vi.fn().mockResolvedValue(0)
}));

vi.mock('../src/modules/documents/document-asset-jobs.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/documents/document-asset-jobs.service')>();
  return {
    ...actual,
    enqueueCloudinaryDeletion: assetJobMocks.enqueueCloudinaryDeletion,
    processCloudinaryAssetJobs: assetJobMocks.processCloudinaryAssetJobs
  };
});

vi.mock('../src/modules/documents/document-assets.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/documents/document-assets.service')>();
  return {
    ...actual,
    presentDocumentAsset: vi.fn(async (_req, _kind, row) => ({
      ...row,
      file_url: `http://localhost/api/documents/delivery/test-${row.id}`,
      access_expires_at: '2026-07-30T00:05:00.000Z'
    }))
  };
});

import { app } from '../src/app';
import { AppError } from '../src/shared/errors/app-error';
import { cleanupExpiredSessions } from '../src/modules/auth/session.service';
import { hashPassword } from '../src/shared/utils/password';
import { fakeDb, ids } from './support/mock-db';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const issueBankPayload = {
  bank_code: '970436',
  bank_account_no: '1234567890',
  bank_account_name: 'RentMate Manager',
  transfer_note: 'INV TEST'
};

const login = async (identifier: string) => {
  const response = await request(app)
    .post('/api/auth/login')
    .set('User-Agent', 'RentMate API Test')
    .send({ identifier, password: 'password' })
    .expect(200);
  const setCookie = response.headers['set-cookie'] as unknown as string[] | undefined;
  const refreshCookie = setCookie?.[0]?.split(';')[0];
  if (!refreshCookie) throw new Error('Login did not set a refresh-token cookie');

  return {
    ...response.body,
    refreshCookie,
    setCookie
  } as {
    accessToken: string;
    user: { id: string; role: 'MANAGER' | 'TENANT'; tenantId: string | null; fullName: string | null };
  } & { refreshCookie: string; setCookie: string[] };
};

describe('backend API smoke tests', () => {
  beforeEach(() => {
    fakeDb.reset();
    emailServiceMocks.sendEmail.mockClear();
    emailServiceMocks.sendTenantActivationEmail.mockClear();
    emailServiceMocks.sendTenantActivationEmail.mockResolvedValue(true);
    emailServiceMocks.sendPasswordResetEmail.mockClear();
    emailServiceMocks.sendPasswordResetEmail.mockResolvedValue(true);
    emailServiceMocks.sendPasswordChangedEmail.mockClear();
    emailServiceMocks.sendPasswordChangedEmail.mockResolvedValue(true);
    uploadServiceMocks.deleteCloudinaryUpload.mockClear();
    uploadServiceMocks.deleteCloudinaryUpload.mockResolvedValue(undefined);
    uploadServiceMocks.validateStoredUpload.mockClear();
    uploadServiceMocks.validateStoredUpload.mockReturnValue('image');
    uploadServiceMocks.normalizeStoredUpload.mockClear();
    assetJobMocks.enqueueCloudinaryDeletion.mockReset();
    assetJobMocks.enqueueCloudinaryDeletion.mockResolvedValue(undefined);
    assetJobMocks.processCloudinaryAssetJobs.mockClear();
    assetJobMocks.processCloudinaryAssetJobs.mockResolvedValue(0);
  });

  it('authenticates, refreshes tokens, and returns the current user profile', async () => {
    const session = await login('manager@example.com');

    expect(session.user).toMatchObject({
      id: ids.managerAUser,
      role: 'MANAGER',
      fullName: 'Manager A',
      tenantId: null
    });
    expect(session.accessToken).toEqual(expect.any(String));
    expect(session).not.toHaveProperty('refreshToken');
    expect(
      fakeDb.users.find((user) => user.id === ids.managerAUser)?.password_hash
    ).toMatch(/^\$bcrypt-sha256\$/);
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set('User-Agent', 'RentMate API Test')
      .send({ identifier: 'manager@example.com', password: 'password' })
      .expect(200);
    const loginCookies = loginResponse.headers['set-cookie'] as unknown as string[];
    const refreshCookie = loginCookies[0].split(';')[0];
    expect(loginCookies[0]).toContain('HttpOnly');
    expect(loginCookies[0]).toContain('SameSite=Lax');
    expect(loginCookies[0]).toContain('Path=/api/auth');
    expect(loginResponse.body).not.toHaveProperty('refreshToken');
    expect(fakeDb.authSessions.at(-1)).toMatchObject({
      ip_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      user_agent: expect.any(String)
    });

    const accessPayload = JSON.parse(
      Buffer.from(loginResponse.body.accessToken.split('.')[1], 'base64url').toString('utf8')
    ) as { exp: number; sessionId: string };
    expect(accessPayload.sessionId).toEqual(expect.any(String));
    expect(accessPayload.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(15 * 60);
    expect(accessPayload.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(14 * 60);

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);

    expect(refresh.body.accessToken).toEqual(expect.any(String));
    expect(refresh.body).not.toHaveProperty('refreshToken');
    const rotatedCookies = refresh.headers['set-cookie'] as unknown as string[];
    expect(rotatedCookies[0].split(';')[0]).not.toBe(refreshCookie);
    const rotatedToken = fakeDb.authRefreshTokens.find((token) => token.revocation_reason === 'ROTATED');
    expect(rotatedToken).toMatchObject({
      revoked_at: expect.any(String),
      revocation_reason: 'ROTATED',
      replaced_by_token_id: expect.any(String)
    });
    expect(rotatedToken?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(refreshCookie).not.toContain(rotatedToken?.token_hash);
    const rawRefreshToken = decodeURIComponent(refreshCookie.slice(refreshCookie.indexOf('=') + 1));
    expect(rotatedToken?.token_hash).toBe(
      crypto
        .createHmac('sha256', process.env.JWT_REFRESH_SECRET!)
        .update(rawRefreshToken, 'utf8')
        .digest('hex')
    );
    expect(rotatedToken?.token_hash).not.toBe(
      crypto.createHash('sha256').update(rawRefreshToken, 'utf8').digest('hex')
    );

    const me = await request(app)
      .get('/api/auth/me')
      .set(auth(refresh.body.accessToken))
      .expect(200);

    expect(me.body).toMatchObject({
      id: ids.managerAUser,
      role: 'MANAGER',
      fullName: 'Manager A'
    });

    const reusedRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);
    expect((reusedRefresh.headers['set-cookie'] as unknown as string[])[0]).toContain(
      'Expires=Thu, 01 Jan 1970'
    );
    await request(app)
      .get('/api/auth/me')
      .set(auth(refresh.body.accessToken))
      .expect(401);
    expect(fakeDb.authSessions.at(-1)).toMatchObject({
      revoked_at: expect.any(String),
      revocation_reason: 'TOKEN_REUSE_DETECTED'
    });
    expect(fakeDb.auditLogs).toContainEqual(expect.objectContaining({
      action: 'REFRESH_TOKEN_REUSE_DETECTED'
    }));
  });

  it('revokes the current session on logout', async () => {
    const session = await login('tenant@example.com');

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', session.refreshCookie)
      .expect(200, { success: true });

    const clearedCookies = response.headers['set-cookie'] as unknown as string[];
    expect(clearedCookies[0]).toContain('Expires=Thu, 01 Jan 1970');
    await request(app)
      .get('/api/auth/me')
      .set(auth(session.accessToken))
      .expect(401);
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(401);
  });

  it('rejects cookie-auth requests from an untrusted browser origin', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://malicious.example')
      .send({ identifier: 'manager@example.com', password: 'password' })
      .expect(403);

    expect(response.body).toMatchObject({ code: 'CORS_ORIGIN_DENIED' });
    expect(fakeDb.authSessions).toHaveLength(0);
  });

  it('revokes every device session for the authenticated user', async () => {
    const firstDevice = await login('manager@example.com');
    const secondDevice = await login('manager@example.com');

    await request(app)
      .post('/api/auth/sessions/revoke-all')
      .set(auth(firstDevice.accessToken))
      .set('Cookie', firstDevice.refreshCookie)
      .expect(200, { success: true });

    await request(app).get('/api/auth/me').set(auth(firstDevice.accessToken)).expect(401);
    await request(app).get('/api/auth/me').set(auth(secondDevice.accessToken)).expect(401);
    expect(fakeDb.authSessions).toHaveLength(2);
    expect(fakeDb.authSessions.every((item) => item.revoked_at)).toBe(true);
    expect(fakeDb.auditLogs).toContainEqual(expect.objectContaining({
      action: 'ALL_AUTH_SESSIONS_REVOKED'
    }));
  });

  it('cleans up expired sessions while retaining active sessions', async () => {
    await login('manager@example.com');
    fakeDb.authSessions.push({
      id: '00000000-0000-4000-8000-000000008888',
      user_id: ids.managerAUser,
      session_version: 0,
      expires_at: '2000-01-01T00:00:00.000Z',
      revoked_at: null,
      revocation_reason: null,
      ip_hash: 'a'.repeat(64),
      user_agent: 'Expired test device',
      last_used_at: '2000-01-01T00:00:00.000Z',
      created_at: '2000-01-01T00:00:00.000Z'
    });
    fakeDb.authRefreshTokens.push({
      id: '00000000-0000-4000-8000-000000008889',
      session_id: '00000000-0000-4000-8000-000000008888',
      token_hash: 'b'.repeat(64),
      expires_at: '2000-01-01T00:00:00.000Z',
      revoked_at: null,
      revocation_reason: null,
      replaced_by_token_id: null,
      last_used_at: null,
      created_at: '2000-01-01T00:00:00.000Z'
    });

    await expect(cleanupExpiredSessions()).resolves.toBe(1);
    expect(fakeDb.authSessions).toHaveLength(1);
    expect(fakeDb.authRefreshTokens).toHaveLength(1);
  });

  it('rejects users without a stored password using the generic credentials error', async () => {
    const tenantWithNullPassword = fakeDb.users.find((user) => user.id === ids.tenantAUser)!;
    tenantWithNullPassword.password_hash = null;
    tenantWithNullPassword.account_status = 'PENDING_ACTIVATION';
    tenantWithNullPassword.is_active = false;

    const nullPasswordResponse = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'tenant@example.com', password: 'any-password' })
      .expect(401);
    expect(nullPasswordResponse.body).toMatchObject({
      message: 'The username or password is incorrect. Please try again.',
      code: 'INVALID_CREDENTIALS'
    });

    const tenantWithEmptyPassword = fakeDb.users.find((user) => user.id === ids.tenantBUser)!;
    tenantWithEmptyPassword.password_hash = '';
    tenantWithEmptyPassword.account_status = 'PENDING_ACTIVATION';
    tenantWithEmptyPassword.is_active = false;

    const emptyPasswordResponse = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'tenant-b@example.com', password: 'any-password' })
      .expect(401);
    expect(emptyPasswordResponse.body).toMatchObject({
      message: 'The username or password is incorrect. Please try again.',
      code: 'INVALID_CREDENTIALS'
    });
  });

  it.each([
    ['missing password', { identifier: 'manager@example.com' }],
    ['empty password', { identifier: 'manager@example.com', password: '' }]
  ])('rejects a login request with %s', async (_case, payload) => {
    const response = await request(app)
      .post('/api/auth/login')
      .send(payload)
      .expect(401);
    expect(response.body).toMatchObject({
      message: 'The username or password is incorrect. Please try again.',
      code: 'INVALID_CREDENTIALS'
    });
  });

  it('does not reveal whether the account exists or is available for login', async () => {
    const pendingUser = fakeDb.users.find((user) => user.id === ids.tenantAUser)!;
    pendingUser.account_status = 'PENDING_ACTIVATION';
    pendingUser.is_active = false;

    const attempts = [
      { identifier: 'missing@example.com', password: 'wrong-password' },
      { identifier: 'tenant@example.com', password: 'password' },
      { identifier: 'manager@example.com', password: 'wrong-password' }
    ];

    for (const payload of attempts) {
      const response = await request(app)
        .post('/api/auth/login')
        .send(payload)
        .expect(401);
      expect(response.body).toMatchObject({
        message: 'The username or password is incorrect. Please try again.',
        code: 'INVALID_CREDENTIALS'
      });
    }
  });

  it('rejects invalid UUID path parameters and UUID query filters before database access', async () => {
    const session = await login('manager@example.com');

    const invalidPath = await request(app)
      .get('/api/buildings/not-a-uuid')
      .set(auth(session.accessToken))
      .expect(400);
    expect(invalidPath.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Invalid route parameters',
      fieldErrors: { id: ['Must be a valid UUID'] }
    });

    const invalidQuery = await request(app)
      .get('/api/rooms?building_id=not-a-uuid')
      .set(auth(session.accessToken))
      .expect(400);
    expect(invalidQuery.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request query',
      fieldErrors: { building_id: ['Invalid uuid'] }
    });
  });

  it('temporarily locks repeated failures for an account identifier', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'manager@example.com', password: 'wrong-password' })
        .expect(401);
    }

    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'manager@example.com', password: 'wrong-password' })
      .expect(429);

    expect(blocked.body).toMatchObject({
      code: 'LOGIN_TEMPORARILY_LOCKED',
      message: 'Too many failed login attempts. Please wait and try again.'
    });
    expect(fakeDb.auditLogs).toContainEqual(expect.objectContaining({
      action: 'AUTH_LOGIN_BRUTE_FORCE_SUSPECTED',
      entity_type: 'AUTHENTICATION'
    }));
    expect(JSON.stringify(fakeDb.auditLogs)).not.toContain('manager@example.com');
    expect(warning).toHaveBeenCalledWith(
      'Suspected login brute force blocked',
      expect.any(Object)
    );

    const identifierThrottle = fakeDb.loginThrottles.find(
      (item) => item.scope === 'IDENTIFIER'
    )!;
    identifierThrottle.locked_until = new Date(Date.now() - 1000).toISOString();

    await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'manager@example.com', password: 'wrong-password' })
      .expect(401);

    expect(fakeDb.auditLogs.at(-1)).toMatchObject({
      action: 'AUTH_LOGIN_BRUTE_FORCE_SUSPECTED',
      metadata: {
        throttles: [
          expect.objectContaining({
            scope: 'IDENTIFIER',
            failedCount: 6,
            lockSeconds: 60
          })
        ]
      }
    });
  });

  it('clears identifier failures after a successful login without clearing the IP counter', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'manager@example.com', password: 'wrong-password' })
        .expect(401);
    }

    await login('manager@example.com');

    expect(fakeDb.loginThrottles).toHaveLength(1);
    expect(fakeDb.loginThrottles[0]).toMatchObject({
      scope: 'IP',
      failed_count: 2
    });
  });

  it('temporarily blocks an IP attacking multiple account identifiers', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({
          identifier: `missing-${attempt}@example.com`,
          password: 'wrong-password'
        })
        .expect(401);
    }

    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'manager@example.com', password: 'password' })
      .expect(429);

    expect(blocked.body.code).toBe('LOGIN_TEMPORARILY_LOCKED');
    expect(fakeDb.auditLogs.at(-1)).toMatchObject({
      action: 'AUTH_LOGIN_BRUTE_FORCE_SUSPECTED',
      metadata: {
        throttles: [
          expect.objectContaining({
            scope: 'IP',
            failedCount: 20,
            lockSeconds: 30
          })
        ]
      }
    });
    expect(warning).toHaveBeenCalled();
  });

  it.each([
    ['manager@example.com', 'MANAGER'],
    ['tenant@example.com', 'TENANT']
  ])('changes the password for an authenticated %s account', async (identifier, role) => {
    const session = await login(identifier);
    const newPassword = `new-${role.toLowerCase()}-password`;

    const incorrectCurrentPassword = await request(app)
      .put('/api/auth/password')
      .set(auth(session.accessToken))
      .send({
        currentPassword: 'incorrect-password',
        newPassword,
        confirmPassword: newPassword
      })
      .expect(400);
    expect(incorrectCurrentPassword.body).toMatchObject({ code: 'CURRENT_PASSWORD_INCORRECT' });

    await request(app)
      .put('/api/auth/password')
      .set(auth(session.accessToken))
      .send({
        currentPassword: 'password',
        newPassword,
        confirmPassword: newPassword
      })
      .expect(200, { success: true });
    expect(fakeDb.authSessions.every((item) => item.revoked_at)).toBe(true);
    await request(app)
      .get('/api/auth/me')
      .set(auth(session.accessToken))
      .expect(401);

    await request(app)
      .post('/api/auth/login')
      .send({ identifier, password: 'password' })
      .expect(401);

    const newSession = await request(app)
      .post('/api/auth/login')
      .send({ identifier, password: newPassword })
      .expect(200);
    expect(newSession.body.user).toMatchObject({ role });
  });

  it('rejects mismatched password confirmation', async () => {
    const session = await login('manager@example.com');

    const response = await request(app)
      .put('/api/auth/password')
      .set(auth(session.accessToken))
      .send({
        currentPassword: 'password',
        newPassword: 'new-password',
        confirmPassword: 'different-password'
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'PASSWORD_CONFIRMATION_MISMATCH',
      message: 'Password confirmation does not match'
    });
  });

  it('rejects a common new password without exposing sensitive values', async () => {
    const session = await login('manager@example.com');

    const response = await request(app)
      .put('/api/auth/password')
      .set(auth(session.accessToken))
      .send({
        currentPassword: 'password',
        newPassword: 'password1234',
        confirmPassword: 'password1234'
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'PASSWORD_TOO_COMMON',
      message: 'This password is too common. Choose a less common password or a longer passphrase.'
    });
    expect(JSON.stringify(response.body)).not.toContain('"password1234"');
    expect(fakeDb.authSessions.some((item) => !item.revoked_at)).toBe(true);
  });

  it('changes and authenticates with a passphrase longer than 72 bytes', async () => {
    const session = await login('manager@example.com');
    const passphrase = `${'correct-horse-battery-staple-'.repeat(4)}safe`;

    expect(passphrase.length).toBeLessThanOrEqual(128);
    expect(Buffer.byteLength(passphrase, 'utf8')).toBeGreaterThan(72);

    await request(app)
      .put('/api/auth/password')
      .set(auth(session.accessToken))
      .send({
        currentPassword: 'password',
        newPassword: passphrase,
        confirmPassword: passphrase
      })
      .expect(200, { success: true });

    await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'manager@example.com', password: passphrase })
      .expect(200);
  });

  it('requests password reset without revealing whether the account exists', async () => {
    const expectedMessage =
      'If an active account exists for this email, password reset instructions will be sent shortly.';

    const existingResponse = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: 'manager@example.com' })
      .expect(202);
    const missingResponse = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: 'missing@example.com' })
      .expect(202);

    expect(existingResponse.body).toEqual({ message: expectedMessage });
    expect(missingResponse.body).toEqual({ message: expectedMessage });
    expect(emailServiceMocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);

    const emailPayload = emailServiceMocks.sendPasswordResetEmail.mock.calls[0][0] as {
      resetUrl: string;
      expiresAt: string;
    };
    const rawToken = new URL(emailPayload.resetUrl).searchParams.get('token');
    expect(rawToken).toEqual(expect.any(String));
    expect(fakeDb.passwordResetTokens[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(fakeDb.passwordResetTokens[0].token_hash).not.toBe(rawToken);
    expect(new Date(emailPayload.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(fakeDb.auditLogs.filter((entry) => entry.action === 'PASSWORD_RESET_REQUESTED')).toHaveLength(2);
  });

  it('rate limits password reset delivery while keeping the same response', async () => {
    const expectedMessage =
      'If an active account exists for this email, password reset instructions will be sent shortly.';

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/password-reset/request')
        .send({ email: 'manager@example.com' })
        .expect(202);
      expect(response.body).toEqual({ message: expectedMessage });
    }

    expect(emailServiceMocks.sendPasswordResetEmail).toHaveBeenCalledTimes(3);
    expect(fakeDb.passwordResetTokens.filter((token) => !token.revoked_at)).toHaveLength(1);
    expect(fakeDb.auditLogs.at(-1)).toMatchObject({
      action: 'PASSWORD_RESET_REQUESTED',
      metadata: { outcome: 'RATE_LIMITED' }
    });
  });

  it('does not allow a password reset to reuse the current password', async () => {
    const currentPassword = 'existing-secure-password';
    const manager = fakeDb.users.find((user) => user.id === ids.managerAUser)!;
    manager.password_hash = await hashPassword(currentPassword);

    await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: 'manager@example.com' })
      .expect(202);
    const emailPayload = emailServiceMocks.sendPasswordResetEmail.mock.calls[0][0] as {
      resetUrl: string;
    };
    const token = new URL(emailPayload.resetUrl).searchParams.get('token');

    const response = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({
        token,
        newPassword: currentPassword,
        confirmPassword: currentPassword
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'PASSWORD_REUSE_NOT_ALLOWED',
      message: 'New password must be different from the current password'
    });
    expect(fakeDb.passwordResetTokens[0].used_at).toBeNull();
    expect(emailServiceMocks.sendPasswordChangedEmail).not.toHaveBeenCalled();
  });

  it('resets the password, revokes sessions, and cannot reuse the reset token', async () => {
    const oldSession = await login('manager@example.com');
    await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: 'manager@example.com' })
      .expect(202);

    const emailPayload = emailServiceMocks.sendPasswordResetEmail.mock.calls[0][0] as {
      resetUrl: string;
    };
    const token = new URL(emailPayload.resetUrl).searchParams.get('token');
    expect(token).toBeTruthy();
    fakeDb.passwordResetTokens.push({
      id: '00000000-0000-4000-8000-000000009999',
      user_id: ids.managerAUser,
      token_hash: 'f'.repeat(64),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      used_at: null,
      revoked_at: null,
      created_at: new Date().toISOString()
    });

    await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({
        token,
        newPassword: 'reset-password-123',
        confirmPassword: 'reset-password-123'
      })
      .expect(200, { success: true });
    expect(fakeDb.authSessions.every((item) => item.revoked_at)).toBe(true);

    await request(app)
      .get('/api/auth/me')
      .set(auth(oldSession.accessToken))
      .expect(401);
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', oldSession.refreshCookie)
      .expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'manager@example.com', password: 'password' })
      .expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'manager@example.com', password: 'reset-password-123' })
      .expect(200);

    expect(emailServiceMocks.sendPasswordChangedEmail).toHaveBeenCalledWith({
      to: 'manager@example.com'
    });
    expect(fakeDb.passwordResetTokens[0].used_at).toEqual(expect.any(String));
    expect(fakeDb.passwordResetTokens[1].revoked_at).toEqual(expect.any(String));
    expect(fakeDb.auditLogs).toContainEqual(expect.objectContaining({
      action: 'USER_PASSWORD_CHANGED',
      entity_id: ids.managerAUser
    }));

    await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({
        token,
        newPassword: 'another-password-123',
        confirmPassword: 'another-password-123'
      })
      .expect(400);
  });

  it('rejects an expired password reset token without changing the password', async () => {
    await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: 'tenant@example.com' })
      .expect(202);
    const emailPayload = emailServiceMocks.sendPasswordResetEmail.mock.calls[0][0] as {
      resetUrl: string;
    };
    const token = new URL(emailPayload.resetUrl).searchParams.get('token');
    fakeDb.passwordResetTokens[0].expires_at = '2000-01-01T00:00:00.000Z';

    const response = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({
        token,
        newPassword: 'expired-token-password',
        confirmPassword: 'expired-token-password'
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'PASSWORD_RESET_TOKEN_INVALID',
      message: 'This password reset link is invalid, expired, or has already been used.'
    });
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'tenant@example.com', password: 'password' })
      .expect(200);
    expect(emailServiceMocks.sendPasswordChangedEmail).not.toHaveBeenCalled();
  });

  it('enforces RBAC for manager-only tenant endpoints', async () => {
    const tenantSession = await login('tenant@example.com');

    await request(app)
      .post('/api/tenants')
      .set(auth(tenantSession.accessToken))
      .send({
        full_name: 'Blocked Tenant',
        identity_number: 'BLOCKED',
        email: 'blocked@example.com',
        phone: '0911111111'
      })
      .expect(403);
  });

  it('does not expose the removed VNPAY payment endpoints', async () => {
    const tenantSession = await login('tenant@example.com');

    await request(app)
      .post('/api/payments/vnpay/create')
      .set(auth(tenantSession.accessToken))
      .send({ invoice_id: ids.invoiceIssued })
      .expect(404);

    await request(app)
      .get('/api/payments/vnpay/return')
      .set(auth(tenantSession.accessToken))
      .expect(404);
  });

  it('isolates tenant data between managers', async () => {
    const managerSession = await login('manager@example.com');

    const list = await request(app)
      .get('/api/tenants')
      .set(auth(managerSession.accessToken))
      .expect(200);

    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(ids.tenantA);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(ids.tenantB);
    expect(list.body.items.find((item: { id: string }) => item.id === ids.tenantA).identity_number).toBe('****');

    await request(app)
      .get(`/api/tenants/${ids.tenantB}`)
      .set(auth(managerSession.accessToken))
      .expect(404);
  });

  it('updates a nested tenant form and deletes its account and Cloudinary documents', async () => {
    const managerSession = await login('manager@example.com');

    const created = await request(app)
      .post('/api/tenants')
      .set(auth(managerSession.accessToken))
      .send({
        full_name: 'Charlie Tenant',
        identity_number: 'ID-C',
        email: 'charlie@example.com',
        phone: '0933333333',
        status: 'ACTIVE',
        privacy_consent: true
      })
      .expect(201);

    const tenantId = created.body.tenantId as string;
    expect(fakeDb.tenants.find((tenant) => tenant.id === tenantId)).toMatchObject({
      full_name: 'Charlie Tenant',
      identity_number: 'ID-C'
    });
    expect(fakeDb.users.find((user) => user.id === created.body.userId)).toMatchObject({
      password_hash: null,
      is_active: false,
      account_status: 'PENDING_ACTIVATION'
    });
    expect(fakeDb.tenantPrivacyConsents).toContainEqual(expect.objectContaining({
      tenant_id: tenantId,
      granted: true
    }));

    const updated = await request(app)
      .patch(`/api/tenants/${tenantId}`)
      .set(auth(managerSession.accessToken))
      .send({
        tenant: {
          full_name: 'Charlie Tenant Updated',
          identity_number: 'ID-C',
          email: 'charlie.updated@example.com',
          phone: '0944444444',
          status: 'ACTIVE',
          note: 'Updated by test'
        }
      })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: tenantId,
      full_name: 'Charlie Tenant Updated',
      email: 'charlie.updated@example.com',
      phone: '0944444444',
      note: 'Updated by test'
    });
    expect(fakeDb.users.find((user) => user.id === created.body.userId)).toMatchObject({
      email: 'charlie.updated@example.com',
      username: 'charlie.updated@example.com'
    });
    expect(fakeDb.activationTokens.find((token) => token.user_id === created.body.userId)).toMatchObject({
      revoked_at: expect.any(String)
    });

    const frontUrl = 'https://res.cloudinary.com/demo/image/upload/tenant-documents/charlie-front.jpg';
    const backUrl = 'https://res.cloudinary.com/demo/image/upload/tenant-documents/charlie-back.jpg';
    fakeDb.tenantDocuments.push(
      { id: 'document-front', tenant_id: tenantId, file_url: frontUrl },
      { id: 'document-back', tenant_id: tenantId, file_url: backUrl }
    );

    await request(app)
      .delete(`/api/tenants/${tenantId}`)
      .set(auth(managerSession.accessToken))
      .expect(200);

    expect(fakeDb.tenants.find((tenant) => tenant.id === tenantId)).toMatchObject({
      status: 'DELETED',
      user_id: null
    });
    expect(fakeDb.users.find((user) => user.id === created.body.userId)).toBeUndefined();
    expect(fakeDb.tenantDocuments.filter((document) => document.tenant_id === tenantId)).toEqual([]);
    expect(uploadServiceMocks.deleteCloudinaryUpload).not.toHaveBeenCalled();

    await request(app)
      .post('/api/tenants')
      .set(auth(managerSession.accessToken))
      .send({
        full_name: 'Replacement Tenant',
        identity_number: 'ID-C-REPLACEMENT',
        email: 'charlie.updated@example.com',
        phone: '0955555555',
        status: 'ACTIVE',
        privacy_consent: true
      })
      .expect(201);
  });

  it('anonymizes tenant data while Cloudinary cleanup remains asynchronous', async () => {
    const managerSession = await login('manager@example.com');
    const fileUrl = 'https://res.cloudinary.com/demo/image/upload/tenant-documents/free-front.jpg';
    fakeDb.tenantDocuments.push({
      id: 'document-free-front',
      tenant_id: ids.tenantFree,
      file_url: fileUrl
    });
    assetJobMocks.enqueueCloudinaryDeletion.mockRejectedValueOnce(
      new AppError(502, 'Unable to delete file from Cloudinary', 'CLOUDINARY_DELETE_FAILED')
    );

    const response = await request(app)
      .delete(`/api/tenants/${ids.tenantFree}`)
      .set(auth(managerSession.accessToken))
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ANONYMIZED'
    });
    expect(fakeDb.tenants.find((tenant) => tenant.id === ids.tenantFree)).toMatchObject({
      status: 'DELETED',
      anonymized_at: expect.any(String)
    });
    expect(fakeDb.tenantDocuments).toEqual([]);
  });

  it('returns a meaningful error when a tenant email is already in use', async () => {
    const managerSession = await login('manager@example.com');

    const response = await request(app)
      .patch(`/api/tenants/${ids.tenantA}`)
      .set(auth(managerSession.accessToken))
      .send({
        tenant: {
          full_name: 'Alice Tenant',
          identity_number: 'ID-A',
          email: 'manager@example.com',
          phone: '0900000001',
          status: 'ACTIVE'
        }
      })
      .expect(409);

    expect(response.body).toEqual({
      code: 'TENANT_EMAIL_EXISTS',
      message: 'This email address is already used by another account.',
      fieldErrors: {
        email: ['This email address is already used by another account.']
      },
      requestId: response.headers['x-request-id']
    });
  });

  it('returns a safe, meaningful error when the tenant update query fails', async () => {
    const managerSession = await login('manager@example.com');
    fakeDb.tenantUpdateFailure = new Error('database implementation detail');

    const response = await request(app)
      .patch(`/api/tenants/${ids.tenantA}`)
      .set(auth(managerSession.accessToken))
      .send({
        tenant: {
          full_name: 'Alice Tenant',
          identity_number: 'ID-A',
          email: 'tenant@example.com',
          phone: '0900000001',
          status: 'ACTIVE'
        }
      })
      .expect(500);

    expect(response.body).toMatchObject({
      code: 'TENANT_UPDATE_FAILED',
      message: 'Unable to update tenant information. Please try again.'
    });
    expect(response.body.message).not.toContain('database implementation detail');
  });

  it('activates a pending tenant account with a one-time hashed token', async () => {
    const managerSession = await login('manager@example.com');
    const created = await request(app)
      .post('/api/tenants')
      .set(auth(managerSession.accessToken))
      .send({
        full_name: 'Activation Tenant',
        identity_number: 'ID-ACTIVATION',
        email: 'activation@example.com',
        phone: '0933333344',
        status: 'ACTIVE',
        privacy_consent: true
      })
      .expect(201);

    expect(created.body.emailSent).toBe(true);
    const emailPayload = emailServiceMocks.sendTenantActivationEmail.mock.calls[0]?.[0] as {
      activationUrl: string;
    };
    const token = new URL(emailPayload.activationUrl).searchParams.get('token');
    expect(token).toEqual(expect.any(String));

    const storedToken = fakeDb.activationTokens[0];
    expect(storedToken).toMatchObject({
      user_id: created.body.userId,
      token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      used_at: null,
      revoked_at: null
    });
    expect(storedToken).not.toHaveProperty('token');
    expect(storedToken.token_hash).not.toBe(token);

    await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'activation@example.com', password: 'new-password-123' })
      .expect(401);

    const validation = await request(app)
      .get('/api/auth/activation')
      .query({ token })
      .expect(200);
    expect(validation.body).toMatchObject({
      valid: true,
      emailHint: 'ac********@example.com'
    });

    await request(app)
      .post('/api/auth/activate')
      .send({
        token,
        newPassword: 'new-password-123',
        confirmPassword: 'new-password-123'
      })
      .expect(200);

    expect(fakeDb.users.find((user) => user.id === created.body.userId)).toMatchObject({
      is_active: true,
      account_status: 'ACTIVE'
    });
    expect(fakeDb.activationTokens[0].used_at).toEqual(expect.any(String));

    await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'activation@example.com', password: 'new-password-123' })
      .expect(200);
    await request(app)
      .get('/api/auth/activation')
      .query({ token })
      .expect(400);

    expect(fakeDb.auditLogs.map((entry) => entry.action)).toEqual(expect.arrayContaining([
      'TENANT_ACCOUNT_CREATED',
      'TENANT_ACTIVATION_INVITATION_CREATED',
      'TENANT_ACTIVATION_INVITATION_DELIVERY',
      'USER_ACTIVATED'
    ]));
  });

  it('revokes the previous activation token when a manager resends an invitation', async () => {
    const managerSession = await login('manager@example.com');
    const created = await request(app)
      .post('/api/tenants')
      .set(auth(managerSession.accessToken))
      .send({
        full_name: 'Resend Tenant',
        identity_number: 'ID-RESEND',
        email: 'resend@example.com',
        phone: '0933333355',
        status: 'ACTIVE',
        privacy_consent: true
      })
      .expect(201);

    const firstUrl = (emailServiceMocks.sendTenantActivationEmail.mock.calls[0]?.[0] as {
      activationUrl: string;
    }).activationUrl;
    const firstToken = new URL(firstUrl).searchParams.get('token');

    await request(app)
      .post(`/api/tenants/${created.body.tenantId}/resend-activation`)
      .set(auth(managerSession.accessToken))
      .expect(200);

    const secondUrl = (emailServiceMocks.sendTenantActivationEmail.mock.calls[1]?.[0] as {
      activationUrl: string;
    }).activationUrl;
    const secondToken = new URL(secondUrl).searchParams.get('token');
    expect(secondToken).not.toBe(firstToken);
    expect(fakeDb.activationTokens[0].revoked_at).toEqual(expect.any(String));

    await request(app)
      .get('/api/auth/activation')
      .query({ token: firstToken })
      .expect(400);
    await request(app)
      .get('/api/auth/activation')
      .query({ token: secondToken })
      .expect(200);

    fakeDb.activationTokens[1].expires_at = '2000-01-01T00:00:00.000Z';
    await request(app)
      .get('/api/auth/activation')
      .query({ token: secondToken })
      .expect(400);
  });

  it('creates, updates, ends contracts, and rejects over-capacity activation', async () => {
    const managerSession = await login('manager@example.com');

    const created = await request(app)
      .post('/api/contracts')
      .set(auth(managerSession.accessToken))
      .send({
        room_id: ids.roomA,
        status: 'DRAFT',
        start_date: '2026-07-01',
        rent_price: 1250,
        billing_day: 7,
        tenants: []
      })
      .expect(201);

    expect(created.body).toMatchObject({
      room_id: ids.roomA,
      status: 'DRAFT',
      rent_price: 1250
    });

    const patched = await request(app)
      .patch(`/api/contracts/${created.body.id}`)
      .set(auth(managerSession.accessToken))
      .send({ rent_price: 1300, note: 'Adjusted rent' })
      .expect(200);

    expect(patched.body).toMatchObject({
      id: created.body.id,
      rent_price: 1300,
      note: 'Adjusted rent'
    });

    const ended = await request(app)
      .post(`/api/contracts/${created.body.id}/end`)
      .set(auth(managerSession.accessToken))
      .send({ move_out_date: '2026-08-01' })
      .expect(200);

    expect(ended.body).toMatchObject({
      id: created.body.id,
      status: 'ENDED',
      move_out_date: '2026-08-01'
    });

    const overCapacity = await request(app)
      .post('/api/contracts')
      .set(auth(managerSession.accessToken))
      .send({
        room_id: ids.roomSmall,
        status: 'ACTIVE',
        start_date: '2026-07-01',
        rent_price: 800,
        billing_day: 5,
        tenants: [
          { tenant_id: ids.tenantA, is_primary: true },
          { tenant_id: ids.tenantFree, is_primary: false }
        ]
      })
      .expect(409);

    expect(overCapacity.body.code).toBe('ROOM_MAX_OCCUPANTS_EXCEEDED');
  });

  it('rejects document uploads when Cloudinary credentials are not configured', async () => {
    const managerSession = await login('manager@example.com');

    const response = await request(app)
      .get('/api/uploads/signature')
      .query({
        context: 'CONTRACT_DOCUMENT',
        mime_type: 'application/pdf',
        file_size: 2048,
        resource_type: 'raw'
      })
      .set(auth(managerSession.accessToken))
      .expect(500);

    expect(response.body).toMatchObject({
      code: 'CLOUDINARY_NOT_CONFIGURED',
      message: 'Cloudinary is not configured'
    });
  });

  it('runs the rental registration reserve, cancel, and handover workflow', async () => {
    const managerSession = await login('manager@example.com');

    fakeDb.contracts.push({
      id: '00000000-0000-4000-8000-000000000499',
      room_id: ids.roomSmall,
      contract_code: 'CONTRACT-WITHOUT-OCCUPANT',
      status: 'ACTIVE',
      start_date: '2026-01-01',
      end_date: null,
      move_in_date: '2026-01-01',
      move_out_date: null,
      rent_price: 800,
      deposit_amount: 800,
      billing_day: 5,
      note: null
    });

    const available = await request(app)
      .get('/api/rental-registration/available-rooms')
      .set(auth(managerSession.accessToken))
      .expect(200);

    expect(available.body.map((room: { id: string }) => room.id)).toContain(ids.roomSmall);
    expect(available.body.map((room: { id: string }) => room.id)).not.toContain(ids.roomA);

    const availableTenants = await request(app)
      .get('/api/rental-registration/available-tenants')
      .set(auth(managerSession.accessToken))
      .expect(200);

    expect(availableTenants.body.map((tenant: { id: string }) => tenant.id)).toContain(ids.tenantFree);
    expect(availableTenants.body.map((tenant: { id: string }) => tenant.id)).not.toContain(ids.tenantA);

    const reservedForCancel = await request(app)
      .post('/api/rental-registration/reserve')
      .set(auth(managerSession.accessToken))
      .send({
        room_id: ids.roomSmall,
        tenant: {
          full_name: 'Reservation Cancel Tenant',
          phone: '0955555555',
          identity_number: 'ID-CANCEL',
          email: 'cancel@example.com',
          privacy_consent: true
        },
        start_date: '2026-07-15',
        rent_price: 800,
        deposit_amount: 800,
        billing_day: 5,
        note: 'Holding room'
      })
      .expect(201);

    expect(reservedForCancel.body).toMatchObject({
      room_id: ids.roomSmall,
      status: 'DRAFT',
      business_stage: 'RESERVED'
    });

    const document = await request(app)
      .post(`/api/contracts/${reservedForCancel.body.id}/documents`)
      .set(auth(managerSession.accessToken))
      .send({
        doc_type: 'SIGNED_SCAN',
        file_name: 'signed-contract.pdf',
        file_url: 'https://example.com/signed-contract.pdf',
        mime_type: 'application/pdf',
        file_size: 2048
      })
      .expect(201);

    expect(document.body).toMatchObject({
      contract_id: reservedForCancel.body.id,
      doc_type: 'SIGNED_SCAN',
      file_name: 'signed-contract.pdf',
      uploaded_by_user_id: ids.managerAUser
    });

    await request(app)
      .delete(`/api/contracts/${reservedForCancel.body.id}/documents/${document.body.id}`)
      .set(auth(managerSession.accessToken))
      .expect(204);

    expect(assetJobMocks.enqueueCloudinaryDeletion).toHaveBeenCalledWith(
      expect.anything(),
      'CONTRACT_DOCUMENT',
      expect.objectContaining({
        file_url: null,
        cloudinary_public_id: 'rent-apartment/test/signed-contract.pdf',
        cloudinary_delivery_type: 'authenticated'
      }),
      'CONTRACT_DOCUMENT_DELETED'
    );
    expect(fakeDb.contractDocuments).toHaveLength(0);

    await request(app)
      .post(`/api/rental-registration/${reservedForCancel.body.id}/cancel`)
      .set(auth(managerSession.accessToken))
      .send({})
      .expect(400);

    const cancelled = await request(app)
      .post(`/api/rental-registration/${reservedForCancel.body.id}/cancel`)
      .set(auth(managerSession.accessToken))
      .send({ reason: 'Tenant changed plans', cancel_date: '2026-07-10' })
      .expect(200);

    expect(cancelled.body).toMatchObject({
      id: reservedForCancel.body.id,
      status: 'CANCELLED',
      business_stage: 'CANCELLED'
    });
    expect(fakeDb.contractTenants.find((tenant) => tenant.contract_id === reservedForCancel.body.id)).toMatchObject({
      joined_at: '2026-07-15',
      left_at: '2026-07-15'
    });

    const reservedForHandover = await request(app)
      .post('/api/rental-registration/reserve')
      .set(auth(managerSession.accessToken))
      .send({
        room_id: ids.roomSmall,
        tenant_id: ids.tenantFree,
        start_date: '2026-08-01',
        rent_price: 850,
        deposit_amount: 850,
        billing_day: 7
      })
      .expect(201);

    const activated = await request(app)
      .post(`/api/rental-registration/${reservedForHandover.body.id}/handover`)
      .set(auth(managerSession.accessToken))
      .send({
        move_in_date: '2026-08-03',
        electricity_curr: 10,
        water_curr: 4,
        persons_count: 1,
        vehicles_count: 1,
        note: 'Clean handover'
      })
      .expect(200);

    expect(activated.body).toMatchObject({
      id: reservedForHandover.body.id,
      status: 'ACTIVE',
      business_stage: 'ACTIVE',
      move_in_date: '2026-08-03'
    });
    expect(fakeDb.utilityReadings.find((reading) => reading.room_id === ids.roomSmall && reading.month === '2026-08-01')).toMatchObject({
      status: 'APPROVED',
      electricity_curr: 10,
      water_curr: 4
    });
    expect(fakeDb.roomMonthExtras.find((extra) => extra.room_id === ids.roomSmall && extra.month === '2026-08-01')).toMatchObject({
      persons_count: 1,
      vehicles_count: 1
    });
  });

  it('allows only one concurrent reservation for the same room and tenant', async () => {
    const managerSession = await login('manager@example.com');
    const payload = {
      room_id: ids.roomSmall,
      tenant_id: ids.tenantFree,
      start_date: '2026-08-01',
      rent_price: 850,
      deposit_amount: 850,
      billing_day: 7
    };

    const responses = await Promise.all([
      request(app)
        .post('/api/rental-registration/reserve')
        .set(auth(managerSession.accessToken))
        .send(payload),
      request(app)
        .post('/api/rental-registration/reserve')
        .set(auth(managerSession.accessToken))
        .send(payload)
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const createdContracts = fakeDb.contracts.filter((contract) => contract.room_id === ids.roomSmall && contract.status === 'DRAFT');
    expect(createdContracts).toHaveLength(1);
    expect(fakeDb.contractTenants.filter((assignment) => (
      assignment.contract_id === createdContracts[0].id && assignment.tenant_id === ids.tenantFree
    ))).toHaveLength(1);
  });

  it('rejects invalid rental registration reservations and handovers', async () => {
    const managerSession = await login('manager@example.com');

    await request(app)
      .post('/api/rental-registration/reserve')
      .set(auth(managerSession.accessToken))
      .send({
        room_id: ids.roomA,
        tenant_id: ids.tenantFree,
        start_date: '2026-07-15',
        rent_price: 1000,
        deposit_amount: 1000,
        billing_day: 5
      })
      .expect(409);

    const duplicateTenantReservation = await request(app)
      .post('/api/rental-registration/reserve')
      .set(auth(managerSession.accessToken))
      .send({
        room_id: ids.roomSmall,
        tenant_id: ids.tenantA,
        start_date: '2026-07-15',
        rent_price: 800,
        deposit_amount: 800,
        billing_day: 5
      })
      .expect(409);

    expect(duplicateTenantReservation.body.code).toBe('TENANT_NOT_AVAILABLE');

    const validReservation = await request(app)
      .post('/api/rental-registration/reserve')
      .set(auth(managerSession.accessToken))
      .send({
        room_id: ids.roomSmall,
        tenant_id: ids.tenantFree,
        start_date: '2026-07-15',
        rent_price: 800,
        deposit_amount: 800,
        billing_day: 5
      })
      .expect(201);

    fakeDb.contractTenants.push({
      contract_id: validReservation.body.id,
      tenant_id: ids.tenantA,
      is_primary: false,
      joined_at: '2026-07-15',
      left_at: null
    });

    const overCapacity = await request(app)
      .post(`/api/rental-registration/${validReservation.body.id}/handover`)
      .set(auth(managerSession.accessToken))
      .send({
        move_in_date: '2026-07-15',
        electricity_curr: 1,
        water_curr: 1,
        persons_count: 2,
        vehicles_count: 0
      })
      .expect(409);

    expect(overCapacity.body.code).toBe('ROOM_MAX_OCCUPANTS_EXCEEDED');
  });

  it('submits, approves, and rejects utility readings', async () => {
    const tenantSession = await login('tenant@example.com');
    const managerSession = await login('manager@example.com');

    const submitted = await request(app)
      .post('/api/utility-readings')
      .set(auth(tenantSession.accessToken))
      .send({
        room_id: ids.roomA,
        month: '2026-07',
        electricity_curr: 150,
        water_curr: 75,
        note: 'July reading',
        evidence: {
          electricity: {
            file_name: 'electricity.jpg',
            file_url: 'https://example.com/electricity.jpg',
            mime_type: 'image/jpeg',
            file_size: 1024
          },
          water: {
            file_name: 'water.jpg',
            file_url: 'https://example.com/water.jpg',
            mime_type: 'image/jpeg',
            file_size: 2048
          }
        }
      })
      .expect(201);

    expect(submitted.body).toMatchObject({
      room_id: ids.roomA,
      month: '2026-07-01',
      electricity_prev: 120,
      water_prev: 60,
      status: 'SUBMITTED'
    });
    expect(fakeDb.utilityEvidence.filter((item) => item.utility_reading_id === submitted.body.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evidence_type: 'ELECTRIC', file_name: 'electricity.jpg' }),
        expect.objectContaining({ evidence_type: 'WATER', file_name: 'water.jpg' })
      ])
    );

    const duplicateSubmission = await request(app)
      .post('/api/utility-readings')
      .set(auth(tenantSession.accessToken))
      .send({
        room_id: ids.roomA,
        month: '2026-07',
        electricity_curr: 151,
        water_curr: 76
      })
      .expect(409);

    expect(duplicateSubmission.body.code).toBe('UTILITY_READING_LOCKED');

    const approved = await request(app)
      .post(`/api/utility-readings/${ids.readingSubmitted}/approve`)
      .set(auth(managerSession.accessToken))
      .expect(200);

    expect(approved.body).toMatchObject({
      id: ids.readingSubmitted,
      status: 'APPROVED',
      building_id: ids.buildingA
    });

    const rejected = await request(app)
      .post(`/api/utility-readings/${ids.readingToReject}/reject`)
      .set(auth(managerSession.accessToken))
      .send({ reason: 'Photo is unclear' })
      .expect(200);

    expect(rejected.body).toMatchObject({
      id: ids.readingToReject,
      status: 'REJECTED',
      rejection_reason: 'Photo is unclear'
    });
  });

  it('generates monthly invoices from approved utility readings', async () => {
    const managerSession = await login('manager@example.com');

    const generated = await request(app)
      .post('/api/invoices/generate/room')
      .set(auth(managerSession.accessToken))
      .send({ month: '2026-06', room_id: ids.roomA })
      .expect(201);

    expect(generated.body).toMatchObject({
      month: '2026-06-01',
      total: 1,
      skipped: []
    });
    expect(generated.body.generated).toHaveLength(1);
    expect(generated.body.generated[0]).toMatchObject({
      contract_id: ids.contractA,
      room_id: ids.roomA,
      status: 'DRAFT',
      issued_at: null,
      total: 1120
    });
    expect(fakeDb.utilityReadings.find((reading) => reading.id === ids.readingApproved)).toMatchObject({
      status: 'APPROVED'
    });
    expect(fakeDb.invoiceItems.filter((item) => item.invoice_id === generated.body.generated[0].id).map((item) => item.code)).toEqual([
      'ROOM_RENT',
      'ELECTRICITY',
      'WATER'
    ]);

    const missingBank = await request(app)
      .post(`/api/invoices/${generated.body.generated[0].id}/issue`)
      .set(auth(managerSession.accessToken));
    expect(missingBank.status, JSON.stringify(missingBank.body)).toBe(400);
    expect(missingBank.body).toMatchObject({ code: 'BANK_ACCOUNT_REQUIRED' });
    expect(fakeDb.invoices.find((invoice) => invoice.id === generated.body.generated[0].id)).toMatchObject({ status: 'DRAFT' });

    const issued = await request(app)
      .post(`/api/invoices/${generated.body.generated[0].id}/issue`)
      .set(auth(managerSession.accessToken))
      .send(issueBankPayload);
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);

    expect(fakeDb.utilityReadings.find((reading) => reading.id === ids.readingApproved)).toMatchObject({ status: 'INVOICED' });
    expect(fakeDb.paymentRequests.find((item) => item.invoice_id === generated.body.generated[0].id)).toMatchObject({
      status: 'WAITING_TRANSFER',
      amount: 1120,
      bank_code: issueBankPayload.bank_code,
      bank_account_no: issueBankPayload.bank_account_no,
      qr_image_url: expect.stringContaining('https://img.vietqr.io/image/970436-1234567890-compact2.png')
    });

  });

  it('requires explicit reset metadata before accepting a lower meter reading', async () => {
    const tenantSession = await login('tenant@example.com');
    const basePayload = {
      room_id: ids.roomA,
      month: '2026-07',
      electricity_curr: 5,
      water_curr: 70
    };

    const withoutReset = await request(app)
      .post('/api/utility-readings')
      .set(auth(tenantSession.accessToken))
      .send(basePayload)
      .expect(400);

    expect(withoutReset.body.code).toBe('UTILITY_METER_READING_DECREASED');

    const withoutReason = await request(app)
      .post('/api/utility-readings')
      .set(auth(tenantSession.accessToken))
      .send({ ...basePayload, electricity_meter_reset: true })
      .expect(400);

    expect(withoutReason.body.fieldErrors).toHaveProperty('meter_reset_note');

    const resetReading = await request(app)
      .post('/api/utility-readings')
      .set(auth(tenantSession.accessToken))
      .send({
        ...basePayload,
        electricity_meter_reset: true,
        meter_reset_note: 'Electricity meter replaced by the building manager.'
      })
      .expect(201);

    expect(resetReading.body).toMatchObject({
      electricity_prev: 120,
      electricity_curr: 5,
      electricity_meter_reset: true,
      water_meter_reset: false,
      meter_reset_note: 'Electricity meter replaced by the building manager.'
    });
  });

  it('keeps invoice issuing and payment approval idempotent under concurrent requests', async () => {
    const managerSession = await login('manager@example.com');
    const tenantSession = await login('tenant@example.com');

    const generationResponses = await Promise.all([
      request(app)
        .post('/api/invoices/generate/room')
        .set(auth(managerSession.accessToken))
        .send({ month: '2026-06', room_id: ids.roomA }),
      request(app)
        .post('/api/invoices/generate/room')
        .set(auth(managerSession.accessToken))
        .send({ month: '2026-06', room_id: ids.roomA })
    ]);

    expect(generationResponses.map((response) => response.status)).toEqual([201, 201]);
    const generatedInvoices = generationResponses.flatMap((response) => response.body.generated);
    expect(generatedInvoices).toHaveLength(1);
    expect(generationResponses.flatMap((response) => response.body.skipped)).toHaveLength(1);
    const invoiceId = generatedInvoices[0].id as string;
    expect(fakeDb.invoices.filter((invoice) => invoice.contract_id === ids.contractA && invoice.month === '2026-06-01')).toHaveLength(1);

    const issueResponses = await Promise.all([
      request(app)
        .post(`/api/invoices/${invoiceId}/issue`)
        .set(auth(managerSession.accessToken))
        .send(issueBankPayload),
      request(app)
        .post(`/api/invoices/${invoiceId}/issue`)
        .set(auth(managerSession.accessToken))
        .send(issueBankPayload)
    ]);

    expect(issueResponses.map((response) => response.status)).toEqual([200, 200]);
    const paymentRequests = fakeDb.paymentRequests.filter((item) => item.invoice_id === invoiceId);
    expect(paymentRequests).toHaveLength(1);

    const proof = await request(app)
      .post(`/api/payments/requests/${paymentRequests[0].id}/proofs`)
      .set(auth(tenantSession.accessToken))
      .set('Idempotency-Key', 'concurrent-proof-submission')
      .send({
        file_name: 'concurrent-proof.png',
        file_url: 'https://example.com/concurrent-proof.png',
        mime_type: 'image/png',
        file_size: 1024,
        transfer_amount: generatedInvoices[0].total
      })
      .expect(201);

    const approvalResponses = await Promise.all([
      request(app)
        .post(`/api/payments/proofs/${proof.body.id}/approve`)
        .set(auth(managerSession.accessToken)),
      request(app)
        .post(`/api/payments/proofs/${proof.body.id}/approve`)
        .set(auth(managerSession.accessToken))
    ]);

    expect(approvalResponses.map((response) => response.status)).toEqual([200, 200]);
    expect(approvalResponses.map((response) => response.body.idempotent).sort()).toEqual([false, true]);
    expect(fakeDb.payments.filter((payment) => payment.payment_proof_id === proof.body.id)).toHaveLength(1);
    expect(fakeDb.invoices.find((invoice) => invoice.id === invoiceId)).toMatchObject({ status: 'PAID' });
  });

  it('only permanently deletes clean draft invoices', async () => {
    const managerSession = await login('manager@example.com');

    const generated = await request(app)
      .post('/api/invoices/generate/room')
      .set(auth(managerSession.accessToken))
      .send({ month: '2026-06', room_id: ids.roomA })
      .expect(201);

    const invoiceId = generated.body.generated[0].id as string;

    const deleted = await request(app)
      .delete(`/api/invoices/${invoiceId}`)
      .set(auth(managerSession.accessToken));
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(204);

    expect(fakeDb.invoices.some((invoice) => invoice.id === invoiceId)).toBe(false);
    expect(fakeDb.invoiceItems.some((item) => item.invoice_id === invoiceId)).toBe(false);
    expect(fakeDb.utilityReadings.find((reading) => reading.id === ids.readingApproved)).toMatchObject({ status: 'APPROVED' });
  });

  it('voids paid invoices without deleting their financial history', async () => {
    const managerSession = await login('manager@example.com');

    const generated = await request(app)
      .post('/api/invoices/generate/room')
      .set(auth(managerSession.accessToken))
      .send({ month: '2026-06', room_id: ids.roomA })
      .expect(201);

    const invoiceId = generated.body.generated[0].id as string;

    await request(app)
      .post(`/api/invoices/${invoiceId}/issue`)
      .set(auth(managerSession.accessToken))
      .send(issueBankPayload)
      .expect(200);

    const paymentRequest = fakeDb.paymentRequests.find((item) => item.invoice_id === invoiceId)!;
    const proofId = '00000000-0000-4000-8000-000000009101';
    fakeDb.paymentProofs.push({
      id: proofId,
      payment_request_id: paymentRequest.id,
      status: 'APPROVED',
      file_url: 'https://example.com/payment-proof.png'
    });
    fakeDb.payments.push({
      id: '00000000-0000-4000-8000-000000009102',
      invoice_id: invoiceId,
      payment_request_id: paymentRequest.id,
      payment_proof_id: proofId,
      status: 'SUCCEEDED',
      amount: generated.body.generated[0].total
    });
    fakeDb.invoices.find((invoice) => invoice.id === invoiceId)!.status = 'PAID';

    const blockedDelete = await request(app)
      .delete(`/api/invoices/${invoiceId}`)
      .set(auth(managerSession.accessToken));
    expect(blockedDelete.status, JSON.stringify(blockedDelete.body)).toBe(409);
    expect(blockedDelete.body).toMatchObject({ code: 'INVOICE_DELETE_REQUIRES_VOID' });

    const missingReason = await request(app)
      .post(`/api/invoices/${invoiceId}/void`)
      .set(auth(managerSession.accessToken))
      .send({});
    expect(missingReason.status, JSON.stringify(missingReason.body)).toBe(400);

    const voided = await request(app)
      .post(`/api/invoices/${invoiceId}/void`)
      .set(auth(managerSession.accessToken))
      .send({ reason: 'Incorrect contracted rent amount' });
    expect(voided.status, JSON.stringify(voided.body)).toBe(200);
    expect(fakeDb.invoices.find((invoice) => invoice.id === invoiceId)).toMatchObject({
      status: 'VOID',
      void_reason: 'Incorrect contracted rent amount',
      voided_by_user_id: ids.managerAUser,
      voided_at: expect.any(String)
    });
    expect(fakeDb.invoiceItems.some((item) => item.invoice_id === invoiceId)).toBe(true);
    expect(fakeDb.paymentRequests.some((item) => item.invoice_id === invoiceId)).toBe(true);
    expect(fakeDb.paymentProofs.some((item) => item.payment_request_id === paymentRequest.id)).toBe(true);
    expect(fakeDb.payments.some((item) => item.invoice_id === invoiceId)).toBe(true);
    expect(fakeDb.utilityReadings.find((reading) => reading.id === ids.readingApproved)).toMatchObject({ status: 'INVOICED' });

    const replacement = await request(app)
      .post(`/api/invoices/${invoiceId}/replacement`)
      .set(auth(managerSession.accessToken));
    expect(replacement.status, JSON.stringify(replacement.body)).toBe(201);
    expect(replacement.body).toMatchObject({
      status: 'DRAFT',
      utility_reading_id: ids.readingApproved,
      replaces_invoice_id: invoiceId
    });
    expect(fakeDb.invoiceItems.filter((item) => item.invoice_id === replacement.body.id)).toHaveLength(
      fakeDb.invoiceItems.filter((item) => item.invoice_id === invoiceId).length
    );
    expect(fakeDb.utilityReadings.find((reading) => reading.id === ids.readingApproved)).toMatchObject({ status: 'INVOICED' });
  });

  it('creates payment requests and reviews submitted payment proofs', async () => {
    const managerSession = await login('manager@example.com');
    const tenantSession = await login('tenant@example.com');

    const requestResponse = await request(app)
      .post('/api/payments/requests')
      .set(auth(managerSession.accessToken))
      .send({ invoice_id: ids.invoiceIssued, ...issueBankPayload })
      .expect(201);

    expect(requestResponse.body).toMatchObject({
      invoice_id: ids.invoiceIssued,
      status: 'WAITING_TRANSFER',
      amount: 1200,
      qr_image_url: expect.stringContaining('https://img.vietqr.io/image/970436-1234567890-compact2.png')
    });

    const repeatedRequest = await request(app)
      .post('/api/payments/requests')
      .set(auth(managerSession.accessToken))
      .send({ invoice_id: ids.invoiceIssued, ...issueBankPayload })
      .expect(201);
    expect(repeatedRequest.body.id).toBe(requestResponse.body.id);
    expect(fakeDb.paymentRequests.filter((item) => item.invoice_id === ids.invoiceIssued)).toHaveLength(1);

    const rejectedProof = await request(app)
      .post(`/api/payments/requests/${requestResponse.body.id}/proofs`)
      .set(auth(tenantSession.accessToken))
      .send({
        file_name: 'proof-rejected.png',
        file_url: 'https://example.com/proof-rejected.png',
        mime_type: 'image/png',
        file_size: 1024,
        transfer_amount: 1200
      })
      .expect(201);

    const rejected = await request(app)
      .post(`/api/payments/proofs/${rejectedProof.body.id}/reject`)
      .set(auth(managerSession.accessToken))
      .send({ reason: 'Amount cannot be verified' })
      .expect(200);

    expect(rejected.body).toMatchObject({
      id: rejectedProof.body.id,
      status: 'REJECTED',
      rejection_reason: 'Amount cannot be verified'
    });

    const approvedProof = await request(app)
      .post(`/api/payments/requests/${requestResponse.body.id}/proofs`)
      .set(auth(tenantSession.accessToken))
      .send({
        file_name: 'proof-approved.png',
        file_url: 'https://example.com/proof-approved.png',
        mime_type: 'image/png',
        file_size: 2048,
        transfer_amount: 1200
      })
      .expect(201);

    const repeatedSubmission = await request(app)
      .post(`/api/payments/requests/${requestResponse.body.id}/proofs`)
      .set(auth(tenantSession.accessToken))
      .send({
        file_name: 'proof-approved.png',
        file_url: 'https://example.com/proof-approved.png',
        mime_type: 'image/png',
        file_size: 2048,
        transfer_amount: 1200
      })
      .expect(201);
    expect(repeatedSubmission.body.id).toBe(approvedProof.body.id);

    const approved = await request(app)
      .post(`/api/payments/proofs/${approvedProof.body.id}/approve`)
      .set(auth(managerSession.accessToken));
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);

    expect(approved.body).toMatchObject({
      paid_amount: 1200,
      remaining_amount: 0,
      invoice_status: 'PAID'
    });
    expect(approved.body.proof).toMatchObject({
      id: approvedProof.body.id,
      status: 'APPROVED'
    });
    expect(fakeDb.paymentRequests.find((item) => item.id === requestResponse.body.id)).toMatchObject({
      status: 'VERIFIED'
    });
    expect(fakeDb.invoices.find((invoice) => invoice.id === ids.invoiceIssued)).toMatchObject({
      status: 'PAID'
    });

    const repeatedApproval = await request(app)
      .post(`/api/payments/proofs/${approvedProof.body.id}/approve`)
      .set(auth(managerSession.accessToken))
      .expect(200);
    expect(repeatedApproval.body).toMatchObject({ idempotent: true, paid_amount: 1200 });

    const originalPayment = fakeDb.payments.find((item) => item.payment_proof_id === approvedProof.body.id)!;
    expect(fakeDb.payments.filter((item) => item.payment_proof_id === approvedProof.body.id)).toHaveLength(1);
    expect(originalPayment).toMatchObject({
      entry_type: 'PAYMENT',
      status: 'SUCCEEDED',
      amount: 1200,
      original_payment_id: null
    });

    const reversed = await request(app)
      .post(`/api/payments/ledger/${originalPayment.id}/reverse`)
      .set(auth(managerSession.accessToken))
      .send({ reason: 'Payment was confirmed against the wrong bank transaction' })
      .expect(201);
    expect(reversed.body).toMatchObject({
      paid_amount: 0,
      remaining_amount: 1200,
      invoice_status: 'ISSUED',
      idempotent: false,
      reversal: {
        entry_type: 'REVERSAL',
        original_payment_id: originalPayment.id,
        amount: 1200
      }
    });
    expect(fakeDb.payments.find((item) => item.id === originalPayment.id)).toEqual(originalPayment);
    expect(fakeDb.paymentRequests.find((item) => item.id === requestResponse.body.id)).toMatchObject({ status: 'WAITING_TRANSFER' });

    const repeatedReversal = await request(app)
      .post(`/api/payments/ledger/${originalPayment.id}/reverse`)
      .set(auth(managerSession.accessToken))
      .send({ reason: 'Payment was confirmed against the wrong bank transaction' })
      .expect(201);
    expect(repeatedReversal.body).toMatchObject({ idempotent: true, paid_amount: 0 });
    expect(fakeDb.payments.filter((item) => item.original_payment_id === originalPayment.id)).toHaveLength(1);

    expect(fakeDb.auditLogs.filter((item) => item.action === 'PAYMENT_PROOF_SUBMITTED')).toHaveLength(2);
    expect(fakeDb.auditLogs.filter((item) => item.action === 'PAYMENT_PROOF_REJECTED')).toHaveLength(1);
    expect(fakeDb.auditLogs.filter((item) => item.action === 'PAYMENT_PROOF_APPROVED')).toHaveLength(1);
    expect(fakeDb.auditLogs.filter((item) => item.action === 'PAYMENT_REVERSED')).toHaveLength(1);
  });

  it('rejects an approval that would exceed the current invoice balance', async () => {
    const managerSession = await login('manager@example.com');
    const tenantSession = await login('tenant@example.com');
    const requestResponse = await request(app)
      .post('/api/payments/requests')
      .set(auth(managerSession.accessToken))
      .send({ invoice_id: ids.invoiceIssued, ...issueBankPayload })
      .expect(201);

    const proof = await request(app)
      .post(`/api/payments/requests/${requestResponse.body.id}/proofs`)
      .set(auth(tenantSession.accessToken))
      .send({
        file_name: 'proof-over-limit.png',
        file_url: 'https://example.com/proof-over-limit.png',
        mime_type: 'image/png',
        file_size: 1024,
        transfer_amount: 800
      })
      .expect(201);

    fakeDb.payments.push({
      id: '00000000-0000-4000-8000-000000009201',
      invoice_id: ids.invoiceIssued,
      payment_request_id: requestResponse.body.id,
      payment_proof_id: null,
      entry_type: 'PAYMENT',
      original_payment_id: null,
      method: 'BANK_TRANSFER',
      status: 'SUCCEEDED',
      amount: 600,
      paid_at: '2026-06-14T00:00:00.000Z'
    });

    const response = await request(app)
      .post(`/api/payments/proofs/${proof.body.id}/approve`)
      .set(auth(managerSession.accessToken));
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body).toMatchObject({ code: 'PAYMENT_EXCEEDS_INVOICE_BALANCE' });
    expect(fakeDb.paymentProofs.find((item) => item.id === proof.body.id)).toMatchObject({ status: 'PENDING' });
    expect(fakeDb.payments.some((item) => item.payment_proof_id === proof.body.id)).toBe(false);
  });
});
