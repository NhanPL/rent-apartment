import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  parseAllowedOrigins
} from '../src/config/cors';
import { resolveCorsAllowedOrigins } from '../src/config/env';

const allowedOrigin = 'http://localhost:5173';
const secondAllowedOrigin = 'http://127.0.0.1:5173';
const deniedOrigin = 'https://malicious.example';

const splitHeader = (value: string | undefined): string[] => (
  (value ?? '').split(',').map((item) => item.trim()).filter(Boolean)
);

describe('CORS configuration', () => {
  it('parses, normalizes, and de-duplicates exact origins', () => {
    expect(parseAllowedOrigins(
      ' https://app.example.com,https://app.example.com/,http://localhost:5173 '
    )).toEqual([
      'https://app.example.com',
      'http://localhost:5173'
    ]);
  });

  it('rejects wildcard and non-origin values', () => {
    expect(() => parseAllowedOrigins('*')).toThrow(
      'CORS_ALLOWED_ORIGINS cannot contain a wildcard'
    );
    expect(() => parseAllowedOrigins('https://app.example.com/path')).toThrow(
      'Invalid CORS origin'
    );
  });

  it('defaults only development and test while requiring deployed origins', () => {
    expect(resolveCorsAllowedOrigins('development', '')).toBe(allowedOrigin);
    expect(resolveCorsAllowedOrigins('test', '  ')).toBe(allowedOrigin);
    expect(() => resolveCorsAllowedOrigins('staging', '')).toThrow(
      'CORS_ALLOWED_ORIGINS is required when APP_ENV=staging'
    );
    expect(() => resolveCorsAllowedOrigins('production', '')).toThrow(
      'CORS_ALLOWED_ORIGINS is required when APP_ENV=production'
    );
    expect(resolveCorsAllowedOrigins(
      'production',
      'https://rent-apartment.example'
    )).toBe('https://rent-apartment.example');
  });

  it.each([allowedOrigin, secondAllowedOrigin])(
    'allows credentialed requests from %s and varies by Origin',
    async (origin) => {
      const response = await request(app)
        .get('/health')
        .set('Origin', origin)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(splitHeader(response.headers.vary)).toContain('Origin');
    }
  );

  it('denies requests from origins outside the allowlist', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', deniedOrigin)
      .expect(403);

    expect(response.body).toMatchObject({
      code: 'CORS_ORIGIN_DENIED',
      message: 'Request origin is not allowed'
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers an allowed preflight with only required methods and headers', async () => {
    const response = await request(app)
      .options('/api/auth/login')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(splitHeader(response.headers['access-control-allow-methods'])).toEqual(
      CORS_ALLOWED_METHODS
    );
    expect(splitHeader(response.headers['access-control-allow-headers'])).toEqual(
      CORS_ALLOWED_HEADERS
    );
    expect(response.headers['access-control-allow-methods']).not.toContain('TRACE');
    expect(response.headers['access-control-allow-headers']).not.toContain('X-Requested-With');
    expect(splitHeader(response.headers.vary)).toContain('Origin');
  });

  it('denies preflight requests from an origin outside the allowlist', async () => {
    const response = await request(app)
      .options('/api/auth/login')
      .set('Origin', deniedOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .expect(403);

    expect(response.body).toMatchObject({ code: 'CORS_ORIGIN_DENIED' });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
