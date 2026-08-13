import { query } from '../../db';
import type { DatabaseTimestamp } from '../../shared/types/database';
import { AppError } from '../../shared/errors/app-error';

export interface NotificationFilters {
  page: number;
  pageSize: number;
  unreadOnly: boolean;
}

interface NotificationRow {
  id: string;
  template_code: string;
  payload: Record<string, unknown>;
  entity_type: string | null;
  entity_id: string | null;
  read_at: DatabaseTimestamp | null;
  created_at: DatabaseTimestamp;
}

interface CountRow { total: number; unread_count: number }

export const listNotifications = async (userId: string, filters: NotificationFilters) => {
  const conditions = ['recipient_user_id=$1'];
  if (filters.unreadOnly) conditions.push('read_at IS NULL');
  const where = conditions.join(' AND ');
  const offset = (filters.page - 1) * filters.pageSize;
  const [count, items] = await Promise.all([
    query<CountRow>(
      `SELECT COUNT(*) FILTER (WHERE ${where})::int AS total,
              COUNT(*) FILTER (WHERE recipient_user_id=$1 AND read_at IS NULL)::int AS unread_count
       FROM in_app_notification`,
      [userId]
    ),
    query<NotificationRow>(
      `SELECT id, template_code, payload, entity_type, entity_id, read_at, created_at
       FROM in_app_notification
       WHERE ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [userId, filters.pageSize, offset]
    )
  ]);
  return {
    items: items.rows,
    total: Number(count.rows[0]?.total ?? 0),
    unreadCount: Number(count.rows[0]?.unread_count ?? 0),
    page: filters.page,
    pageSize: filters.pageSize
  };
};

export const markNotificationRead = async (userId: string, notificationId: string): Promise<void> => {
  const result = await query<{ id: string }>(
    `UPDATE in_app_notification
     SET read_at=COALESCE(read_at, now())
     WHERE id=$1 AND recipient_user_id=$2
     RETURNING id`,
    [notificationId, userId]
  );
  if (!result.rows[0]) throw new AppError(404, 'Notification not found.', 'NOTIFICATION_NOT_FOUND');
};

export const markAllNotificationsRead = async (userId: string): Promise<void> => {
  await query(
    `UPDATE in_app_notification SET read_at=now()
     WHERE recipient_user_id=$1 AND read_at IS NULL`,
    [userId]
  );
};
