import crypto from 'node:crypto';
import request from 'supertest';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { signAccessToken } from '../../src/shared/utils/jwt';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for integration tests');

const pool = new Pool({ connectionString: databaseUrl });

type Role = 'MANAGER' | 'TENANT';
type AccountStatus = 'ACTIVE' | 'PENDING_ACTIVATION' | 'DISABLED';
type UserSession = { userId: string; sessionId: string; token: string };
type ScopeFixture = {
  manager: UserSession;
  tenant: UserSession;
  tenantId: string;
  buildingId: string;
  roomId: string;
  contractId: string;
  invoiceId: string;
  paymentRequestId: string;
  utilityReadingId: string;
  documents: Record<'TENANT_DOCUMENT' | 'PAYMENT_PROOF' | 'UTILITY_EVIDENCE' | 'CONTRACT_DOCUMENT', string>;
};

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const createUserSession = async (
  label: string,
  role: Role,
  status: AccountStatus = 'ACTIVE'
): Promise<UserSession> => {
  const active = status === 'ACTIVE';
  const user = await pool.query<{ id: string; session_version: number }>(
    `INSERT INTO app_user(role,email,username,password_hash,is_active,account_status)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id,session_version`,
    [
      role,
      `${label}@authorization.test`,
      label,
      status === 'PENDING_ACTIVATION' ? null : '$2b$12$authorization-test-hash',
      active,
      status
    ]
  );
  const session = await pool.query<{ id: string }>(
    `INSERT INTO auth_session(user_id,session_version,expires_at,user_agent)
     VALUES ($1,$2,now() + interval '1 hour','integration-test')
     RETURNING id`,
    [user.rows[0].id, user.rows[0].session_version]
  );
  return {
    userId: user.rows[0].id,
    sessionId: session.rows[0].id,
    token: signAccessToken({
      userId: user.rows[0].id,
      role,
      sessionVersion: user.rows[0].session_version,
      sessionId: session.rows[0].id
    })
  };
};

const createScope = async (label: string): Promise<ScopeFixture> => {
  const manager = await createUserSession(`${label}-manager`, 'MANAGER');
  const tenantUser = await createUserSession(`${label}-tenant`, 'TENANT');
  const tenant = await pool.query<{ id: string }>(
    `INSERT INTO tenant(
       user_id,manager_user_id,full_name,identity_number,email,phone,status
     ) VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE') RETURNING id`,
    [
      tenantUser.userId,
      manager.userId,
      `${label} Tenant`,
      `${label.toUpperCase()}-IDENTITY`,
      `${label}-tenant@authorization.test`,
      `0900${label === 'a' ? '000001' : '000002'}`
    ]
  );
  const building = await pool.query<{ id: string }>(
    `INSERT INTO building(manager_user_id,code,name,address)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [manager.userId, `${label.toUpperCase()}-BLD`, `${label} Building`, `${label} address`]
  );
  const room = await pool.query<{ id: string }>(
    `INSERT INTO room(building_id,code,base_rent,max_occupants)
     VALUES ($1,$2,5000000,2) RETURNING id`,
    [building.rows[0].id, `${label.toUpperCase()}-101`]
  );
  const contract = await pool.query<{ id: string }>(
    `INSERT INTO contract(room_id,contract_code,status,start_date,move_in_date,rent_price)
     VALUES ($1,$2,'ACTIVE','2026-08-01','2026-08-01',5000000) RETURNING id`,
    [room.rows[0].id, `${label.toUpperCase()}-CONTRACT`]
  );
  await pool.query(
    `INSERT INTO contract_tenant(contract_id,tenant_id,is_primary,joined_at)
     VALUES ($1,$2,true,'2026-08-01')`,
    [contract.rows[0].id, tenant.rows[0].id]
  );
  const reading = await pool.query<{ id: string }>(
    `INSERT INTO utility_reading(
       room_id,month,electricity_prev,electricity_curr,water_prev,water_curr,status,reported_by_user_id
     ) VALUES ($1,'2026-08-01',100,110,20,25,'APPROVED',$2) RETURNING id`,
    [room.rows[0].id, tenantUser.userId]
  );
  const invoice = await pool.query<{ id: string }>(
    `INSERT INTO invoice(
       contract_id,room_id,utility_reading_id,month,status,issued_at,due_date,subtotal,total
     ) VALUES ($1,$2,$3,'2026-08-01','ISSUED','2026-08-01T00:00:00Z','2026-08-10',5000000,5000000)
     RETURNING id`,
    [contract.rows[0].id, room.rows[0].id, reading.rows[0].id]
  );
  const paymentRequest = await pool.query<{ id: string }>(
    `INSERT INTO payment_request(invoice_id,status,amount,created_by_user_id)
     VALUES ($1,'WAITING_TRANSFER',5000000,$2) RETURNING id`,
    [invoice.rows[0].id, manager.userId]
  );
  const tenantDocument = await pool.query<{ id: string }>(
    `INSERT INTO tenant_document(
       tenant_id,doc_type,mime_type,file_size,uploaded_by_user_id,
       cloudinary_public_id,cloudinary_resource_type,cloudinary_version,
       cloudinary_format,cloudinary_delivery_type
     ) VALUES ($1,'IDENTITY_FRONT','image/jpeg',1000,$2,$3,'image',1,'jpg','authenticated')
     RETURNING id`,
    [tenant.rows[0].id, manager.userId, `authorization/${label}/identity`]
  );
  const paymentProof = await pool.query<{ id: string }>(
    `INSERT INTO payment_proof(
       payment_request_id,status,mime_type,file_size,submitted_by_user_id,transfer_amount,
       cloudinary_public_id,cloudinary_resource_type,cloudinary_version,
       cloudinary_format,cloudinary_delivery_type
     ) VALUES ($1,'PENDING','image/jpeg',1000,$2,5000000,$3,'image',1,'jpg','authenticated')
     RETURNING id`,
    [paymentRequest.rows[0].id, tenantUser.userId, `authorization/${label}/proof`]
  );
  const utilityEvidence = await pool.query<{ id: string }>(
    `INSERT INTO utility_reading_evidence(
       utility_reading_id,evidence_type,mime_type,file_size,uploaded_by_user_id,
       cloudinary_public_id,cloudinary_resource_type,cloudinary_version,
       cloudinary_format,cloudinary_delivery_type
     ) VALUES ($1,'ELECTRIC','image/jpeg',1000,$2,$3,'image',1,'jpg','authenticated')
     RETURNING id`,
    [reading.rows[0].id, tenantUser.userId, `authorization/${label}/utility`]
  );
  const contractDocument = await pool.query<{ id: string }>(
    `INSERT INTO contract_document(
       contract_id,doc_type,mime_type,file_size,uploaded_by_user_id,
       cloudinary_public_id,cloudinary_resource_type,cloudinary_version,
       cloudinary_format,cloudinary_delivery_type
     ) VALUES ($1,'SIGNED_SCAN','application/pdf',1000,$2,$3,'raw',1,'pdf','authenticated')
     RETURNING id`,
    [contract.rows[0].id, manager.userId, `authorization/${label}/contract`]
  );

  return {
    manager,
    tenant: tenantUser,
    tenantId: tenant.rows[0].id,
    buildingId: building.rows[0].id,
    roomId: room.rows[0].id,
    contractId: contract.rows[0].id,
    invoiceId: invoice.rows[0].id,
    paymentRequestId: paymentRequest.rows[0].id,
    utilityReadingId: reading.rows[0].id,
    documents: {
      TENANT_DOCUMENT: tenantDocument.rows[0].id,
      PAYMENT_PROOF: paymentProof.rows[0].id,
      UTILITY_EVIDENCE: utilityEvidence.rows[0].id,
      CONTRACT_DOCUMENT: contractDocument.rows[0].id
    }
  };
};

const signExpiredToken = (session: UserSession, role: Role): string => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    userId: session.userId,
    role,
    sessionVersion: 0,
    sessionId: session.sessionId,
    exp: Math.floor(Date.now() / 1000) - 10
  });
  const data = `${header}.${payload}`;
  const signature = crypto
    .createHmac('sha256', process.env.JWT_ACCESS_SECRET!)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
};

describe('backend authorization boundaries', () => {
  let scopeA: ScopeFixture;
  let scopeB: ScopeFixture;

  beforeAll(async () => {
    scopeA = await createScope('a');
    scopeB = await createScope('b');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('does not list manager B buildings for manager A', async () => {
    const response = await request(app)
      .get('/api/buildings')
      .set(bearer(scopeA.manager.token))
      .expect(200);

    expect(response.body.map((item: { id: string }) => item.id)).toContain(scopeA.buildingId);
    expect(response.body.map((item: { id: string }) => item.id)).not.toContain(scopeB.buildingId);
  });

  it('does not let manager A view, update, or delete manager B data', async () => {
    await request(app)
      .get(`/api/buildings/${scopeB.buildingId}`)
      .set(bearer(scopeA.manager.token))
      .expect(404);
    await request(app)
      .put(`/api/buildings/${scopeB.buildingId}`)
      .set(bearer(scopeA.manager.token))
      .send({ code: 'TAKEOVER', name: 'Takeover', address: 'No' })
      .expect(404);
    await request(app)
      .delete(`/api/buildings/${scopeB.buildingId}`)
      .set(bearer(scopeA.manager.token))
      .expect(404);
  });

  it('lets a tenant see only their room, contract-linked invoice, and no manager API', async () => {
    const room = await request(app)
      .get('/api/me/room')
      .set(bearer(scopeA.tenant.token))
      .expect(200);
    expect(room.body.room_id).toBe(scopeA.roomId);
    expect(room.body.contract_id).toBe(scopeA.contractId);

    await request(app)
      .get(`/api/me/invoices/${scopeA.invoiceId}`)
      .set(bearer(scopeA.tenant.token))
      .expect(200);
    await request(app)
      .get(`/api/me/invoices/${scopeB.invoiceId}`)
      .set(bearer(scopeA.tenant.token))
      .expect(404);
    await request(app)
      .get('/api/buildings')
      .set(bearer(scopeA.tenant.token))
      .expect(403);
  });

  it('does not let a manager impersonate a tenant to submit a payment proof', async () => {
    await request(app)
      .post(`/api/payments/requests/${scopeA.paymentRequestId}/proofs`)
      .set(bearer(scopeA.manager.token))
      .send({
        file_url: 'https://res.cloudinary.com/test/image/authenticated/v1/not-used.jpg',
        mime_type: 'image/jpeg',
        file_size: 100,
        transfer_amount: 100
      })
      .expect(403);
  });

  it('checks ownership for every private upload kind', async () => {
    for (const [kind, ownDocumentId] of Object.entries(scopeA.documents)) {
      await request(app)
        .post(`/api/documents/${kind}/${ownDocumentId}/access`)
        .set(bearer(scopeA.tenant.token))
        .send({ action: 'VIEW' })
        .expect(200);
      await request(app)
        .post(`/api/documents/${kind}/${scopeB.documents[kind as keyof typeof scopeB.documents]}/access`)
        .set(bearer(scopeA.tenant.token))
        .send({ action: 'VIEW' })
        .expect(404);
      await request(app)
        .post(`/api/documents/${kind}/${ownDocumentId}/access`)
        .set(bearer(scopeA.manager.token))
        .send({ action: 'DOWNLOAD' })
        .expect(200);
      await request(app)
        .post(`/api/documents/${kind}/${scopeB.documents[kind as keyof typeof scopeB.documents]}/access`)
        .set(bearer(scopeA.manager.token))
        .send({ action: 'DOWNLOAD' })
        .expect(404);
    }
  });

  it('prevents unauthorized upload deletion and exposes no hard-delete for immutable evidence', async () => {
    await request(app)
      .delete(`/api/contracts/${scopeB.contractId}/documents/${scopeB.documents.CONTRACT_DOCUMENT}`)
      .set(bearer(scopeA.manager.token))
      .expect(404);
    await request(app)
      .delete(`/api/contracts/${scopeA.contractId}/documents/${scopeA.documents.CONTRACT_DOCUMENT}`)
      .set(bearer(scopeA.tenant.token))
      .expect(403);
    await request(app)
      .delete(`/api/payments/proofs/${scopeA.documents.PAYMENT_PROOF}`)
      .set(bearer(scopeA.manager.token))
      .expect(404);
    await request(app)
      .delete(`/api/utility-readings/${scopeA.utilityReadingId}/evidence/${scopeA.documents.UTILITY_EVIDENCE}`)
      .set(bearer(scopeA.manager.token))
      .expect(404);
  });

  it('rejects inactive and pending accounts', async () => {
    const disabled = await createUserSession('disabled-manager', 'MANAGER', 'DISABLED');
    const pending = await createUserSession('pending-tenant', 'TENANT', 'PENDING_ACTIVATION');

    await request(app).get('/api/auth/me').set(bearer(disabled.token)).expect(401);
    await request(app).get('/api/auth/me').set(bearer(pending.token)).expect(401);
  });

  it('rejects expired, incorrectly signed, and revoked access tokens', async () => {
    await request(app)
      .get('/api/auth/me')
      .set(bearer(signExpiredToken(scopeA.manager, 'MANAGER')))
      .expect(401);

    const parts = scopeA.manager.token.split('.');
    const wrongSignature = `${parts[0]}.${parts[1]}.${'a'.repeat(parts[2].length)}`;
    await request(app).get('/api/auth/me').set(bearer(wrongSignature)).expect(401);

    await pool.query('UPDATE auth_session SET revoked_at=now() WHERE id=$1', [scopeB.manager.sessionId]);
    await request(app).get('/api/auth/me').set(bearer(scopeB.manager.token)).expect(401);
  });

  it('rejects invalid UUIDs and query parameters with the shared error contract', async () => {
    const invalidUuid = await request(app)
      .get('/api/buildings/not-a-uuid')
      .set(bearer(scopeA.manager.token))
      .expect(400);
    const invalidQuery = await request(app)
      .get('/api/invoices?page=0&pageSize=9999')
      .set(bearer(scopeA.manager.token))
      .expect(400);

    expect(invalidUuid.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(invalidQuery.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(invalidUuid.body.requestId).toEqual(expect.any(String));
  });
});
