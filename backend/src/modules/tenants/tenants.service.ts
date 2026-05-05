import bcrypt from 'bcrypt';
import { withTransaction } from '../../db';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/app-error';
import { sendTenantWelcomeEmail } from '../../shared/services/email.service';
import { generateRandomPassword } from '../../shared/utils/password';
import { createTenantRecord, createTenantUserAccount, findTenantByIdentityNumber, TenantInsertPayload } from './tenants.repository';

export interface CreateTenantInput extends TenantInsertPayload {}

export interface CreateTenantResult {
  tenantId: string;
  userId: string;
  emailSent: boolean;
}

const validateCreateInput = (input: Record<string, unknown>): CreateTenantInput => {
  if (!input.full_name || !input.phone || !input.identity_number || !input.email) {
    throw new AppError(400, 'full_name, phone, identity_number, email are required', 'VALIDATION_ERROR');
  }

  return {
    full_name: String(input.full_name),
    phone: String(input.phone),
    identity_number: String(input.identity_number),
    email: String(input.email),
    dob: (input.dob as string | null | undefined) ?? null,
    gender: (input.gender as string | null | undefined) ?? null,
    identity_issued_date: (input.identity_issued_date as string | null | undefined) ?? null,
    identity_issued_place: (input.identity_issued_place as string | null | undefined) ?? null,
    permanent_address: (input.permanent_address as string | null | undefined) ?? null,
    status: ((input.status as CreateTenantInput['status'] | undefined) ?? 'ACTIVE'),
    note: (input.note as string | null | undefined) ?? null
  };
};

export const createTenant = async (raw: Record<string, unknown>): Promise<CreateTenantResult> => {
  const tenantPayload = validateCreateInput((raw.tenant as Record<string, unknown> | undefined) ?? raw);
  const contractPayload = (raw.contract as Record<string, unknown> | null | undefined) ?? null;

  const generatedPassword = generateRandomPassword(8);
  const passwordHash = await bcrypt.hash(generatedPassword, 10);

  const { tenantId, userId, loginEmail, username, tenantName } = await withTransaction(async (client) => {
    const existing = await findTenantByIdentityNumber(client, tenantPayload.identity_number);
    if (existing) {
      throw new AppError(400, 'Tenant already exists', 'TENANT_ALREADY_EXISTS');
    }

    const tenant = await createTenantRecord(client, tenantPayload);
    const username = tenantPayload.email;
    const user = await createTenantUserAccount(client, {
      email: tenantPayload.email,
      username,
      passwordHash,
      tenantId: tenant.id
    });
    if (contractPayload) {
      if (!contractPayload.room_id || !contractPayload.start_date) {
        throw new AppError(400, 'room_id and start_date are required for contract', 'VALIDATION_ERROR');
      }
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const random = Math.floor(1000 + Math.random() * 9000);
      const code = `CONTRACT-${datePart}-${random}`;
      const contractRs = await client.query<{ id: string }>(
        `INSERT INTO contract(room_id,contract_code,status,start_date,end_date,move_in_date,move_out_date,rent_price,deposit_amount,billing_day,note)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          String(contractPayload.room_id),
          code,
          String(contractPayload.status ?? 'DRAFT'),
          String(contractPayload.start_date),
          (contractPayload.end_date as string | null | undefined) ?? null,
          (contractPayload.move_in_date as string | null | undefined) ?? null,
          (contractPayload.move_out_date as string | null | undefined) ?? null,
          Number(contractPayload.rent_price ?? 0),
          Number(contractPayload.deposit_amount ?? 0),
          Number(contractPayload.billing_day ?? 1),
          (contractPayload.note as string | null | undefined) ?? null
        ]
      );
      await client.query(
        'INSERT INTO contract_tenant(contract_id,tenant_id,is_primary,joined_at,left_at) VALUES($1,$2,true,$3,null)',
        [contractRs.rows[0].id, tenant.id, String(contractPayload.start_date)]
      );
    }

    return { tenantId: tenant.id, userId: user.id, loginEmail: user.email, username: user.username, tenantName: tenant.full_name };
  });

  let emailSent = false;
  try {
    await sendTenantWelcomeEmail({
      to: loginEmail,
      tenantName,
      loginUrl: `${env.FRONTEND_URL}/login`,
      username,
      password: generatedPassword
    });
    emailSent = true;
  } catch (error) {
    console.error('Failed to send tenant welcome email', {
      tenantId,
      userId,
      email: loginEmail,
      error: error instanceof Error ? error.message : 'Unknown email error'
    });
  }

  return { tenantId, userId, emailSent };
};
