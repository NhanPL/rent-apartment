import { query } from '../../db';
import type { AuditActorRole } from '../../shared/middleware/audit-context';
import type { AuditActionCode } from '../../shared/services/audit-log.service';

export interface AuditLogFilters {
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  actorRole?: AuditActorRole;
  action?: AuditActionCode;
  entityType?: string;
  entityId?: string;
  requestId?: string;
  search?: string;
}

interface CountRow {
  total: number;
}

export const listAuditLogs = async (managerId: string, filters: AuditLogFilters) => {
  const params: unknown[] = [managerId];
  const conditions = ['audit.manager_user_id=$1'];
  const addCondition = (sql: string, value: unknown): void => {
    params.push(value);
    conditions.push(sql.replace('?', `$${params.length}`));
  };

  if (filters.from) addCondition('audit.created_at >= ?::timestamptz', filters.from);
  if (filters.to) addCondition('audit.created_at <= ?::timestamptz', filters.to);
  if (filters.actorRole) addCondition('audit.actor_role=?', filters.actorRole);
  if (filters.action) addCondition('audit.action=?', filters.action);
  if (filters.entityType) addCondition('audit.entity_type=?', filters.entityType.toUpperCase());
  if (filters.entityId) addCondition('audit.entity_id=?', filters.entityId);
  if (filters.requestId) addCondition('audit.request_id=?', filters.requestId);
  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(
      audit.action ILIKE $${params.length}
      OR audit.entity_type ILIKE $${params.length}
      OR audit.request_id ILIKE $${params.length}
      OR COALESCE(manager_profile.full_name, tenant.full_name, app_user.username::text, app_user.email::text, '') ILIKE $${params.length}
    )`);
  }

  const joins = `
    LEFT JOIN app_user ON app_user.id=audit.actor_user_id
    LEFT JOIN manager_profile ON manager_profile.user_id=app_user.id
    LEFT JOIN tenant ON tenant.user_id=app_user.id
  `;
  const where = conditions.join(' AND ');
  const countParams = [...params];
  const offset = (filters.page - 1) * filters.pageSize;
  params.push(filters.pageSize, offset);

  const [count, rows] = await Promise.all([
    query<CountRow>(
      `SELECT COUNT(*)::int AS total
       FROM audit_log audit
       ${joins}
       WHERE ${where}`,
      countParams
    ),
    query(
      `SELECT audit.*,
              COALESCE(manager_profile.full_name, tenant.full_name, app_user.username::text, app_user.email::text) AS actor_name
       FROM audit_log audit
       ${joins}
       WHERE ${where}
       ORDER BY audit.created_at DESC, audit.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )
  ]);

  return {
    items: rows.rows,
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      total: Number(count.rows[0]?.total ?? 0)
    }
  };
};
