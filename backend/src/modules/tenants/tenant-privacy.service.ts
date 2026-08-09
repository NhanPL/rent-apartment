import type { PoolClient } from 'pg';
import { env } from '../../config/env';
import { withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../../shared/services/audit-log.service';

type Queryable = Pick<PoolClient, 'query'>;

interface TenantPrivacyRow {
  id: string;
  user_id: string | null;
  status: string;
  privacy_erasure_requested_at: string | null;
  privacy_erasure_eligible_at: string | null;
  anonymized_at: string | null;
}

export interface TenantErasureResult {
  status: 'ANONYMIZED' | 'SCHEDULED';
  eligibleAt: string;
}

export const maskIdentityNumber = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim();
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  return `${'*'.repeat(normalized.length - 4)}${normalized.slice(-4)}`;
};

export const recordTenantPrivacyConsent = async (
  client: Queryable,
  tenantId: string,
  actorUserId: string,
  granted: boolean,
  policyVersion = env.PRIVACY_POLICY_VERSION
): Promise<void> => {
  const consent = await client.query<{ id: string; recorded_at: string }>(
    `INSERT INTO tenant_privacy_consent(
       tenant_id, policy_version, purpose, granted, recorded_by_user_id
     )
     VALUES($1,$2,'TENANCY_MANAGEMENT',$3,$4)
     RETURNING id, recorded_at`,
    [tenantId, policyVersion, granted, actorUserId]
  );
  await writeAuditLog(client, {
    actorUserId,
    action: 'TENANT_PRIVACY_CONSENT_RECORDED',
    entityType: 'TENANT',
    entityId: tenantId,
    after: { policyVersion, granted, recordedAt: consent.rows[0]?.recorded_at }
  });
};

const anonymizeTenant = async (
  client: Queryable,
  tenant: TenantPrivacyRow,
  actorUserId: string | null
): Promise<void> => {
  const suffix = tenant.id.replace(/-/g, '').slice(0, 12);
  await client.query('DELETE FROM tenant_document WHERE tenant_id=$1', [tenant.id]);
  await client.query(
    `UPDATE tenant
     SET user_id=NULL,
         full_name=$2,
         dob=NULL,
         gender=NULL,
         identity_number=$3,
         identity_issued_date=NULL,
         identity_issued_place=NULL,
         email=NULL,
         phone=$4,
         permanent_address=NULL,
         note=NULL,
         status='DELETED',
         anonymized_at=now(),
         anonymized_by_user_id=$5,
         privacy_erasure_eligible_at=COALESCE(privacy_erasure_eligible_at, now())
     WHERE id=$1`,
    [tenant.id, `Deleted tenant ${suffix}`, `ANON-${suffix}`, `ANON-${suffix}`, actorUserId]
  );
  await writeAuditLog(client, {
    actorUserId,
    action: 'TENANT_ANONYMIZED',
    entityType: 'TENANT',
    entityId: tenant.id,
    after: { status: 'DELETED', anonymized: true }
  });
};

const getErasureEligibility = async (client: Queryable, tenantId: string): Promise<Date> => {
  const history = await client.query<{ latest_record_at: string | null }>(
    `SELECT MAX(recorded_at)::text AS latest_record_at
     FROM (
       SELECT GREATEST(c.created_at, COALESCE(c.updated_at, c.created_at), COALESCE(c.end_date::timestamptz, c.created_at)) AS recorded_at
       FROM contract_tenant ct
       JOIN contract c ON c.id=ct.contract_id
       WHERE ct.tenant_id=$1
       UNION ALL
       SELECT GREATEST(i.created_at, COALESCE(i.updated_at, i.created_at), COALESCE(i.issued_at, i.created_at))
       FROM contract_tenant ct
       JOIN invoice i ON i.contract_id=ct.contract_id
       WHERE ct.tenant_id=$1
       UNION ALL
       SELECT GREATEST(p.created_at, COALESCE(p.paid_at, p.created_at))
       FROM contract_tenant ct
       JOIN invoice i ON i.contract_id=ct.contract_id
       JOIN payment p ON p.invoice_id=i.id
       WHERE ct.tenant_id=$1
     ) retained_history`,
    [tenantId]
  );
  const latest = history.rows[0]?.latest_record_at;
  if (!latest) return new Date();
  return new Date(new Date(latest).getTime() + env.FINANCIAL_RECORD_RETENTION_DAYS * 86_400_000);
};

export const requestTenantErasure = async (
  client: Queryable,
  tenant: TenantPrivacyRow,
  actorUserId: string
): Promise<TenantErasureResult> => {
  const eligibleAt = await getErasureEligibility(client, tenant.id);
  const now = new Date();
  const deletedDocuments = await client.query<{ id: string; doc_type: string }>(
    `DELETE FROM tenant_document
     WHERE tenant_id=$1
     RETURNING id, doc_type`,
    [tenant.id]
  );
  if (deletedDocuments.rows.length > 0) {
    await writeAuditLog(client, {
      actorUserId,
      action: 'TENANT_IDENTITY_DOCUMENT_DELETED',
      entityType: 'TENANT',
      entityId: tenant.id,
      metadata: {
        reason: 'PRIVACY_ERASURE_REQUESTED',
        documentCount: deletedDocuments.rows.length
      }
    });
  }
  await client.query(
    `UPDATE tenant
     SET privacy_erasure_requested_at=COALESCE(privacy_erasure_requested_at, now()),
         privacy_erasure_eligible_at=$2,
         status='DELETED',
         user_id=NULL
     WHERE id=$1`,
    [tenant.id, eligibleAt]
  );
  await writeAuditLog(client, {
    actorUserId,
    action: 'TENANT_PRIVACY_ERASURE_REQUESTED',
    entityType: 'TENANT',
    entityId: tenant.id,
    before: { status: tenant.status },
    after: { status: 'DELETED', eligibleAt: eligibleAt.toISOString() }
  });

  if (eligibleAt <= now) {
    await anonymizeTenant(client, tenant, actorUserId);
    return { status: 'ANONYMIZED', eligibleAt: eligibleAt.toISOString() };
  }

  return { status: 'SCHEDULED', eligibleAt: eligibleAt.toISOString() };
};

export const processDueTenantAnonymization = async (limit = 25): Promise<number> => (
  withTransaction(async (client) => {
    const due = await client.query<TenantPrivacyRow>(
      `SELECT id, user_id, status, privacy_erasure_requested_at,
              privacy_erasure_eligible_at, anonymized_at
       FROM tenant
       WHERE privacy_erasure_requested_at IS NOT NULL
         AND privacy_erasure_eligible_at <= now()
         AND anonymized_at IS NULL
       ORDER BY privacy_erasure_eligible_at
       FOR UPDATE SKIP LOCKED
       LIMIT $1`,
      [limit]
    );
    for (const tenant of due.rows) await anonymizeTenant(client, tenant, null);
    return due.rows.length;
  })
);

export const getTenantDataExport = async (client: Queryable, tenantId: string) => {
  const profile = await client.query(
    `SELECT id, full_name, dob, gender, identity_number, identity_issued_date,
            identity_issued_place, email, phone, permanent_address, status,
            created_at, updated_at, privacy_erasure_requested_at,
            privacy_erasure_eligible_at, anonymized_at
     FROM tenant WHERE id=$1`,
    [tenantId]
  );
  if (!profile.rows[0]) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');

  const [contractDocuments, consents, contracts, invoices, invoiceItems, paymentRequests, paymentProofs, payments, documents] = await Promise.all([
    client.query(
      `SELECT cd.id, cd.contract_id, cd.doc_type, cd.file_name, cd.mime_type,
              cd.file_size, cd.note, cd.uploaded_at, cd.retention_until, cd.asset_purged_at
       FROM contract_tenant ct JOIN contract_document cd ON cd.contract_id=ct.contract_id
       WHERE ct.tenant_id=$1 ORDER BY cd.uploaded_at`,
      [tenantId]
    ),
    client.query(
      `SELECT policy_version, purpose, granted, recorded_at, withdrawn_at
       FROM tenant_privacy_consent WHERE tenant_id=$1 ORDER BY recorded_at`,
      [tenantId]
    ),
    client.query(
      `SELECT c.id, c.contract_code, c.status, c.start_date, c.end_date,
              c.move_in_date, c.move_out_date, c.rent_price, c.deposit_amount,
              c.billing_day, ct.is_primary, ct.joined_at, ct.left_at,
              r.code AS room_code, b.name AS building_name
       FROM contract_tenant ct
       JOIN contract c ON c.id=ct.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE ct.tenant_id=$1 ORDER BY c.start_date`,
      [tenantId]
    ),
    client.query(
      `SELECT i.id, i.contract_id, i.month, i.status, i.subtotal, i.discount,
              i.total, i.due_date, i.issued_at, i.void_reason, i.voided_at, i.created_at
       FROM contract_tenant ct JOIN invoice i ON i.contract_id=ct.contract_id
       WHERE ct.tenant_id=$1 ORDER BY i.month`,
      [tenantId]
    ),
    client.query(
      `SELECT ii.invoice_id, ii.code, ii.description, ii.quantity, ii.unit_price, ii.amount
       FROM contract_tenant ct JOIN invoice i ON i.contract_id=ct.contract_id
       JOIN invoice_item ii ON ii.invoice_id=i.id WHERE ct.tenant_id=$1 ORDER BY ii.created_at`,
      [tenantId]
    ),
    client.query(
      `SELECT pr.id, pr.invoice_id, pr.amount, pr.currency, pr.status,
              pr.expires_at, pr.sent_at, pr.note, pr.created_at
       FROM contract_tenant ct JOIN invoice i ON i.contract_id=ct.contract_id
       JOIN payment_request pr ON pr.invoice_id=i.id WHERE ct.tenant_id=$1 ORDER BY pr.created_at`,
      [tenantId]
    ),
    client.query(
      `SELECT pp.id, pp.payment_request_id, pp.file_name, pp.mime_type, pp.file_size,
              pp.status, pp.transfer_amount, pp.transfer_time, pp.payer_note,
              pp.manager_note, pp.rejection_reason, pp.submitted_at, pp.approved_at,
              pp.rejected_at, pp.asset_purged_at
       FROM contract_tenant ct JOIN invoice i ON i.contract_id=ct.contract_id
       JOIN payment_request pr ON pr.invoice_id=i.id JOIN payment_proof pp ON pp.payment_request_id=pr.id
       WHERE ct.tenant_id=$1 ORDER BY pp.created_at`,
      [tenantId]
    ),
    client.query(
      `SELECT p.id, p.invoice_id, p.payment_request_id, p.amount, p.method, p.status,
              p.entry_type, p.original_payment_id, p.reversal_reason, p.paid_at, p.created_at
       FROM contract_tenant ct JOIN invoice i ON i.contract_id=ct.contract_id
       JOIN payment p ON p.invoice_id=i.id WHERE ct.tenant_id=$1 ORDER BY p.created_at`,
      [tenantId]
    ),
    client.query(
      `SELECT id, doc_type, file_name, mime_type, file_size, note, uploaded_at,
              retention_until, asset_purged_at
       FROM tenant_document WHERE tenant_id=$1 ORDER BY uploaded_at`,
      [tenantId]
    )
  ]);

  return {
    generated_at: new Date().toISOString(),
    policy_version: env.PRIVACY_POLICY_VERSION,
    tenant: profile.rows[0],
    consent_history: consents.rows,
    contracts: contracts.rows,
    contract_documents: contractDocuments.rows,
    invoices: invoices.rows,
    invoice_items: invoiceItems.rows,
    payment_requests: paymentRequests.rows,
    payment_proofs: paymentProofs.rows,
    payment_ledger: payments.rows,
    identity_documents: documents.rows
  };
};
