import { PoolClient } from 'pg';

export interface TenantInsertPayload {
  full_name: string;
  dob: string | null;
  gender: string | null;
  identity_number: string;
  identity_issued_date: string | null;
  identity_issued_place: string | null;
  email: string | null;
  phone: string;
  permanent_address: string | null;
  status: 'ACTIVE' | 'MOVED_OUT' | 'BLACKLIST';
  note: string | null;
}

export const findTenantByIdentityNumber = async (client: PoolClient, identityNumber: string): Promise<{ id: string } | null> => {
  const rs = await client.query<{ id: string }>('SELECT id FROM tenant WHERE identity_number = $1 LIMIT 1', [identityNumber]);
  return rs.rows[0] ?? null;
};

export const createTenantRecord = async (client: PoolClient, payload: TenantInsertPayload): Promise<{ id: string; full_name: string; email: string | null }> => {
  const rs = await client.query<{ id: string; full_name: string; email: string | null }>(
    `INSERT INTO tenant(full_name,dob,gender,identity_number,identity_issued_date,identity_issued_place,email,phone,permanent_address,status,note)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, full_name, email`,
    [
      payload.full_name,
      payload.dob,
      payload.gender,
      payload.identity_number,
      payload.identity_issued_date,
      payload.identity_issued_place,
      payload.email,
      payload.phone,
      payload.permanent_address,
      payload.status,
      payload.note
    ]
  );
  return rs.rows[0];
};

export const createTenantUserAccount = async (
  client: PoolClient,
  payload: { email: string; username: string; passwordHash: string; tenantId: string }
): Promise<{ id: string; username: string; email: string }> => {
  const userRs = await client.query<{ id: string; username: string; email: string }>(
    `INSERT INTO app_user(role,email,username,password_hash,is_active)
     VALUES('TENANT',$1,$2,$3,true)
     RETURNING id, username, email`,
    [payload.email, payload.username, payload.passwordHash]
  );

  await client.query('UPDATE tenant SET user_id=$1 WHERE id=$2', [userRs.rows[0].id, payload.tenantId]);

  return userRs.rows[0];
};
