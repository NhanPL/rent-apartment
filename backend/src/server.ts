import { app } from './app';
import { env } from './config/env';
import { assertDatabaseConnection } from './db/connection';

async function bootstrap() {
  try {
    await assertDatabaseConnection();
    // eslint-disable-next-line no-console
    console.log('Database connected successfully.');

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
