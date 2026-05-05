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
