import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifyOperationalFeature,
  getMetricsSnapshot,
  observeHttpRequest,
  resetMetricsForTests
} from '../src/shared/services/metrics.service';
import { sanitizeMonitoringEvent } from '../src/shared/services/monitoring.service';

describe('operations monitoring', () => {
  beforeEach(() => resetMetricsForTests());

  it('tracks request errors, latency and feature failures', () => {
    observeHttpRequest({ durationMs: 40, statusCode: 200, feature: 'other' });
    observeHttpRequest({ durationMs: 220, statusCode: 401, feature: 'auth_login' });
    const snapshot = getMetricsSnapshot();

    expect(snapshot.http).toMatchObject({
      requests: 2,
      errors: 1,
      errorRatePercent: 50,
      averageDurationMs: 130,
      maxDurationMs: 220
    });
    expect(snapshot.http.latencyBucketsMs['250']).toBe(2);
    expect(snapshot.failures.auth_login).toBe(1);
  });

  it('uses bounded feature labels instead of raw URLs', () => {
    expect(classifyOperationalFeature('/api/auth/login?identifier=private')).toBe('auth_login');
    expect(classifyOperationalFeature('/api/uploads/signature')).toBe('upload');
    expect(classifyOperationalFeature('/api/invoices/secret-id')).toBe('invoice');
    expect(classifyOperationalFeature('/api/payments/proofs/secret-id')).toBe('payment');
  });

  it('removes request and user PII from monitoring events', () => {
    const event = sanitizeMonitoringEvent({
      request: {
        method: 'POST',
        url: 'https://example.test/api/documents/delivery/secret',
        headers: { authorization: 'Bearer secret' },
        data: { password: 'secret' }
      },
      user: { id: 'user-1', email: 'private@example.test', ip_address: '127.0.0.1' },
      extra: { signed_url: 'https://res.cloudinary.com/private' }
    });

    expect(event.request).toEqual({ method: 'POST' });
    expect(event.user).toEqual({ id: 'user-1' });
    expect(event.extra).toEqual({ signed_url: '[REDACTED]' });
  });
});
