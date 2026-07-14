type Role = 'MANAGER' | 'TENANT';
type Row = Record<string, any>;

export const ids = {
  managerAUser: '00000000-0000-4000-8000-000000000001',
  managerBUser: '00000000-0000-4000-8000-000000000002',
  tenantAUser: '00000000-0000-4000-8000-000000000003',
  tenantBUser: '00000000-0000-4000-8000-000000000004',
  buildingA: '00000000-0000-4000-8000-000000000101',
  buildingB: '00000000-0000-4000-8000-000000000102',
  roomA: '00000000-0000-4000-8000-000000000201',
  roomSmall: '00000000-0000-4000-8000-000000000202',
  roomB: '00000000-0000-4000-8000-000000000203',
  tenantA: '00000000-0000-4000-8000-000000000301',
  tenantB: '00000000-0000-4000-8000-000000000302',
  tenantFree: '00000000-0000-4000-8000-000000000303',
  contractA: '00000000-0000-4000-8000-000000000401',
  contractB: '00000000-0000-4000-8000-000000000402',
  readingSubmitted: '00000000-0000-4000-8000-000000000501',
  readingToReject: '00000000-0000-4000-8000-000000000502',
  readingApproved: '00000000-0000-4000-8000-000000000503',
  invoiceIssued: '00000000-0000-4000-8000-000000000601',
  utilityRateA: '00000000-0000-4000-8000-000000000701'
} as const;

const now = '2026-06-14T00:00:00.000Z';
const passwordHash = '$2b$04$RZ/Pem/zCCtR4hslSVW4f.XIAVqnbx0rMyLPB5Anboo./Y1bt3cVu';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();
const today = now.slice(0, 10);
const isCurrentOrFutureDate = (value: unknown): boolean => !value || String(value).slice(0, 10) >= today;
const result = <T extends Row>(rows: T[]) => ({
  rows: clone(rows),
  rowCount: rows.length,
  command: 'SELECT',
  oid: 0,
  fields: []
});

class FakeDb {
  users: Row[] = [];
  managerProfiles: Row[] = [];
  tenants: Row[] = [];
  buildings: Row[] = [];
  rooms: Row[] = [];
  contracts: Row[] = [];
  contractTenants: Row[] = [];
  contractDocuments: Row[] = [];
  utilityReadings: Row[] = [];
  utilityRates: Row[] = [];
  utilityEvidence: Row[] = [];
  roomMonthExtras: Row[] = [];
  invoices: Row[] = [];
  invoiceItems: Row[] = [];
  invoiceAdjustments: Row[] = [];
  paymentRequests: Row[] = [];
  paymentProofs: Row[] = [];
  payments: Row[] = [];

  private sequence = 9000;

  readonly client = {
    query: <T extends Row = Row>(text: string, params?: unknown[]) => this.query<T>(text, params)
  };

  constructor() {
    this.reset();
  }

  reset() {
    this.sequence = 9000;

    this.users = [
      { id: ids.managerAUser, role: 'MANAGER', email: 'manager@example.com', username: 'manager', password_hash: passwordHash, is_active: true, last_login_at: null },
      { id: ids.managerBUser, role: 'MANAGER', email: 'manager-b@example.com', username: 'manager-b', password_hash: passwordHash, is_active: true, last_login_at: null },
      { id: ids.tenantAUser, role: 'TENANT', email: 'tenant@example.com', username: 'tenant', password_hash: passwordHash, is_active: true, last_login_at: null },
      { id: ids.tenantBUser, role: 'TENANT', email: 'tenant-b@example.com', username: 'tenant-b', password_hash: passwordHash, is_active: true, last_login_at: null }
    ];
    this.managerProfiles = [
      { user_id: ids.managerAUser, full_name: 'Manager A' },
      { user_id: ids.managerBUser, full_name: 'Manager B' }
    ];
    this.buildings = [
      { id: ids.buildingA, name: 'Alpha Building', address: 'A Street', manager_user_id: ids.managerAUser },
      { id: ids.buildingB, name: 'Beta Building', address: 'B Street', manager_user_id: ids.managerBUser }
    ];
    this.rooms = [
      { id: ids.roomA, building_id: ids.buildingA, code: 'A101', floor: 1, area_m2: 25, max_occupants: 2, base_rent: 1000, deposit_default: 1000, status: 'ACTIVE' },
      { id: ids.roomSmall, building_id: ids.buildingA, code: 'A102', floor: 1, area_m2: 18, max_occupants: 1, base_rent: 800, deposit_default: 800, status: 'ACTIVE' },
      { id: ids.roomB, building_id: ids.buildingB, code: 'B201', floor: 2, area_m2: 25, max_occupants: 2, base_rent: 900, deposit_default: 900, status: 'ACTIVE' }
    ];
    this.tenants = [
      this.tenantRow(ids.tenantA, ids.tenantAUser, ids.managerAUser, 'Alice Tenant', 'ID-A', 'tenant@example.com', '0900000001'),
      this.tenantRow(ids.tenantB, ids.tenantBUser, ids.managerBUser, 'Bob Tenant', 'ID-B', 'tenant-b@example.com', '0900000002'),
      this.tenantRow(ids.tenantFree, null, ids.managerAUser, 'Free Tenant', 'ID-FREE', 'free@example.com', '0900000003')
    ];
    this.contracts = [
      this.contractRow(ids.contractA, ids.roomA, 'CONTRACT-A', 'ACTIVE', '2026-01-01', 1000, 5),
      this.contractRow(ids.contractB, ids.roomB, 'CONTRACT-B', 'ACTIVE', '2026-01-01', 900, 5)
    ];
    this.contractTenants = [
      { contract_id: ids.contractA, tenant_id: ids.tenantA, is_primary: true, joined_at: '2026-01-01', left_at: null },
      { contract_id: ids.contractB, tenant_id: ids.tenantB, is_primary: true, joined_at: '2026-01-01', left_at: null }
    ];
    this.contractDocuments = [];
    this.utilityReadings = [
      this.readingRow(ids.readingSubmitted, ids.roomA, '2026-04-01', 80, 100, 40, 50, 'SUBMITTED'),
      this.readingRow(ids.readingToReject, ids.roomA, '2026-05-01', 100, 110, 50, 55, 'SUBMITTED'),
      this.readingRow(ids.readingApproved, ids.roomA, '2026-06-01', 100, 120, 50, 60, 'APPROVED')
    ];
    this.utilityRates = [
      { id: ids.utilityRateA, building_id: ids.buildingA, electricity_unit_price: 5, water_unit_price: 2, effective_from: '2026-01-01' }
    ];
    this.utilityEvidence = [];
    this.roomMonthExtras = [];
    this.invoices = [
      {
        id: ids.invoiceIssued,
        contract_id: ids.contractA,
        room_id: ids.roomA,
        utility_reading_id: ids.readingSubmitted,
        month: '2026-04-01',
        status: 'ISSUED',
        issued_at: '2026-04-05',
        due_date: '2026-04-10',
        note: null,
        subtotal: 1200,
        discount: 0,
        total: 1200,
        created_at: now,
        updated_at: now
      }
    ];
    this.invoiceItems = [];
    this.invoiceAdjustments = [];
    this.paymentRequests = [];
    this.paymentProofs = [];
    this.payments = [];
  }

  async query<T extends Row = Row>(text: string, params: unknown[] = []) {
    const sql = normalizeSql(text);

    if (sql.includes('from app_user') && sql.includes('where email = $1 or username = $1')) {
      const identifier = String(params[0]);
      return result<T>(this.users.filter((user) => user.email === identifier || user.username === identifier) as T[]);
    }

    if (sql.includes('from app_user') && sql.includes('where id = $1 limit 1')) {
      const user = this.users.find((item) => item.id === params[0]);
      return result<T>(user ? [user as T] : []);
    }

    if (sql.startsWith('select full_name from manager_profile')) {
      return result<T>(this.managerProfiles.filter((profile) => profile.user_id === params[0]) as T[]);
    }

    if (sql.startsWith('select id, full_name from tenant where user_id')) {
      return result<T>(this.tenants.filter((tenant) => tenant.user_id === params[0]).map((tenant) => ({ id: tenant.id, full_name: tenant.full_name })) as T[]);
    }

    if (sql.startsWith('update app_user set last_login_at')) {
      const user = this.users.find((item) => item.id === params[0]);
      if (user) user.last_login_at = now;
      return result<T>([]);
    }

    if (sql.startsWith('update app_user set is_active=false')) {
      const user = this.users.find((item) => item.id === params[0]);
      if (user) user.is_active = false;
      return result<T>([]);
    }

    if (sql.startsWith('select id from tenant where identity_number')) {
      const tenant = this.tenants.find((item) => item.identity_number === params[0]);
      return result<T>(tenant ? [{ id: tenant.id } as T] : []);
    }

    if (sql.startsWith('select id from tenant where id=$1')) {
      const tenant = this.tenants.find((item) => item.id === params[0] && item.manager_user_id === params[1] && item.status !== 'DELETED');
      return result<T>(tenant ? [{ id: tenant.id } as T] : []);
    }

    if (sql.startsWith('select * from tenant where id=$1 and manager_user_id=$2')) {
      const tenant = this.tenants.find((item) => item.id === params[0] && item.manager_user_id === params[1] && item.status !== 'DELETED');
      return result<T>(tenant ? [tenant as T] : []);
    }

    if (sql.startsWith('select id from tenant where manager_user_id=$1')) {
      const tenant = this.tenants.find((item) => item.manager_user_id === params[0] && item.status !== 'DELETED' && (item.phone === params[1] || item.identity_number === params[2]));
      return result<T>(tenant ? [{ id: tenant.id } as T] : []);
    }

    if (sql.startsWith('insert into tenant(')) {
      const row = this.tenantRow(this.newId(), null, String(params[0]), String(params[1]), String(params[4]), params[7] as string | null, String(params[8]));
      row.dob = params[2] ?? null;
      row.gender = params[3] ?? null;
      row.identity_issued_date = params[5] ?? null;
      row.identity_issued_place = params[6] ?? null;
      row.permanent_address = params[9] ?? null;
      row.status = params[10] ?? 'ACTIVE';
      row.note = params[11] ?? null;
      this.tenants.push(row);
      return result<T>([{ id: row.id, full_name: row.full_name, email: row.email } as T]);
    }

    if (sql.startsWith('insert into app_user(role,email,username,password_hash,is_active)')) {
      const row = {
        id: this.newId(),
        role: 'TENANT' as Role,
        email: params[0],
        username: params[1],
        password_hash: params[2],
        is_active: true,
        last_login_at: null
      };
      this.users.push(row);
      return result<T>([{ id: row.id, username: row.username, email: row.email } as T]);
    }

    if (sql.startsWith('update tenant set user_id=$1 where id=$2')) {
      const tenant = this.tenants.find((item) => item.id === params[1]);
      if (tenant) tenant.user_id = params[0];
      return result<T>([]);
    }

    if (sql.startsWith('select count(*)::int as total from tenant t')) {
      return result<T>([{ total: this.visibleTenantsForManager(String(params[0])).length } as T]);
    }

    if (sql.startsWith('select t.*, v.room_id')) {
      return result<T>(this.visibleTenantsForManager(String(params[0])).map((tenant) => this.decorateTenantForManager(tenant, String(params[0]))) as T[]);
    }

    if (sql.startsWith('select t.* from tenant t where t.id=$1')) {
      const tenant = this.tenants.find((item) => item.id === params[0] && item.manager_user_id === params[1] && item.status !== params[2]);
      return result<T>(tenant ? [tenant as T] : []);
    }

    if (sql.startsWith('select t.id as tenant_id')) {
      const tenant = this.tenants.find((item) => item.id === params[0]);
      if (!tenant || !this.isTenantVisibleToManager(tenant.id, String(params[1]))) return result<T>([]);
      const rental = this.currentRentalForTenant(tenant.id, String(params[1]));
      return result<T>(rental ? [{ tenant_id: tenant.id, full_name: tenant.full_name, phone: tenant.phone, identity_number: tenant.identity_number, ...rental } as T] : []);
    }

    if (sql.startsWith('select c.* from contract c') && sql.includes('where ct.tenant_id=$1 and ct.left_at is null and c.status')) {
      const rental = this.currentRentalForTenant(String(params[0]), String(params[1]));
      const contract = rental ? this.contracts.find((item) => item.id === rental.contract_id) : null;
      return result<T>(contract ? [contract as T] : []);
    }

    if (sql.startsWith('select c.id from contract_tenant ct') && sql.includes('c.id<>$2')) {
      const active = this.activeContractForTenant(String(params[0]));
      return result<T>(active && active.id !== params[1] ? [{ id: active.id } as T] : []);
    }

    if (sql.startsWith('select c.id from contract_tenant ct') && sql.includes('where ct.tenant_id=$1') && !sql.includes('c.id<>$2')) {
      const active = this.activeContractForTenant(String(params[0]));
      return result<T>(active ? [{ id: active.id } as T] : []);
    }

    if (sql.startsWith('select i.id from contract_tenant ct')) {
      const contractIds = this.contractTenants.filter((item) => item.tenant_id === params[0]).map((item) => item.contract_id);
      const invoice = this.invoices.find((item) => contractIds.includes(item.contract_id) && !['PAID', 'VOID'].includes(item.status));
      return result<T>(invoice ? [{ id: invoice.id } as T] : []);
    }

    if (sql.startsWith('update tenant set') && sql.includes('returning *')) {
      return this.updateTenant<T>(text, params);
    }

    if (sql.startsWith('select * from tenant where')) {
      const tenantId = params[params.length - 2];
      const managerId = String(params[params.length - 1]);
      const tenant = this.tenants.find((item) => item.id === tenantId && item.manager_user_id === managerId && item.status !== 'DELETED');
      return result<T>(tenant ? [tenant as T] : []);
    }

    if (sql.startsWith('select id, user_id from tenant')) {
      const tenant = this.tenants.find((item) => item.id === params[0] && item.manager_user_id === params[1] && item.status !== params[2]);
      return result<T>(tenant ? [{ id: tenant.id, user_id: tenant.user_id } as T] : []);
    }

    if (sql.startsWith("update tenant set status='deleted'")) {
      const tenant = this.tenants.find((item) => item.id === params[0]);
      if (tenant) {
        tenant.status = 'DELETED';
        tenant.user_id = null;
      }
      return result<T>([]);
    }

    if (sql.startsWith('select r.id, r.building_id, r.max_occupants')) {
      const room = this.getRoomForManager(String(params[0]), params[1] ? String(params[1]) : undefined);
      return result<T>(room ? [{ id: room.id, building_id: room.building_id, max_occupants: room.max_occupants } as T] : []);
    }

    if (sql.startsWith('select r.* from room r join building b')) {
      const room = this.getRoomForManager(String(params[0]), String(params[1]));
      return result<T>(room ? [room as T] : []);
    }

    if (sql.startsWith('select r.id, r.building_id, r.code')) {
      const managerId = String(params[0]);
      const buildingId = params[1] ? String(params[1]) : null;
      const rows = this.rooms.filter((room) => {
        const building = this.buildings.find((item) => item.id === room.building_id);
        const occupied = this.contracts.some((contract) => this.isCurrentOrFutureContract(contract)
          && contract.room_id === room.id
          && this.contractTenants.some((assignment) => assignment.contract_id === contract.id && isCurrentOrFutureDate(assignment.left_at)));
        return building?.manager_user_id === managerId && room.status === 'ACTIVE' && !occupied && (!buildingId || building.id === buildingId);
      }).map((room) => {
        const building = this.buildings.find((item) => item.id === room.building_id)!;
        return { ...room, building_name: building.name };
      });
      return result<T>(rows as T[]);
    }

    if (sql.startsWith('select id from contract where room_id=$1 and status=$2')) {
      const active = this.contracts.find((item) => item.room_id === params[0] && item.status === params[1] && (!params[2] || item.id !== params[2]));
      return result<T>(active ? [{ id: active.id } as T] : []);
    }

    if (sql.startsWith('select c.id from contract c join contract_tenant ct') && sql.includes('where c.room_id=$1')) {
      const occupied = this.contracts.find((contract) => contract.room_id === params[0]
        && contract.id !== params[1]
        && this.isCurrentOrFutureContract(contract)
        && this.contractTenants.some((assignment) => assignment.contract_id === contract.id && isCurrentOrFutureDate(assignment.left_at)));
      return result<T>(occupied ? [{ id: occupied.id } as T] : []);
    }

    if (sql.startsWith('select t.id, t.full_name, t.phone')) {
      const rows = this.tenants.filter((tenant) => tenant.manager_user_id === params[0]
        && tenant.status === 'ACTIVE'
        && !this.contracts.some((contract) => this.isCurrentOrFutureContract(contract)
          && this.contractTenants.some((assignment) => assignment.contract_id === contract.id
            && assignment.tenant_id === tenant.id
            && isCurrentOrFutureDate(assignment.left_at))));
      return result<T>(rows as T[]);
    }

    if (sql.startsWith('select c.id from contract c join contract_tenant ct') && sql.includes('where ct.tenant_id=$1')) {
      const occupied = this.contracts.find((contract) => this.isCurrentOrFutureContract(contract)
        && this.contractTenants.some((assignment) => assignment.contract_id === contract.id
          && assignment.tenant_id === params[0]
          && isCurrentOrFutureDate(assignment.left_at)));
      return result<T>(occupied ? [{ id: occupied.id } as T] : []);
    }

    if (sql.startsWith('select 1 from contract where contract_code')) {
      const contract = this.contracts.find((item) => item.contract_code === params[0]);
      return result<T>(contract ? [{ '?column?': 1 } as T] : []);
    }

    if (sql.startsWith('insert into contract(')) {
      const statusIsLiteralDraft = sql.includes("values($1,$2,'draft'");
      const row = statusIsLiteralDraft
        ? this.contractRow(this.newId(), String(params[0]), String(params[1]), 'DRAFT', String(params[2]), Number(params[4] ?? 0), Number(params[6] ?? 1))
        : this.contractRow(this.newId(), String(params[0]), String(params[1]), String(params[2]), String(params[3]), Number(params[7] ?? 0), Number(params[9] ?? 1));
      row.end_date = statusIsLiteralDraft ? params[3] ?? null : params[4] ?? null;
      row.move_in_date = statusIsLiteralDraft ? null : params[5] ?? null;
      row.move_out_date = statusIsLiteralDraft ? null : params[6] ?? null;
      row.deposit_amount = statusIsLiteralDraft ? params[5] ?? 0 : params[8] ?? 0;
      row.note = statusIsLiteralDraft ? params[7] ?? null : params[10] ?? null;
      this.contracts.push(row);
      return result<T>([row as T]);
    }

    if (sql.startsWith('select c.*, r.building_id, r.code as room_code, r.max_occupants')) {
      const contract = this.getContractForManager(String(params[0]), String(params[1]));
      return result<T>(contract ? [this.decorateContract(contract) as T] : []);
    }

    if (sql.startsWith('select c.*, r.code as room_code, r.max_occupants')) {
      const contract = this.getContractForManager(String(params[0]), String(params[1]));
      return result<T>(contract ? [{ ...this.decorateContract(contract), signed_document_count: 0 } as T] : []);
    }

    if (sql.startsWith('select ct.contract_id, ct.tenant_id')) {
      return result<T>(this.contractTenants.filter((item) => item.contract_id === params[0]).map((item) => {
        const tenant = this.tenants.find((entry) => entry.id === item.tenant_id)!;
        return { ...item, full_name: tenant.full_name, phone: tenant.phone, email: tenant.email, identity_number: tenant.identity_number };
      }) as T[]);
    }

    if (sql.startsWith('select tenant.id from tenant')) {
      const tenant = this.tenants.find((item) => item.id === params[0] && item.status !== 'DELETED');
      return result<T>(tenant && this.isTenantVisibleToManager(tenant.id, String(params[1])) ? [{ id: tenant.id } as T] : []);
    }

    if (sql.startsWith('select * from contract_tenant where contract_id=$1 and tenant_id=$2')) {
      const row = this.contractTenants.find((item) => item.contract_id === params[0] && item.tenant_id === params[1]);
      return result<T>(row ? [row as T] : []);
    }

    if (sql.startsWith('update contract_tenant set is_primary=false')) {
      this.contractTenants.filter((item) => item.contract_id === params[0]).forEach((item) => {
        item.is_primary = false;
      });
      return result<T>([]);
    }

    if (sql.startsWith('insert into contract_tenant(')) {
      const usesLiteralPrimary = sql.includes('values($1,$2,true,$3,null)');
      this.contractTenants.push({
        contract_id: params[0],
        tenant_id: params[1],
        is_primary: usesLiteralPrimary ? true : params[2],
        joined_at: usesLiteralPrimary ? params[2] : params[3],
        left_at: usesLiteralPrimary ? null : params[4] ?? null
      });
      return result<T>([]);
    }

    if (sql.startsWith('select * from contract_document where id=$1')) {
      const document = this.contractDocuments.find((item) => item.id === params[0] && item.contract_id === params[1]);
      return result<T>(document ? [document as T] : []);
    }

    if (sql.startsWith('select * from contract_document')) {
      return result<T>(this.contractDocuments.filter((item) => item.contract_id === params[0]) as T[]);
    }

    if (sql.startsWith('insert into contract_document(')) {
      const document = {
        id: this.newId(),
        contract_id: params[0],
        doc_type: params[1],
        file_name: params[2],
        file_url: params[3],
        mime_type: params[4],
        file_size: params[5],
        uploaded_by_user_id: params[6],
        note: params[7],
        uploaded_at: now,
        created_at: now
      };
      this.contractDocuments.push(document);
      return result<T>([document as T]);
    }

    if (sql.startsWith('delete from contract_document')) {
      this.contractDocuments = this.contractDocuments.filter((item) => !(item.id === params[0] && item.contract_id === params[1]));
      return result<T>([]);
    }

    if (sql.startsWith('select count(*)::int as occupants_count')) {
      const occupants = this.contractTenants.filter((item) => item.contract_id === params[0] && !item.left_at).length;
      return result<T>([{ occupants_count: occupants } as T]);
    }

    if (sql.startsWith('update contract set room_id=coalesce')) {
      const contract = this.contracts.find((item) => item.id === params[14]);
      if (!contract) return result<T>([]);
      if (params[0]) contract.room_id = params[0];
      if (params[1]) contract.contract_code = params[1];
      if (params[2]) contract.start_date = params[2];
      if (params[3]) contract.end_date = params[4] ?? null;
      if (params[5]) contract.move_in_date = params[6] ?? null;
      if (params[7]) contract.move_out_date = params[8] ?? null;
      if (params[9] !== null && params[9] !== undefined) contract.rent_price = params[9];
      if (params[10] !== null && params[10] !== undefined) contract.deposit_amount = params[10];
      if (params[11] !== null && params[11] !== undefined) contract.billing_day = params[11];
      if (params[12]) contract.note = params[13] ?? null;
      return result<T>([contract as T]);
    }

    if (sql.startsWith("update contract set status='ended'")) {
      const contract = this.contracts.find((item) => item.id === params[3]);
      if (!contract) return result<T>([]);
      contract.status = 'ENDED';
      contract.end_date = params[0] ?? contract.end_date;
      contract.move_out_date = params[1];
      contract.note = params[2] ?? contract.note;
      return result<T>([contract as T]);
    }

    if (sql.startsWith('update contract_tenant set left_at=coalesce(left_at')) {
      this.contractTenants.filter((item) => item.contract_id === params[1] && !item.left_at).forEach((item) => {
        item.left_at = sql.includes('greatest(joined_at') && String(item.joined_at) > String(params[0])
          ? item.joined_at
          : params[0];
      });
      return result<T>([]);
    }

    if (sql.startsWith('select c.id from contract c join contract_tenant') && !sql.includes('any($2::uuid[])')) {
      const contract = this.contracts.find((item) => item.room_id === params[0] && item.status === 'ACTIVE' && this.contractTenants.some((ct) => ct.contract_id === item.id && !ct.left_at && this.tenants.some((tenant) => tenant.id === ct.tenant_id && tenant.user_id === params[1])));
      return result<T>(contract ? [{ id: contract.id } as T] : []);
    }

    if (sql.startsWith('select electricity_curr, water_curr')) {
      const previous = this.utilityReadings
        .filter((item) => item.room_id === params[0] && item.month < params[1] && ['APPROVED', 'INVOICED'].includes(item.status))
        .sort((a, b) => String(b.month).localeCompare(String(a.month)))[0];
      return result<T>(previous ? [{ electricity_curr: previous.electricity_curr, water_curr: previous.water_curr } as T] : []);
    }

    if (sql.startsWith('select * from utility_reading where room_id=$1 and month=$2 for update')) {
      const reading = this.utilityReadings.find((item) => item.room_id === params[0] && item.month === params[1]);
      return result<T>(reading ? [reading as T] : []);
    }

    if (sql.startsWith('insert into utility_reading(')) {
      if (sql.includes('on conflict')) {
        let row = this.utilityReadings.find((item) => item.room_id === params[0] && item.month === params[1]);
        if (!row) {
          row = this.readingRow(this.newId(), String(params[0]), String(params[1]), Number(params[2]), Number(params[2]), Number(params[3]), Number(params[3]), 'APPROVED');
          this.utilityReadings.push(row);
        } else {
          row.electricity_prev = params[2];
          row.electricity_curr = params[2];
          row.water_prev = params[3];
          row.water_curr = params[3];
          row.status = 'APPROVED';
        }
        row.reported_by_user_id = params[4];
        row.note = params[5] ?? null;
        return result<T>([]);
      }
      const row = this.readingRow(this.newId(), String(params[0]), String(params[1]), Number(params[2]), Number(params[3]), Number(params[4]), Number(params[5]), 'SUBMITTED');
      row.reported_by_user_id = params[6];
      row.note = params[7] ?? null;
      this.utilityReadings.push(row);
      return result<T>([row as T]);
    }

    if (sql.startsWith('update utility_reading set electricity_prev')) {
      const reading = this.utilityReadings.find((item) => item.id === params[6]);
      if (!reading) return result<T>([]);
      Object.assign(reading, {
        electricity_prev: params[0],
        electricity_curr: params[1],
        water_prev: params[2],
        water_curr: params[3],
        status: 'SUBMITTED',
        reported_by_user_id: params[4],
        note: params[5] ?? null,
        rejected_by_user_id: null,
        rejected_at: null,
        rejection_reason: null
      });
      return result<T>([reading as T]);
    }

    if (sql.startsWith('insert into utility_reading_evidence(') && sql.includes("($1,'electric'")) {
      this.utilityEvidence.push(
        {
          id: this.newId(),
          utility_reading_id: params[0],
          evidence_type: 'ELECTRIC',
          file_name: params[1],
          file_url: params[2],
          mime_type: params[3],
          file_size: params[4],
          uploaded_by_user_id: params[9]
        },
        {
          id: this.newId(),
          utility_reading_id: params[0],
          evidence_type: 'WATER',
          file_name: params[5],
          file_url: params[6],
          mime_type: params[7],
          file_size: params[8],
          uploaded_by_user_id: params[9]
        }
      );
      return result<T>([]);
    }

    if (sql.startsWith('select ur.* from utility_reading ur') && sql.includes('for update of ur')) {
      const reading = this.getReadingForManager(String(params[0]), String(params[1]));
      return result<T>(reading ? [reading as T] : []);
    }

    if (sql.startsWith("update utility_reading ur set status='approved'")) {
      const reading = this.utilityReadings.find((item) => item.id === params[0]);
      const stillInvoiced = this.invoices.some((item) => item.utility_reading_id === params[0]);
      if (reading?.status === 'INVOICED' && !stillInvoiced) reading.status = 'APPROVED';
      return result<T>([]);
    }

    if (sql.startsWith("update utility_reading set status='approved'")) {
      const reading = this.utilityReadings.find((item) => item.id === params[0]);
      if (reading) {
        reading.status = 'APPROVED';
        reading.approved_by_user_id = params[1];
        reading.verified_by_user_id = params[1];
      }
      return result<T>([]);
    }

    if (sql.startsWith("update utility_reading set status='rejected'")) {
      const reading = this.utilityReadings.find((item) => item.id === params[0]);
      if (reading) {
        reading.status = 'REJECTED';
        reading.rejected_by_user_id = params[1];
        reading.rejection_reason = params[2];
      }
      return result<T>([]);
    }

    if (sql.startsWith('select t.* from contract_tenant ct join tenant t')) {
      const rows = this.contractTenants
        .filter((item) => item.contract_id === params[0] && !item.left_at)
        .map((item) => this.tenants.find((tenant) => tenant.id === item.tenant_id)!)
        .filter(Boolean);
      return result<T>(rows as T[]);
    }

    if (sql.startsWith('select c.id from contract c join contract_tenant ct') && sql.includes('any($2::uuid[])')) {
      const contractId = String(params[0]);
      const tenantIds = params[1] as string[];
      const conflict = this.contracts.find((contract) => contract.status === 'ACTIVE' && contract.id !== contractId && this.contractTenants.some((ct) => ct.contract_id === contract.id && !ct.left_at && tenantIds.includes(ct.tenant_id)));
      return result<T>(conflict ? [{ id: conflict.id } as T] : []);
    }

    if (sql.startsWith('insert into room_month_extra(')) {
      let row = this.roomMonthExtras.find((item) => item.room_id === params[0] && item.month === params[1]);
      if (!row) {
        row = { id: this.newId(), room_id: params[0], month: params[1], created_at: now, updated_at: now };
        this.roomMonthExtras.push(row);
      }
      row.persons_count = params[2];
      row.vehicles_count = params[3];
      row.reported_by_user_id = params[4];
      row.note = params[5] ?? null;
      return result<T>([]);
    }

    if (sql.startsWith("update contract set status='active'")) {
      const contract = this.contracts.find((item) => item.id === params[0]);
      if (!contract) return result<T>([]);
      contract.status = 'ACTIVE';
      contract.start_date = params[1];
      contract.move_in_date = params[1];
      if (params[2]) contract.note = `${contract.note ?? ''}\n${params[2]}`;
      return result<T>([contract as T]);
    }

    if (sql.startsWith("update contract set status='cancelled'")) {
      const contract = this.contracts.find((item) => item.id === params[0]);
      if (!contract) return result<T>([]);
      contract.status = 'CANCELLED';
      contract.move_out_date = params[1];
      contract.note = `${contract.note ?? ''}\nCancel reason: ${params[2]}`;
      return result<T>([contract as T]);
    }

    if (sql.startsWith('select ur.*,') || sql.startsWith('select distinct ur.*,')) {
      if (sql.includes('where ur.id=$1')) {
        const reading = sql.includes('b.manager_user_id=$2')
          ? this.getReadingForManager(String(params[0]), String(params[1]))
          : this.getReadingForTenant(String(params[0]), String(params[1]));
        return result<T>(reading ? [this.decorateReading(reading) as T] : []);
      }
      return result<T>(this.utilityReadings.map((item) => this.decorateReading(item)) as T[]);
    }

    if (sql.startsWith('select * from utility_reading_evidence')) {
      return result<T>(this.utilityEvidence.filter((item) => item.utility_reading_id === params[0]) as T[]);
    }

    if (sql.startsWith('select c.*, r.building_id, r.code as room_code, b.name as building_name')) {
      const contracts = this.contracts.filter((contract) => {
        if (contract.status !== 'ACTIVE') return false;
        const room = this.rooms.find((item) => item.id === contract.room_id);
        const building = room ? this.buildings.find((item) => item.id === room.building_id) : null;
        if (!room || !building || building.manager_user_id !== params[0]) return false;
        if (params[1] && contract.room_id !== params[1] && building.id !== params[1]) return false;
        return true;
      });
      return result<T>(contracts.map((contract) => this.decorateContract(contract)) as T[]);
    }

    if (sql.startsWith('select id from invoice where contract_id=$1 and month=$2')) {
      const invoice = this.invoices.find((item) => item.contract_id === params[0] && item.month === params[1] && (!params[2] || item.id !== params[2]));
      return result<T>(invoice ? [{ id: invoice.id } as T] : []);
    }

    if (sql.startsWith("select * from utility_reading where room_id=$1 and month=$2 and status='approved'")) {
      const reading = this.utilityReadings.find((item) => item.room_id === params[0] && item.month === params[1] && item.status === 'APPROVED');
      return result<T>(reading ? [reading as T] : []);
    }

    if (sql.startsWith('select * from utility_rate where building_id=$1')) {
      const rate = this.utilityRates
        .filter((item) => item.building_id === params[0] && item.effective_from <= params[1])
        .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0];
      return result<T>(rate ? [rate as T] : []);
    }

    if (sql.startsWith('insert into invoice(contract_id, room_id, utility_reading_id')) {
      const row = {
        id: this.newId(),
        contract_id: params[0],
        room_id: params[1],
        utility_reading_id: params[2],
        month: params[3],
        status: sql.includes("'draft'") ? 'DRAFT' : 'ISSUED',
        issued_at: sql.includes("'draft'") ? null : now,
        due_date: params[4],
        note: params[5] ?? null,
        subtotal: params[6],
        discount: 0,
        total: params[6],
        approved_by_user_id: sql.includes("'draft'") ? null : params[7],
        approved_at: sql.includes("'draft'") ? null : now,
        created_at: now,
        updated_at: now
      };
      this.invoices.push(row);
      return result<T>([row as T]);
    }

    if (sql.startsWith('insert into invoice_item(')) {
      this.invoiceItems.push({
        id: this.newId(),
        invoice_id: params[0],
        code: params[1],
        name: params[2],
        quantity: params[3],
        unit_price: params[4],
        amount: params[5],
        meta: params[6],
        created_at: now
      });
      return result<T>([]);
    }

    if (sql.startsWith("update utility_reading set status='invoiced'")) {
      const reading = this.utilityReadings.find((item) => item.id === params[0]);
      if (reading) {
        reading.status = 'INVOICED';
        reading.verified_by_user_id = reading.verified_by_user_id ?? params[1];
      }
      return result<T>([]);
    }

    if ((sql.startsWith('select i.* from invoice i') || sql.startsWith('select i.*, b.id as building_id')) && sql.includes('where i.id=$1 and b.manager_user_id=$2')) {
      const invoice = this.getInvoiceForManager(String(params[0]), String(params[1]));
      return result<T>(invoice ? [invoice as T] : []);
    }

    if (sql.startsWith('select coalesce(sum(amount), 0) as paid_amount')) {
      const paid = this.payments.filter((item) => item.invoice_id === params[0] && item.status === 'SUCCEEDED').reduce((sum, item) => sum + Number(item.amount), 0);
      return result<T>([{ paid_amount: paid } as T]);
    }

    if (sql.startsWith("update invoice set status='issued'")) {
      const invoice = this.invoices.find((item) => item.id === params[0]);
      if (invoice) {
        invoice.status = 'ISSUED';
        invoice.issued_at = now;
        invoice.approved_by_user_id = params[1];
        invoice.approved_at = now;
      }
      return result<T>([]);
    }

    if (sql.startsWith('select * from invoice_item where invoice_id=$1')) {
      return result<T>(this.invoiceItems.filter((item) => item.invoice_id === params[0]) as T[]);
    }

    if (sql.startsWith('select * from invoice_adjustment where invoice_id=$1')) {
      return result<T>(this.invoiceAdjustments.filter((item) => item.invoice_id === params[0]) as T[]);
    }

    if (sql.startsWith('delete from payment where invoice_id=$1')) {
      this.payments = this.payments.filter((item) => item.invoice_id !== params[0]);
      return result<T>([]);
    }

    if (sql.startsWith('delete from payment_request where invoice_id=$1')) {
      const requestIds = this.paymentRequests
        .filter((item) => item.invoice_id === params[0])
        .map((item) => item.id);
      this.paymentProofs = this.paymentProofs.filter((item) => !requestIds.includes(item.payment_request_id));
      this.paymentRequests = this.paymentRequests.filter((item) => item.invoice_id !== params[0]);
      return result<T>([]);
    }

    if (sql.startsWith('delete from invoice where id=$1')) {
      const invoiceId = params[0];
      this.invoices = this.invoices.filter((item) => item.id !== invoiceId);
      this.invoiceItems = this.invoiceItems.filter((item) => item.invoice_id !== invoiceId);
      this.invoiceAdjustments = this.invoiceAdjustments.filter((item) => item.invoice_id !== invoiceId);
      return result<T>([]);
    }

    if (sql.startsWith('select id from payment_request')) {
      const request = this.paymentRequests.find((item) => item.invoice_id === params[0] && !['CANCELLED', 'EXPIRED'].includes(item.status));
      return result<T>(request ? [{ id: request.id } as T] : []);
    }

    if (sql.startsWith('insert into payment_request(')) {
      const issuedByInvoice = sql.includes("'vnd'");
      const row = {
        id: this.newId(),
        invoice_id: params[0],
        status: 'WAITING_TRANSFER',
        amount: params[1],
        currency: issuedByInvoice ? 'VND' : params[2],
        qr_content: issuedByInvoice ? params[2] : params[3],
        qr_image_url: issuedByInvoice ? null : params[4] ?? null,
        bank_code: issuedByInvoice ? params[3] ?? null : params[5] ?? null,
        bank_account_no: issuedByInvoice ? params[4] ?? null : params[6] ?? null,
        bank_account_name: issuedByInvoice ? params[5] ?? null : params[7] ?? null,
        transfer_note: issuedByInvoice ? params[6] : params[8],
        expires_at: issuedByInvoice ? null : params[9] ?? null,
        sent_at: now,
        created_by_user_id: issuedByInvoice ? params[7] : params[10],
        created_at: now
      };
      this.paymentRequests.push(row);
      return result<T>([row as T]);
    }

    if (sql.startsWith('select pr.*, i.total invoice_total')) {
      const request = this.getPaymentRequestForTenant(String(params[0]), String(params[1]));
      return result<T>(request ? [request as T] : []);
    }

    if (sql.startsWith('select id from payment_proof where payment_request_id=$1')) {
      const proof = this.paymentProofs.find((item) => item.payment_request_id === params[0] && item.status === 'PENDING');
      return result<T>(proof ? [{ id: proof.id } as T] : []);
    }

    if (sql.startsWith('insert into payment_proof(')) {
      const row = {
        id: this.newId(),
        payment_request_id: params[0],
        status: 'PENDING',
        file_name: params[1] ?? null,
        file_url: params[2],
        mime_type: params[3],
        file_size: params[4],
        submitted_by_user_id: params[5],
        transfer_amount: params[6],
        transfer_time: params[7] ?? null,
        payer_note: params[8] ?? null,
        submitted_at: now,
        created_at: now
      };
      this.paymentProofs.push(row);
      return result<T>([row as T]);
    }

    if (sql.startsWith("update payment_request set status='transfer_submitted'")) {
      const request = this.paymentRequests.find((item) => item.id === params[0]);
      if (request) request.status = 'TRANSFER_SUBMITTED';
      return result<T>([]);
    }

    if (sql.startsWith('select pf.*, pr.invoice_id')) {
      const proof = this.getPaymentProofForManager(String(params[0]), String(params[1]));
      return result<T>(proof ? [proof as T] : []);
    }

    if (sql.startsWith("update payment_proof set status='rejected'")) {
      const proof = this.paymentProofs.find((item) => item.id === params[0]);
      if (!proof) return result<T>([]);
      proof.status = 'REJECTED';
      proof.rejected_by_user_id = params[1];
      proof.rejected_at = now;
      proof.rejection_reason = params[2];
      return result<T>([proof as T]);
    }

    if (sql.startsWith("update payment_request set status='rejected'")) {
      const request = this.paymentRequests.find((item) => item.id === params[0]);
      if (request) request.status = 'REJECTED';
      return result<T>([]);
    }

    if (sql.startsWith("update payment_proof set status='approved'")) {
      const proof = this.paymentProofs.find((item) => item.id === params[0]);
      if (!proof) return result<T>([]);
      proof.status = 'APPROVED';
      proof.approved_by_user_id = params[1];
      proof.approved_at = now;
      proof.rejection_reason = null;
      return result<T>([proof as T]);
    }

    if (sql.startsWith('insert into payment(invoice_id,payment_request_id,payment_proof_id')) {
      let payment = this.payments.find((item) => item.payment_proof_id === params[2]);
      if (!payment) {
        payment = {
          id: this.newId(),
          invoice_id: params[0],
          payment_request_id: params[1],
          payment_proof_id: params[2],
          method: 'BANK_TRANSFER',
          status: 'SUCCEEDED',
          amount: params[3],
          paid_at: now,
          created_by_user_id: params[4],
          note: params[5],
          created_at: now
        };
        this.payments.push(payment);
      } else {
        payment.status = 'SUCCEEDED';
        payment.paid_at = now;
        payment.amount = params[3];
      }
      return result<T>([payment as T]);
    }

    if (sql.startsWith('update payment_request set status=$2')) {
      const request = this.paymentRequests.find((item) => item.id === params[0]);
      if (request) {
        request.status = params[1];
        request.approved_by_user_id = params[2];
        if (params[1] === 'VERIFIED') request.approved_at = now;
      }
      return result<T>([]);
    }

    if (sql.startsWith("update invoice set status='paid'")) {
      const invoice = this.invoices.find((item) => item.id === params[0]);
      if (invoice) invoice.status = 'PAID';
      return result<T>([]);
    }

    throw new Error(`Unhandled test query: ${sql}\nParams: ${JSON.stringify(params)}`);
  }

  private isCurrentOrFutureContract(contract: Row): boolean {
    return ['DRAFT', 'ACTIVE'].includes(contract.status)
      && isCurrentOrFutureDate(contract.end_date)
      && isCurrentOrFutureDate(contract.move_out_date);
  }

  async withTransaction<T>(fn: (client: typeof this.client) => Promise<T>): Promise<T> {
    return fn(this.client);
  }

  private tenantRow(id: string, userId: string | null, managerUserId: string, fullName: string, identityNumber: string, email: string | null, phone: string) {
    return {
      id,
      user_id: userId,
      manager_user_id: managerUserId,
      full_name: fullName,
      dob: null,
      gender: null,
      identity_number: identityNumber,
      identity_issued_date: null,
      identity_issued_place: null,
      email,
      phone,
      permanent_address: null,
      status: 'ACTIVE',
      note: null,
      created_at: now,
      updated_at: now
    };
  }

  private contractRow(id: string, roomId: string, code: string, status: string, startDate: string, rentPrice: number, billingDay: number) {
    return {
      id,
      room_id: roomId,
      contract_code: code,
      status,
      start_date: startDate,
      end_date: null,
      move_in_date: startDate,
      move_out_date: null,
      rent_price: rentPrice,
      deposit_amount: 0,
      billing_day: billingDay,
      note: null,
      created_at: now,
      updated_at: now
    };
  }

  private readingRow(id: string, roomId: string, month: string, electricityPrev: number, electricityCurr: number, waterPrev: number, waterCurr: number, status: string) {
    return {
      id,
      room_id: roomId,
      month,
      electricity_prev: electricityPrev,
      electricity_curr: electricityCurr,
      water_prev: waterPrev,
      water_curr: waterCurr,
      status,
      reported_by_user_id: ids.tenantAUser,
      reported_at: now,
      submitted_at: now,
      approved_by_user_id: status === 'APPROVED' ? ids.managerAUser : null,
      approved_at: status === 'APPROVED' ? now : null,
      verified_by_user_id: null,
      verified_at: null,
      rejected_by_user_id: null,
      rejected_at: null,
      rejection_reason: null,
      note: null,
      created_at: now,
      updated_at: now
    };
  }

  private newId() {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`;
  }

  private getRoomForManager(roomId: string, managerId?: string) {
    const room = this.rooms.find((item) => item.id === roomId);
    if (!room) return null;
    const building = this.buildings.find((item) => item.id === room.building_id);
    if (managerId && building?.manager_user_id !== managerId) return null;
    return room;
  }

  private getContractForManager(contractId: string, managerId: string) {
    const contract = this.contracts.find((item) => item.id === contractId);
    if (!contract) return null;
    return this.getRoomForManager(contract.room_id, managerId) ? contract : null;
  }

  private decorateContract(contract: Row) {
    const room = this.rooms.find((item) => item.id === contract.room_id)!;
    const building = this.buildings.find((item) => item.id === room.building_id)!;
    return {
      ...contract,
      building_id: building.id,
      room_code: room.code,
      max_occupants: room.max_occupants,
      building_name: building.name
    };
  }

  private activeContractForTenant(tenantId: string) {
    const assignment = this.contractTenants.find((item) => item.tenant_id === tenantId && !item.left_at);
    return assignment ? this.contracts.find((contract) => contract.id === assignment.contract_id && contract.status === 'ACTIVE') : null;
  }

  private currentRentalForTenant(tenantId: string, managerId: string) {
    const contract = this.activeContractForTenant(tenantId);
    if (!contract) return null;
    const room = this.getRoomForManager(contract.room_id, managerId);
    if (!room) return null;
    const building = this.buildings.find((item) => item.id === room.building_id)!;
    return {
      room_id: room.id,
      room_code: room.code,
      building_id: building.id,
      building_name: building.name,
      contract_id: contract.id,
      start_date: contract.start_date,
      contract_status: contract.status
    };
  }

  private isTenantVisibleToManager(tenantId: string, managerId: string) {
    const tenant = this.tenants.find((item) => item.id === tenantId);
    if (!tenant || tenant.status === 'DELETED') return false;
    const active = this.activeContractForTenant(tenantId);
    if (!active) return true;
    return Boolean(this.getRoomForManager(active.room_id, managerId));
  }

  private visibleTenantsForManager(managerId: string) {
    return this.tenants.filter((tenant) => tenant.manager_user_id === managerId && tenant.status !== 'DELETED');
  }

  private decorateTenantForManager(tenant: Row, managerId: string) {
    const rental = this.currentRentalForTenant(tenant.id, managerId);
    return {
      ...tenant,
      room_id: rental?.room_id ?? null,
      room_code: rental?.room_code ?? null,
      building_id: rental?.building_id ?? null,
      building_name: rental?.building_name ?? null,
      contract_id: rental?.contract_id ?? null,
      start_date: rental?.start_date ?? null,
      contract_status: rental?.contract_status ?? null
    };
  }

  private updateTenant<T extends Row>(text: string, params: unknown[]) {
    const tenantId = params[params.length - 2];
    const managerId = String(params[params.length - 1]);
    const tenant = this.tenants.find((item) => item.id === tenantId && item.status !== 'DELETED');
    if (!tenant || !this.isTenantVisibleToManager(tenant.id, managerId)) return result<T>([]);

    const match = text.match(/update tenant set (.+?) where /i);
    if (!match) return result<T>([]);
    for (const assignment of match[1].split(',')) {
      const fieldMatch = assignment.trim().match(/^([a-z_]+)=\$(\d+)/i);
      if (!fieldMatch) continue;
      tenant[fieldMatch[1]] = params[Number(fieldMatch[2]) - 1] ?? null;
    }
    tenant.updated_at = now;
    return result<T>([tenant as T]);
  }

  private getReadingForManager(readingId: string, managerId: string) {
    const reading = this.utilityReadings.find((item) => item.id === readingId);
    if (!reading) return null;
    return this.getRoomForManager(reading.room_id, managerId) ? reading : null;
  }

  private getReadingForTenant(readingId: string, tenantUserId: string) {
    const reading = this.utilityReadings.find((item) => item.id === readingId);
    if (!reading) return null;
    const contract = this.contracts.find((item) => item.room_id === reading.room_id && item.status === 'ACTIVE');
    const belongs = contract && this.contractTenants.some((ct) => ct.contract_id === contract.id && !ct.left_at && this.tenants.some((tenant) => tenant.id === ct.tenant_id && tenant.user_id === tenantUserId));
    return belongs ? reading : null;
  }

  private decorateReading(reading: Row) {
    const room = this.rooms.find((item) => item.id === reading.room_id)!;
    const building = this.buildings.find((item) => item.id === room.building_id)!;
    const contract = this.contracts.find((item) => item.room_id === room.id && item.status === 'ACTIVE');
    const assignment = contract ? this.contractTenants.find((item) => item.contract_id === contract.id && !item.left_at) : null;
    const tenant = assignment ? this.tenants.find((item) => item.id === assignment.tenant_id) : null;
    return {
      ...reading,
      room_code: room.code,
      building_id: building.id,
      building_name: building.name,
      tenant_id: tenant?.id ?? null,
      tenant_name: tenant?.full_name ?? null,
      evidence_count: this.utilityEvidence.filter((item) => item.utility_reading_id === reading.id).length
    };
  }

  private getInvoiceForManager(invoiceId: string, managerId: string) {
    const invoice = this.invoices.find((item) => item.id === invoiceId);
    if (!invoice) return null;
    return this.getRoomForManager(invoice.room_id, managerId) ? invoice : null;
  }

  private getPaymentRequestForTenant(paymentRequestId: string, tenantUserId: string) {
    const request = this.paymentRequests.find((item) => item.id === paymentRequestId);
    if (!request) return null;
    const invoice = this.invoices.find((item) => item.id === request.invoice_id);
    if (!invoice) return null;
    const belongs = this.contractTenants.some((ct) => ct.contract_id === invoice.contract_id && !ct.left_at && this.tenants.some((tenant) => tenant.id === ct.tenant_id && tenant.user_id === tenantUserId));
    return belongs ? { ...request, invoice_total: invoice.total, tenant_user_id: tenantUserId } : null;
  }

  private getPaymentProofForManager(proofId: string, managerId: string) {
    const proof = this.paymentProofs.find((item) => item.id === proofId);
    if (!proof) return null;
    const request = this.paymentRequests.find((item) => item.id === proof.payment_request_id);
    const invoice = request ? this.getInvoiceForManager(request.invoice_id, managerId) : null;
    if (!request || !invoice) return null;
    return {
      ...proof,
      invoice_id: invoice.id,
      payment_request_id: request.id,
      request_amount: request.amount,
      invoice_total: invoice.total,
      invoice_status: invoice.status
    };
  }
}

export const fakeDb = new FakeDb();

export const query = <T extends Row = Row>(text: string, params?: unknown[]) => fakeDb.query<T>(text, params);
export const withTransaction = <T>(fn: (client: typeof fakeDb.client) => Promise<T>) => fakeDb.withTransaction(fn);
