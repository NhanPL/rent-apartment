import { withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../../shared/services/audit-log.service';

export type AppLanguage = 'en' | 'vi';

export const updatePreferredLanguage = async (userId: string, language: AppLanguage) => (
  withTransaction(async (client) => {
    const current = await client.query<{ preferred_language: AppLanguage }>(
      'SELECT preferred_language FROM app_user WHERE id=$1 FOR UPDATE',
      [userId]
    );
    if (!current.rows[0]) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    await client.query('UPDATE app_user SET preferred_language=$2 WHERE id=$1', [userId, language]);
    await writeAuditLog(client, {
      actorUserId: userId,
      action: 'USER_LANGUAGE_CHANGED',
      entityType: 'APP_USER',
      entityId: userId,
      before: { preferredLanguage: current.rows[0].preferred_language },
      after: { preferredLanguage: language }
    });
    return { preferredLanguage: language };
  })
);
