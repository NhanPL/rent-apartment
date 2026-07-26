import type { PoolClient } from 'pg';

type AuditClient = Pick<PoolClient, 'query'>;

export interface AuditLogPayload {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata?: Record<string, unknown>;
}

export const writeAuditLog = async (client: AuditClient, payload: AuditLogPayload): Promise<void> => {
  await client.query(
    `INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata)
     VALUES($1,$2,$3,$4,$5::jsonb)`,
    [
      payload.actorUserId,
      payload.action,
      payload.entityType,
      payload.entityId,
      JSON.stringify(payload.metadata ?? {})
    ]
  );
};
