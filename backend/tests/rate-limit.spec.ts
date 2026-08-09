import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  resolveTrustProxyHops,
  type AppEnvironment
} from '../src/config/env';
import { createRateLimitMiddleware } from '../src/config/rate-limit';

const createLimitedApp = (trustProxyHops = 0) => {
  const app = express();
  if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);
  app.use(createRateLimitMiddleware({
    windowMinutes: 1,
    max: 2,
    code: 'TEST_RATE_LIMIT',
    message: 'Request limit reached.'
  }));
  app.get('/limited', (req, res) => res.json({ ip: req.ip }));
  return app;
};

describe('rate-limit configuration', () => {
  it('returns standard rate-limit headers and a readable 429 response', async () => {
    const app = createLimitedApp();

    const first = await request(app).get('/limited').expect(200);
    await request(app).get('/limited').expect(200);
    const blocked = await request(app).get('/limited').expect(429);

    expect(first.headers['ratelimit-policy']).toEqual(expect.any(String));
    expect(first.headers['ratelimit']).toEqual(expect.any(String));
    expect(first.headers).not.toHaveProperty('x-ratelimit-limit');
    expect(blocked.headers['retry-after']).toEqual(expect.any(String));
    expect(blocked.body).toEqual({
      code: 'TEST_RATE_LIMIT',
      message: 'Request limit reached.',
      fieldErrors: null,
      requestId: 'unknown'
    });
  });

  it('uses the originating IP behind the configured reverse-proxy hop', async () => {
    const app = createLimitedApp(1);

    const firstClient = await request(app)
      .get('/limited')
      .set('X-Forwarded-For', '198.51.100.10')
      .expect(200);
    await request(app)
      .get('/limited')
      .set('X-Forwarded-For', '198.51.100.10')
      .expect(200);
    await request(app)
      .get('/limited')
      .set('X-Forwarded-For', '198.51.100.10')
      .expect(429);

    const secondClient = await request(app)
      .get('/limited')
      .set('X-Forwarded-For', '198.51.100.11')
      .expect(200);

    expect(firstClient.body.ip).toBe('198.51.100.10');
    expect(secondClient.body.ip).toBe('198.51.100.11');
  });

  it.each<AppEnvironment>(['development', 'test'])(
    'defaults trust proxy to direct connections in %s',
    (environment) => {
      expect(resolveTrustProxyHops(environment)).toBe(0);
    }
  );

  it.each<AppEnvironment>(['staging', 'production'])(
    'requires an explicit trust proxy topology in %s',
    (environment) => {
      expect(() => resolveTrustProxyHops(environment)).toThrow(
        `TRUST_PROXY_HOPS is required when APP_ENV=${environment}`
      );
      expect(resolveTrustProxyHops(environment, 1)).toBe(1);
    }
  );
});
