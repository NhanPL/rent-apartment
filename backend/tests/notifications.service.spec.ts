import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/db', () => ({ query: dbMocks.query }));

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '../src/modules/notifications/notifications.service';

describe('in-app notifications', () => {
  beforeEach(() => dbMocks.query.mockReset());

  it('scopes list and unread count to the authenticated user', async () => {
    dbMocks.query
      .mockResolvedValueOnce({ rows: [{ total: 1, unread_count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'notification-1', read_at: null }] });

    const response = await listNotifications('user-1', { page: 1, pageSize: 10, unreadOnly: true });

    expect(response).toMatchObject({ total: 1, unreadCount: 1, page: 1, pageSize: 10 });
    expect(response.items).toHaveLength(1);
    for (const [, params] of dbMocks.query.mock.calls) expect(params[0]).toBe('user-1');
    expect(dbMocks.query.mock.calls[1][0]).toContain('recipient_user_id=$1 AND read_at IS NULL');
  });

  it('cannot mark another user notification as read', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await expect(markNotificationRead('user-1', '00000000-0000-4000-8000-000000000901'))
      .rejects.toMatchObject({ statusCode: 404, code: 'NOTIFICATION_NOT_FOUND' });
    expect(dbMocks.query.mock.calls[0][1]).toEqual([
      '00000000-0000-4000-8000-000000000901',
      'user-1'
    ]);
  });

  it('marks only the authenticated user notifications as read', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await markAllNotificationsRead('user-2');
    expect(dbMocks.query.mock.calls[0][0]).toContain('WHERE recipient_user_id=$1');
    expect(dbMocks.query.mock.calls[0][1]).toEqual(['user-2']);
  });
});
