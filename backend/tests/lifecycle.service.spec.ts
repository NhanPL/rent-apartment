import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGracefulShutdown } from '../src/shared/services/lifecycle.service';
import {
  checkApplicationReadiness,
  resetReadinessForTests
} from '../src/shared/services/readiness.service';

describe('application lifecycle', () => {
  afterEach(() => resetReadinessForTests());

  it('reports database readiness and failures without affecting liveness', async () => {
    await expect(checkApplicationReadiness(async () => undefined)).resolves.toEqual({
      ready: true,
      checks: { database: 'up', lifecycle: 'running' }
    });
    await expect(checkApplicationReadiness(async () => {
      throw new Error('database unavailable');
    })).resolves.toEqual({
      ready: false,
      checks: { database: 'down', lifecycle: 'running' }
    });
  });

  it('drains once, closes resources in order, and exits cleanly', async () => {
    const events: string[] = [];
    const close = vi.fn((callback: (error?: Error) => void) => {
      events.push('server');
      callback();
      return {} as never;
    });
    const shutdown = createGracefulShutdown({
      server: { close, closeIdleConnections: () => events.push('idle') },
      timeoutMs: 1000,
      stopSchedulers: () => events.push('schedulers'),
      closeDatabase: async () => { events.push('database'); },
      flushMonitoring: async () => { events.push('monitoring'); },
      flushLogger: () => events.push('logger'),
      exit: (code) => events.push(`exit:${code}`)
    });

    const first = shutdown('SIGTERM');
    const second = shutdown('SIGINT');
    expect(first).toBe(second);
    await first;

    expect(events).toEqual([
      'schedulers', 'idle', 'server', 'database', 'monitoring', 'logger', 'exit:0'
    ]);
    expect(close).toHaveBeenCalledOnce();
    await expect(checkApplicationReadiness(async () => undefined)).resolves.toMatchObject({
      ready: false,
      checks: { database: 'not_checked', lifecycle: 'draining' }
    });
  });
});
