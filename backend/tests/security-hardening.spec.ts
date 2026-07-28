import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { buildSecurityHeadersOptions } from '../src/config/security';
import { createErrorHandler } from '../src/shared/middleware/error-handler';

describe('security headers and request hardening', () => {
  it('sets CSP, MIME sniffing, clickjacking, and referrer protections', async () => {
    const response = await request(app).get('/health').expect(200);
    const csp = response.headers['content-security-policy'] as string;

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain('https://api.cloudinary.com');
    expect(csp).toContain('https://res.cloudinary.com');
    expect(csp).toContain('https://img.vietqr.io');
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('enables HSTS and insecure-request upgrades only in production', async () => {
    const productionApp = express();
    productionApp.use(helmet(buildSecurityHeadersOptions('production')));
    productionApp.get('/health', (_req, res) => res.json({ ok: true }));

    const response = await request(productionApp).get('/health').expect(200);

    expect(response.headers['strict-transport-security']).toBe(
      'max-age=31536000'
    );
    expect(response.headers['content-security-policy']).toContain(
      'upgrade-insecure-requests'
    );
  });

  it('rejects JSON bodies larger than the global limit', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        identifier: 'manager@example.com',
        password: 'password',
        padding: 'x'.repeat(300 * 1024)
      })
      .expect(413);

    expect(response.body).toEqual({
      message: 'Request body is too large.',
      code: 'PAYLOAD_TOO_LARGE'
    });
  });

  it('returns a stable validation response for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"identifier":')
      .expect(400);

    expect(response.body).toEqual({
      message: 'Request body contains invalid JSON.',
      code: 'INVALID_JSON'
    });
  });

  it('rejects direct multipart uploads before any file is accepted', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .field('identifier', 'manager@example.com')
      .attach('file', Buffer.from('not-a-real-file'), 'payload.jpg')
      .expect(415);

    expect(response.body).toMatchObject({
      code: 'DIRECT_FILE_UPLOAD_NOT_SUPPORTED',
      message: 'Direct file uploads are not supported. Request a signed Cloudinary upload instead.'
    });
  });

  it.each(['staging', 'production'] as const)(
    'does not expose stack traces or SQL errors in %s',
    async (environment) => {
      const hardenedApp = express();
      hardenedApp.get('/error', () => {
        const error = new Error('syntax error at or near SELECT password_hash');
        Object.assign(error, { code: '42601' });
        throw error;
      });
      hardenedApp.use(createErrorHandler(environment));

      const response = await request(hardenedApp).get('/error').expect(500);

      expect(response.body).toEqual({
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
      expect(JSON.stringify(response.body)).not.toContain('SELECT');
      expect(response.body).not.toHaveProperty('stack');
    }
  );
});
