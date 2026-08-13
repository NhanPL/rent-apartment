import { query, withTransaction } from '../../db';
import { writeAuditLog } from '../../shared/services/audit-log.service';

export interface InvoiceBranding {
  display_name: string;
  business_address: string | null;
  tax_code: string | null;
  logo_url: string | null;
  accent_color: string;
  invoice_title: string;
  default_note: string | null;
}

export type InvoiceBrandingPayload = InvoiceBranding;

const brandingColumns = `display_name, business_address, tax_code, logo_url,
  accent_color, invoice_title, default_note`;

const defaultBranding = async (managerUserId: string): Promise<InvoiceBranding> => {
  const result = await query<{ display_name: string }>(
    `SELECT COALESCE(mp.full_name, u.username::text, u.email::text, 'Property Manager') AS display_name
     FROM app_user u
     LEFT JOIN manager_profile mp ON mp.user_id=u.id
     WHERE u.id=$1 AND u.role='MANAGER'`,
    [managerUserId]
  );
  return {
    display_name: result.rows[0]?.display_name ?? 'Property Manager',
    business_address: null,
    tax_code: null,
    logo_url: null,
    accent_color: '#1677FF',
    invoice_title: 'Monthly Invoice',
    default_note: null
  };
};

export const getInvoiceBranding = async (managerUserId: string): Promise<InvoiceBranding> => {
  const result = await query<InvoiceBranding>(
    `SELECT ${brandingColumns} FROM invoice_branding WHERE manager_user_id=$1`,
    [managerUserId]
  );
  return result.rows[0] ?? defaultBranding(managerUserId);
};

export const updateInvoiceBranding = async (
  managerUserId: string,
  payload: InvoiceBrandingPayload
): Promise<InvoiceBranding> => withTransaction(async (client) => {
  const before = await client.query<InvoiceBranding>(
    `SELECT ${brandingColumns} FROM invoice_branding WHERE manager_user_id=$1 FOR UPDATE`,
    [managerUserId]
  );
  const updated = await client.query<InvoiceBranding>(
    `INSERT INTO invoice_branding(
       manager_user_id, display_name, business_address, tax_code, logo_url,
       accent_color, invoice_title, default_note
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(manager_user_id) DO UPDATE SET
       display_name=EXCLUDED.display_name,
       business_address=EXCLUDED.business_address,
       tax_code=EXCLUDED.tax_code,
       logo_url=EXCLUDED.logo_url,
       accent_color=EXCLUDED.accent_color,
       invoice_title=EXCLUDED.invoice_title,
       default_note=EXCLUDED.default_note
     RETURNING ${brandingColumns}`,
    [
      managerUserId,
      payload.display_name,
      payload.business_address,
      payload.tax_code,
      payload.logo_url,
      payload.accent_color.toUpperCase(),
      payload.invoice_title,
      payload.default_note
    ]
  );
  await writeAuditLog(client, {
    actorUserId: managerUserId,
    action: 'INVOICE_BRANDING_UPDATED',
    entityType: 'INVOICE_BRANDING',
    entityId: managerUserId,
    before: before.rows[0] ? { ...before.rows[0] } : null,
    after: { ...updated.rows[0] }
  });
  return updated.rows[0];
});

export const getInvoiceBrandingSnapshot = async (
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  managerUserId: string
): Promise<InvoiceBranding> => {
  const result = await client.query<InvoiceBranding>(
    `SELECT ${brandingColumns} FROM invoice_branding WHERE manager_user_id=$1`,
    [managerUserId]
  );
  if (result.rows[0]) return result.rows[0];
  const fallback = await client.query<{ display_name: string }>(
    `SELECT COALESCE(mp.full_name, u.username::text, u.email::text, 'Property Manager') AS display_name
     FROM app_user u LEFT JOIN manager_profile mp ON mp.user_id=u.id WHERE u.id=$1`,
    [managerUserId]
  );
  return {
    display_name: fallback.rows[0]?.display_name ?? 'Property Manager',
    business_address: null,
    tax_code: null,
    logo_url: null,
    accent_color: '#1677FF',
    invoice_title: 'Monthly Invoice',
    default_note: null
  };
};
