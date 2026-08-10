import type { Server } from 'http';
import { logger } from './logger.service';
import { markApplicationShuttingDown } from './readiness.service';

export interface ShutdownDependencies {
  server: Pick<Server, 'close'> & Partial<Pick<Server, 'closeAllConnections' | 'closeIdleConnections'>>;
  timeoutMs: number;
  stopSchedulers: () => void;
  closeDatabase: () => Promise<void>;
  flushMonitoring: () => Promise<unknown>;
  flushLogger: () => void;
  exit: (code: number) => void;
}

const waitForServerClose = async (
  server: ShutdownDependencies['server'],
  timeoutMs: number
): Promise<boolean> => {
  let timeout: NodeJS.Timeout | undefined;
  const closed = new Promise<boolean>((resolve, reject) => {
    server.close((error?: Error) => error ? reject(error) : resolve(true));
  });
  const timedOut = new Promise<boolean>((resolve) => {
    timeout = setTimeout(() => {
      server.closeAllConnections?.();
      resolve(false);
    }, timeoutMs);
    timeout.unref();
  });

  try {
    return await Promise.race([closed, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export const createGracefulShutdown = (dependencies: ShutdownDependencies) => {
  let activeShutdown: Promise<void> | null = null;

  return (reason: string, requestedExitCode = 0): Promise<void> => {
    if (activeShutdown) return activeShutdown;
    activeShutdown = (async () => {
      let exitCode = requestedExitCode;
      markApplicationShuttingDown();
      dependencies.stopSchedulers();
      dependencies.server.closeIdleConnections?.();
      logger.info({ reason, timeoutMs: dependencies.timeoutMs }, 'Graceful shutdown started');

      try {
        const drained = await waitForServerClose(dependencies.server, dependencies.timeoutMs);
        if (!drained) {
          exitCode = 1;
          logger.error({ reason }, 'HTTP shutdown timeout exceeded; forced connections closed');
        }
      } catch (error) {
        exitCode = 1;
        logger.error({ error, reason }, 'HTTP server failed to close cleanly');
      }

      try {
        await dependencies.closeDatabase();
      } catch (error) {
        exitCode = 1;
        logger.error({ error }, 'Database pool failed to close cleanly');
      }

      try {
        await dependencies.flushMonitoring();
      } catch (error) {
        exitCode = 1;
        logger.error({ error }, 'Error monitoring failed to flush');
      }

      logger.info({ reason, exitCode }, 'Graceful shutdown completed');
      dependencies.flushLogger();
      dependencies.exit(exitCode);
    })();
    return activeShutdown;
  };
};
