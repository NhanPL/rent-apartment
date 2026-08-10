import { env } from '../../config/env';
import { pool } from '../../db/pool';
import { logger } from './logger.service';

export type OperationalFeature = 'auth_login' | 'upload' | 'invoice' | 'payment' | 'other';

const latencyBucketsMs = [50, 100, 250, 500, 1000, 2000, 5000] as const;
const startedAt = new Date().toISOString();
const alertLastSentAt = new Map<string, number>();

interface MetricsState {
  requests: number;
  errors: number;
  durationTotalMs: number;
  durationMaxMs: number;
  latencyBuckets: Record<string, number>;
  failures: Record<Exclude<OperationalFeature, 'other'>, number>;
}

const createState = (): MetricsState => ({
  requests: 0,
  errors: 0,
  durationTotalMs: 0,
  durationMaxMs: 0,
  latencyBuckets: Object.fromEntries(latencyBucketsMs.map((bucket) => [String(bucket), 0])),
  failures: { auth_login: 0, upload: 0, invoice: 0, payment: 0 }
});

let state = createState();

export const classifyOperationalFeature = (url: string): OperationalFeature => {
  const path = url.split('?', 1)[0];
  if (path === '/api/auth/login') return 'auth_login';
  if (path.startsWith('/api/uploads')) return 'upload';
  if (path.startsWith('/api/invoices') || path.startsWith('/api/monthly-billing')) return 'invoice';
  if (path.startsWith('/api/payments')) return 'payment';
  return 'other';
};

const warnAtMostOncePerWindow = (alert: string, bindings: Record<string, unknown>): void => {
  const now = Date.now();
  const lastSent = alertLastSentAt.get(alert) ?? 0;
  if (now - lastSent < env.METRICS_ALERT_COOLDOWN_MINUTES * 60_000) return;
  alertLastSentAt.set(alert, now);
  logger.warn({ alert, ...bindings }, 'Operational alert threshold exceeded');
};

const evaluateAlerts = (durationMs: number, feature: OperationalFeature, failed: boolean): void => {
  if (durationMs >= env.METRICS_ALERT_LATENCY_MS) {
    warnAtMostOncePerWindow('HIGH_RESPONSE_LATENCY', { durationMs });
  }
  if (state.requests >= env.METRICS_ALERT_MIN_REQUESTS) {
    const errorRatePercent = (state.errors / state.requests) * 100;
    if (errorRatePercent >= env.METRICS_ALERT_ERROR_RATE_PERCENT) {
      warnAtMostOncePerWindow('HIGH_REQUEST_ERROR_RATE', { errorRatePercent });
    }
  }
  if (failed && feature === 'auth_login'
    && state.failures.auth_login >= env.METRICS_ALERT_LOGIN_FAILURES) {
    warnAtMostOncePerWindow('HIGH_LOGIN_FAILURE_RATE', {
      loginFailures: state.failures.auth_login
    });
  }

  const poolTotal = pool.totalCount;
  const utilizationPercent = env.DB_POOL_MAX > 0 ? (poolTotal / env.DB_POOL_MAX) * 100 : 0;
  if (utilizationPercent >= env.METRICS_ALERT_DB_POOL_PERCENT || pool.waitingCount > 0) {
    warnAtMostOncePerWindow('DATABASE_POOL_PRESSURE', {
      utilizationPercent,
      waitingCount: pool.waitingCount
    });
  }
};

export const observeHttpRequest = (input: {
  durationMs: number;
  statusCode: number;
  feature: OperationalFeature;
}): void => {
  const failed = input.statusCode >= 400;
  state.requests += 1;
  state.durationTotalMs += input.durationMs;
  state.durationMaxMs = Math.max(state.durationMaxMs, input.durationMs);
  if (failed) {
    state.errors += 1;
    if (input.feature !== 'other') state.failures[input.feature] += 1;
  }
  latencyBucketsMs.forEach((bucket) => {
    if (input.durationMs <= bucket) state.latencyBuckets[String(bucket)] += 1;
  });
  evaluateAlerts(input.durationMs, input.feature, failed);
};

export const getMetricsSnapshot = () => ({
  startedAt,
  collectedAt: new Date().toISOString(),
  http: {
    requests: state.requests,
    errors: state.errors,
    errorRatePercent: state.requests === 0 ? 0 : (state.errors / state.requests) * 100,
    averageDurationMs: state.requests === 0 ? 0 : state.durationTotalMs / state.requests,
    maxDurationMs: state.durationMaxMs,
    latencyBucketsMs: { ...state.latencyBuckets }
  },
  failures: { ...state.failures },
  databasePool: {
    configuredMax: env.DB_POOL_MAX,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    utilizationPercent: env.DB_POOL_MAX === 0 ? 0 : (pool.totalCount / env.DB_POOL_MAX) * 100
  }
});

export const resetMetricsForTests = (): void => {
  state = createState();
  alertLastSentAt.clear();
};
