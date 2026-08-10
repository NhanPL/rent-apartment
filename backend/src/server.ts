import { app } from './app';
import { env } from './config/env';
import { assertDatabaseConnection } from './db/connection';
import { startSessionCleanupScheduler } from './modules/auth/session.service';
import { startDocumentAssetScheduler } from './modules/documents/document-asset-jobs.service';
import { stopDocumentAssetScheduler } from './modules/documents/document-asset-jobs.service';
import { toSafeErrorLog } from './shared/utils/safe-log';
import { logger } from './shared/services/logger.service';
import { flushMonitoring, initializeMonitoring } from './shared/services/monitoring.service';
import { createGracefulShutdown } from './shared/services/lifecycle.service';
import { pool } from './db/pool';

async function bootstrap() {
  try {
    initializeMonitoring();
    await assertDatabaseConnection();
    logger.info({}, 'Database connected successfully');
    const sessionCleanupTimer = startSessionCleanupScheduler();
    startDocumentAssetScheduler();

    const server = app.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, 'Backend listening');
    });
    const shutdown = createGracefulShutdown({
      server,
      timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
      stopSchedulers: () => {
        clearInterval(sessionCleanupTimer);
        stopDocumentAssetScheduler();
      },
      closeDatabase: () => pool.end(),
      flushMonitoring: () => flushMonitoring(),
      flushLogger: () => logger.flush(),
      exit: (code) => process.exit(code)
    });

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('unhandledRejection', (reason) => {
      logger.error({ error: toSafeErrorLog(reason) }, 'Unhandled rejection');
      void shutdown('UNHANDLED_REJECTION', 1);
    });
    process.on('uncaughtException', (error) => {
      logger.error({ error: toSafeErrorLog(error) }, 'Uncaught exception');
      void shutdown('UNCAUGHT_EXCEPTION', 1);
    });
  } catch (error) {
    logger.error({ error }, 'Backend bootstrap failed');
    process.exit(1);
  }
}

void bootstrap();
