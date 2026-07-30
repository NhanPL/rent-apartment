import { app } from './app';
import { env } from './config/env';
import { assertDatabaseConnection } from './db/connection';
import { startSessionCleanupScheduler } from './modules/auth/session.service';
import { startDocumentAssetScheduler } from './modules/documents/document-asset-jobs.service';
import { toSafeErrorLog } from './shared/utils/safe-log';

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled rejection', toSafeErrorLog(reason));
});

process.on('uncaughtException', (error) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught exception', toSafeErrorLog(error));
});

async function bootstrap() {
  try {
    await assertDatabaseConnection();
    // eslint-disable-next-line no-console
    console.log('Database connected successfully.');
    startSessionCleanupScheduler();
    startDocumentAssetScheduler();

    app.listen(env.PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Backend listening on port ${env.PORT}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error((error as Error).message);
    process.exit(1);
  }
}

void bootstrap();
