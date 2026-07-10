import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db', async () => import('./support/mock-db'));
vi.mock('../src/shared/services/email.service', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  sendTenantWelcomeEmail: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../src/modules/fixed-charges/fixed-charges.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/fixed-charges/fixed-charges.service')>();
  return {
    ...actual,
    resolveFixedChargesForContract: vi.fn().mockResolvedValue([])
  };
});

import { app } from '../src/app';
import { fakeDb, ids } from './support/mock-db';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const login = async (identifier: string) => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ identifier, password: 'password' })
    .expect(200);

  return response.body as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; role: 'MANAGER' | 'TENANT'; tenantId: string | null; fullName: string | null };
  };
};

describe('backend API smoke tests', () => {
  beforeEach(() => {
    fakeDb.reset();
  });

  it('authenticates, refreshes tokens, and returns the current user profile', async () => {
    const session = await login('manager@example.com');

    expect(session.user).toMatchObject({
      id: ids.managerAUser,
      role: 'MANAGER',
      fullName: 'Manager A',
      tenantId: null
    });
    expect(session.accessToken).toEqual(expect.any(String));
    expect(session.refreshToken).toEqual(expect.any(String));

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(200);

    expect(refresh.body.accessToken).toEqual(expect.any(String));

    const me = await request(app)
      .get('/api/auth/me')
      .set(auth(refresh.body.accessToken))
      .expect(200);

    expect(me.body).toMatchObject({
      id: ids.managerAUser,
      role: 'MANAGER',
      fullName: 'Manager A'
    });
  });

  it('allows users without a stored password to log in without submitting one', async () => {
    const tenantWithNullPassword = fakeDb.users.find((user) => user.id === ids.tenantAUser)!;
    tenantWithNullPassword.password_hash = null;

    const nullPasswordSession = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'tenant@example.com' })
      .expect(200);

    expect(nullPasswordSession.body.user).toMatchObject({
      id: ids.tenantAUser,
      role: 'TENANT'
    });

    const tenantWithEmptyPassword = fakeDb.users.find((user) => user.id === ids.tenantBUser)!;
    tenantWithEmptyPassword.password_hash = '';

    const emptyPasswordSession = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'tenant-b@example.com', password: '' })
      .expect(200);

    expect(emptyPasswordSession.body.user).toMatchObject({
      id: ids.tenantBUser,
      role: 'TENANT'
    });
  });

  it('still rejects password-backed users when no password is submitted', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'manager@example.com' })
      .expect(401);
  });

  it('enforces RBAC for manager-only tenant endpoints', async () => {
    const tenantSession = await login('tenant@example.com');

    await request(app)
      .post('/api/tenants')
      .set(auth(tenantSession.accessToken))
      .send({
        full_name: 'Blocked Tenant',
        identity_number: 'BLOCKED',
        email: 'blocked@example.com',
        phone: '0911111111'
      })
      .expect(403);
  });

  it('isolates tenant data between managers', async () => {
    const managerSession = await login('manager@example.com');

    const list = await request(app)
      .get('/api/tenants')
      .set(auth(managerSession.accessToken))
      .expect(200);

    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(ids.tenantA);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(ids.tenantB);

    await request(app)
      .get(`/api/tenants/${ids.tenantB}`)
      .set(auth(managerSession.accessToken))
      .expect(404);
  });

  it('creates, updates, and soft-deletes a tenant', async () => {
    const managerSession = await login('manager@example.com');

    const created = await request(app)
      .post('/api/tenants')
      .set(auth(managerSession.accessToken))
      .send({
        full_name: 'Charlie Tenant',
        identity_number: 'ID-C',
        email: 'charlie@example.com',
        phone: '0933333333',
        status: 'ACTIVE'
      })
      .expect(201);

    const tenantId = created.body.tenantId as string;
    expect(fakeDb.tenants.find((tenant) => tenant.id === tenantId)).toMatchObject({
      full_name: 'Charlie Tenant',
      identity_number: 'ID-C'
    });

    const updated = await request(app)
      .patch(`/api/tenants/${tenantId}`)
      .set(auth(managerSession.accessToken))
      .send({ phone: '0944444444', note: 'Updated by test' })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: tenantId,
      phone: '0944444444',
      note: 'Updated by test'
    });

    await request(app)
      .delete(`/api/tenants/${tenantId}`)
      .set(auth(managerSession.accessToken))
      .expect(204);

    expect(fakeDb.tenants.find((tenant) => tenant.id === tenantId)).toMatchObject({
      status: 'DELETED',
      user_id: null
    });
    expect(fakeDb.users.find((user) => user.id === created.body.userId)).toMatchObject({
      is_active: false
    });
  });

  it('creates, updates, ends contracts, and rejects over-capacity activation', async () => {
    const managerSession = await login('manager@example.com');

    const created = await request(app)
      .post('/api/contracts')
      .set(auth(managerSession.accessToken))
      .send({
        room_id: ids.roomA,
        status: 'DRAFT',
        start_date: '2026-07-01',
        rent_price: 1250,
        billing_day: 7,
        tenants: []
      })
      .expect(201);

    expect(created.body).toMatchObject({
      room_id: ids.roomA,
      status: 'DRAFT',
      rent_price: 1250
    });

    const patched = await request(app)
      .patch(`/api/contracts/${created.body.id}`)
      .set(auth(managerSession.accessToken))
      .send({ rent_price: 1300, note: 'Adjusted rent' })
      .expect(200);

    expect(patched.body).toMatchObject({
      id: created.body.id,
      rent_price: 1300,
      note: 'Adjusted rent'
    });

    const ended = await request(app)
      .post(`/api/contracts/${created.body.id}/end`)
      .set(auth(managerSession.accessToken))
      .send({ move_out_date: '2026-08-01' })
      .expect(200);

    expect(ended.body).toMatchObject({
      id: created.body.id,
      status: 'ENDED',
      move_out_date: '2026-08-01'
    });

    const overCapacity = await request(app)
      .post('/api/contracts')
      .set(auth(managerSession.accessToken))
      .send({
        room_id: ids.roomSmall,
        status: 'ACTIVE',
        start_date: '2026-07-01',
        rent_price: 800,
        billing_day: 5,
        tenants: [
          { tenant_id: ids.tenantA, is_primary: true },
          { tenant_id: ids.tenantFree, is_primary: false }
        ]
      })
      .expect(409);

    expect(overCapacity.body.code).toBe('ROOM_MAX_OCCUPANTS_EXCEEDED');
  });

  it('rejects document uploads when Cloudinary credentials are not configured', async () => {
    const managerSession = await login('manager@example.com');

    const response = await request(app)
      .get('/api/uploads/signature')
      .query({
        context: 'CONTRACT_DOCUMENT',
        mime_type: 'application/pdf',
        file_size: 2048,
        resource_type: 'raw'
      })
      .set(auth(managerSession.accessToken))
      .expect(500);

    expect(response.body).toMatchObject({
      code: 'CLOUDINARY_NOT_CONFIGURED',
      message: 'Cloudinary is not configured'
    });
  });

  it('runs the rental registration reserve, cancel, and handover workflow', async () => {
    const managerSession = await login('manager@example.com');

    const available = await request(app)
      .get('/api/rental-registration/available-rooms')
      .set(auth(managerSession.accessToken))
      .expect(200);

    expect(available.body.map((room: { id: string }) => room.id)).toContain(ids.roomSmall);
    expect(available.body.map((room: { id: string }) => room.id)).not.toContain(ids.roomA);

    const reservedForCancel = await request(app)
      .post('/api/rental-registration/reserve')
      .set(auth(managerSession.accessToken))
      .send({
        room_id: ids.roomSmall,
        tenant: {
          full_name: 'Reservation Cancel Tenant',
          phone: '0955555555',
          identity_number: 'ID-CANCEL',
          email: 'cancel@example.com'
        },
        start_date: '2026-07-15',
        rent_price: 800,
        deposit_amount: 800,
        billing_day: 5,
        note: 'Holding room'
      })
      .expect(201);

    expect(reservedForCancel.body).toMatchObject({
      room_id: ids.roomSmall,
      status: 'DRAFT',
      business_stage: 'RESERVED'
    });

    const document = await request(app)
      .post(`/api/contracts/${reservedForCancel.body.id}/documents`)
      .set(auth(managerSession.accessToken))
      .send({
        doc_type: 'SIGNED_SCAN',
        file_name: 'signed-contract.pdf',
        file_url: 'https://example.com/signed-contract.pdf',
        mime_type: 'application/pdf',
        file_size: 2048
      })
      .expect(201);

    expect(document.body).toMatchObject({
      contract_id: reservedForCancel.body.id,
      doc_type: 'SIGNED_SCAN',
      file_name: 'signed-contract.pdf',
      uploaded_by_user_id: ids.managerAUser
    });

    await request(app)
      .post(`/api/rental-registration/${reservedForCancel.body.id}/cancel`)
      .set(auth(managerSession.accessToken))
      .send({})
      .expect(400);

    const cancelled = await request(app)
      .post(`/api/rental-registration/${reservedForCancel.body.id}/cancel`)
      .set(auth(managerSession.accessToken))
      .send({ reason: 'Tenant changed plans', cancel_date: '2026-07-10' })
      .expect(200);

    expect(cancelled.body).toMatchObject({
      id: reservedForCancel.body.id,
      status: 'CANCELLED',
      business_stage: 'CANCELLED'
    });
    expect(fakeDb.contractTenants.find((tenant) => tenant.contract_id === reservedForCancel.body.id)).toMatchObject({
      joined_at: '2026-07-15',
      left_at: '2026-07-15'
    });

    const reservedForHandover = await request(app)
      .post('/api/rental-registration/reserve')
      .set(auth(managerSession.accessToken))
      .send({
        room_id: ids.roomSmall,
        tenant_id: ids.tenantFree,
        start_date: '2026-08-01',
        rent_price: 850,
        deposit_amount: 850,
        billing_day: 7
      })
      .expect(201);

    const activated = await request(app)
      .post(`/api/rental-registration/${reservedForHandover.body.id}/handover`)
      .set(auth(managerSession.accessToken))
      .send({
        move_in_date: '2026-08-03',
        electricity_curr: 10,
        water_curr: 4,
        persons_count: 1,
        vehicles_count: 1,
        note: 'Clean handover'
      })
      .expect(200);

    expect(activated.body).toMatchObject({
      id: reservedForHandover.body.id,
      status: 'ACTIVE',
      business_stage: 'ACTIVE',
      move_in_date: '2026-08-03'
    });
    expect(fakeDb.utilityReadings.find((reading) => reading.room_id === ids.roomSmall && reading.month === '2026-08-01')).toMatchObject({
      status: 'APPROVED',
      electricity_curr: 10,
      water_curr: 4
    });
    expect(fakeDb.roomMonthExtras.find((extra) => extra.room_id === ids.roomSmall && extra.month === '2026-08-01')).toMatchObject({
      persons_count: 1,
      vehicles_count: 1
    });
  });

  it('rejects invalid rental registration reservations and handovers', async () => {
    const managerSession = await login('manager@example.com');

    await request(app)
      .post('/api/rental-registration/reserve')
      .set(auth(managerSession.accessToken))
      .send({
        room_id: ids.roomA,
        tenant_id: ids.tenantFree,
        start_date: '2026-07-15',
        rent_price: 1000,
        deposit_amount: 1000,
        billing_day: 5
      })
      .expect(409);

    const duplicateTenantReservation = await request(app)
      .post('/api/rental-registration/reserve')
      .set(auth(managerSession.accessToken))
      .send({
        room_id: ids.roomSmall,
        tenant_id: ids.tenantA,
        start_date: '2026-07-15',
        rent_price: 800,
        deposit_amount: 800,
        billing_day: 5
      })
      .expect(201);

    const duplicateActive = await request(app)
      .post(`/api/rental-registration/${duplicateTenantReservation.body.id}/handover`)
      .set(auth(managerSession.accessToken))
      .send({
        move_in_date: '2026-07-15',
        electricity_curr: 1,
        water_curr: 1,
        persons_count: 1,
        vehicles_count: 0
      })
      .expect(409);

    expect(duplicateActive.body.code).toBe('TENANT_HAS_ACTIVE_CONTRACT');

    fakeDb.contractTenants.push({
      contract_id: duplicateTenantReservation.body.id,
      tenant_id: ids.tenantFree,
      is_primary: false,
      joined_at: '2026-07-15',
      left_at: null
    });

    const overCapacity = await request(app)
      .post(`/api/rental-registration/${duplicateTenantReservation.body.id}/handover`)
      .set(auth(managerSession.accessToken))
      .send({
        move_in_date: '2026-07-15',
        electricity_curr: 1,
        water_curr: 1,
        persons_count: 2,
        vehicles_count: 0
      })
      .expect(409);

    expect(overCapacity.body.code).toBe('ROOM_MAX_OCCUPANTS_EXCEEDED');
  });

  it('submits, approves, and rejects utility readings', async () => {
    const tenantSession = await login('tenant@example.com');
    const managerSession = await login('manager@example.com');

    const submitted = await request(app)
      .post('/api/utility-readings')
      .set(auth(tenantSession.accessToken))
      .send({
        room_id: ids.roomA,
        month: '2026-07',
        electricity_curr: 150,
        water_curr: 75,
        note: 'July reading'
      })
      .expect(201);

    expect(submitted.body).toMatchObject({
      room_id: ids.roomA,
      month: '2026-07-01',
      electricity_prev: 120,
      water_prev: 60,
      status: 'SUBMITTED'
    });

    const approved = await request(app)
      .post(`/api/utility-readings/${ids.readingSubmitted}/approve`)
      .set(auth(managerSession.accessToken))
      .expect(200);

    expect(approved.body).toMatchObject({
      id: ids.readingSubmitted,
      status: 'APPROVED',
      building_id: ids.buildingA
    });

    const rejected = await request(app)
      .post(`/api/utility-readings/${ids.readingToReject}/reject`)
      .set(auth(managerSession.accessToken))
      .send({ reason: 'Photo is unclear' })
      .expect(200);

    expect(rejected.body).toMatchObject({
      id: ids.readingToReject,
      status: 'REJECTED',
      rejection_reason: 'Photo is unclear'
    });
  });

  it('generates monthly invoices from approved utility readings', async () => {
    const managerSession = await login('manager@example.com');

    const generated = await request(app)
      .post('/api/invoices/generate/room')
      .set(auth(managerSession.accessToken))
      .send({ month: '2026-06', room_id: ids.roomA })
      .expect(201);

    expect(generated.body).toMatchObject({
      month: '2026-06-01',
      total: 1,
      skipped: []
    });
    expect(generated.body.generated).toHaveLength(1);
    expect(generated.body.generated[0]).toMatchObject({
      contract_id: ids.contractA,
      room_id: ids.roomA,
      total: 1120
    });
    expect(fakeDb.utilityReadings.find((reading) => reading.id === ids.readingApproved)).toMatchObject({
      status: 'INVOICED'
    });
    expect(fakeDb.invoiceItems.filter((item) => item.invoice_id === generated.body.generated[0].id).map((item) => item.code)).toEqual([
      'ROOM_RENT',
      'ELECTRICITY',
      'WATER'
    ]);
  });

  it('creates payment requests and reviews submitted payment proofs', async () => {
    const managerSession = await login('manager@example.com');
    const tenantSession = await login('tenant@example.com');

    const requestResponse = await request(app)
      .post('/api/payments/requests')
      .set(auth(managerSession.accessToken))
      .send({ invoice_id: ids.invoiceIssued })
      .expect(201);

    expect(requestResponse.body).toMatchObject({
      invoice_id: ids.invoiceIssued,
      status: 'WAITING_TRANSFER',
      amount: 1200
    });

    const rejectedProof = await request(app)
      .post(`/api/payments/requests/${requestResponse.body.id}/proofs`)
      .set(auth(tenantSession.accessToken))
      .send({
        file_url: 'https://example.com/proof-rejected.png',
        mime_type: 'image/png',
        file_size: 1024,
        transfer_amount: 1200
      })
      .expect(201);

    const rejected = await request(app)
      .post(`/api/payments/proofs/${rejectedProof.body.id}/reject`)
      .set(auth(managerSession.accessToken))
      .send({ reason: 'Amount cannot be verified' })
      .expect(200);

    expect(rejected.body).toMatchObject({
      id: rejectedProof.body.id,
      status: 'REJECTED',
      rejection_reason: 'Amount cannot be verified'
    });

    const approvedProof = await request(app)
      .post(`/api/payments/requests/${requestResponse.body.id}/proofs`)
      .set(auth(tenantSession.accessToken))
      .send({
        file_url: 'https://example.com/proof-approved.png',
        mime_type: 'image/png',
        file_size: 2048,
        transfer_amount: 1200
      })
      .expect(201);

    const approved = await request(app)
      .post(`/api/payments/proofs/${approvedProof.body.id}/approve`)
      .set(auth(managerSession.accessToken))
      .expect(200);

    expect(approved.body).toMatchObject({
      paid_amount: 1200,
      remaining_amount: 0,
      invoice_status: 'PAID'
    });
    expect(approved.body.proof).toMatchObject({
      id: approvedProof.body.id,
      status: 'APPROVED'
    });
    expect(fakeDb.paymentRequests.find((item) => item.id === requestResponse.body.id)).toMatchObject({
      status: 'VERIFIED'
    });
    expect(fakeDb.invoices.find((invoice) => invoice.id === ids.invoiceIssued)).toMatchObject({
      status: 'PAID'
    });
  });
});
