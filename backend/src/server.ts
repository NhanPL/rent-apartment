import { app } from './app';
import { env } from './config/env';
import { assertDatabaseConnection } from './db/connection';
import { startSessionCleanupScheduler } from './modules/auth/session.service';
import { startDocumentAssetScheduler } from './modules/documents/document-asset-jobs.service';
import { toSafeErrorLog } from './shared/utils/safe-log';
import { logger } from './shared/services/logger.service';

process.on('unhandledRejection', (reason) => {
  logger.error({ error: toSafeErrorLog(reason) }, 'Unhandled rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error: toSafeErrorLog(error) }, 'Uncaught exception');
});

async function bootstrap() {
  try {
    await assertDatabaseConnection();
    logger.info({}, 'Database connected successfully');
    startSessionCleanupScheduler();
    startDocumentAssetScheduler();

    app.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, 'Backend listening');
    });
  } catch (error) {
    logger.error({ error }, 'Backend bootstrap failed');
    process.exit(1);
  }
}

void bootstrap();
