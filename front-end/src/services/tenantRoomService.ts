import dayjs from 'dayjs'

export type AppUserRole = 'MANAGER' | 'TENANT'

export interface AppUser {
  id: string
  email: string
  password_hash: string
  role: AppUserRole
  is_active: boolean
}

export interface Tenant {
  id: string
  user_id: string | null
  full_name: string
  gender: string | null
  phone: string
  status: 'ACTIVE' | 'MOVED_OUT' | 'BLACKLIST'
}

export interface Building {
  id: string
  manager_user_id: string
  code: string
  name: string
}

export interface Room {
  id: string
  building_id: string
  code: string
  floor: number | null
  area_m2: number | null
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE'
  base_rent: number
  max_occupants: number
  note: string | null
}

export interface Contract {
  id: string
  room_id: string
  status: 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
  start_date: string
  move_in_date: string | null
  rent_price: number
}

export interface ContractTenant {
  contract_id: string
  tenant_id: string
  is_primary: boolean
  joined_at: string
  left_at: string | null
}

export interface Invoice {
  id: string
  contract_id: string
  room_id: string
  month: string
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'OVERDUE'
  due_date: string | null
  issued_at: string | null
  subtotal: number
  discount: number
  total: number
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  code: string
  name: string
  quantity: number
  unit_price: number
  amount: number
}

export interface UtilityReading {
  id: string
  room_id: string
  month: string
  electricity_prev: number | null
  electricity_curr: number | null
  water_prev: number | null
  water_curr: number | null
  reported_by_user_id: string | null
  reported_at: string | null
  note: string | null
}

export interface TenantRoomContext {
  tenant: Tenant
  room: Room
  building: Building
  contract: Contract
}

export interface RoommateSummary {
  tenant_id: string
  full_name: string
  gender: string | null
  phone: string
  joined_at: string
  is_primary: boolean
}

export interface CurrentMonthInvoiceSummary {
  id: string
  month: string
  status: Invoice['status']
  due_date: string | null
  issued_at: string | null
  rent_amount: number
  electric_amount: number
  water_amount: number
  other_amount: number
  total: number
}

export interface UtilityReadingPayload {
  month: string
  electricity_prev: number | null
  electricity_curr: number | null
  water_prev: number | null
  water_curr: number | null
  note: string | null
}

const AUTH_USER_STORAGE_KEY = 'auth_user_id'
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const appUsers: AppUser[] = [
  { id: 'u-manager-1', email: 'manager@rent.vn', password_hash: '***', role: 'MANAGER', is_active: true },
  { id: 'u-tenant-1', email: 'minhanh@gmail.com', password_hash: '***', role: 'TENANT', is_active: true },
  { id: 'u-tenant-2', email: 'giabao@gmail.com', password_hash: '***', role: 'TENANT', is_active: true },
  { id: 'u-tenant-3', email: 'thanhbinh@gmail.com', password_hash: '***', role: 'TENANT', is_active: true },
]

const tenants: Tenant[] = [
  { id: 't-1', user_id: 'u-tenant-1', full_name: 'Nguyễn Minh Anh', gender: 'FEMALE', phone: '0901234567', status: 'ACTIVE' },
  { id: 't-2', user_id: 'u-tenant-2', full_name: 'Trần Gia Bảo', gender: 'MALE', phone: '0912233445', status: 'ACTIVE' },
  { id: 't-3', user_id: 'u-tenant-3', full_name: 'Lê Thanh Bình', gender: null, phone: '0988111222', status: 'ACTIVE' },
]

const buildings: Building[] = [
  { id: 'b-1', manager_user_id: 'u-manager-1', code: 'SUNRISE', name: 'Sunrise Riverside' },
  { id: 'b-2', manager_user_id: 'u-manager-1', code: 'LOTUS', name: 'Lotus Garden' },
]

const rooms: Room[] = [
  { id: 'r-101', building_id: 'b-1', code: 'A-101', floor: 1, area_m2: 28, status: 'ACTIVE', base_rent: 5500000, max_occupants: 3, note: 'Near balcony' },
  { id: 'r-102', building_id: 'b-1', code: 'A-102', floor: 1, area_m2: 24, status: 'ACTIVE', base_rent: 4800000, max_occupants: 2, note: null },
]

const contracts: Contract[] = [
  { id: 'c-1', room_id: 'r-101', status: 'ACTIVE', start_date: '2025-01-01', move_in_date: '2025-01-02', rent_price: 5600000 },
  { id: 'c-2', room_id: 'r-102', status: 'ACTIVE', start_date: '2025-02-01', move_in_date: '2025-02-03', rent_price: 4800000 },
]

const contractTenants: ContractTenant[] = [
  { contract_id: 'c-1', tenant_id: 't-1', is_primary: true, joined_at: '2025-01-02', left_at: null },
  { contract_id: 'c-1', tenant_id: 't-2', is_primary: false, joined_at: '2025-02-01', left_at: null },
  { contract_id: 'c-1', tenant_id: 't-3', is_primary: false, joined_at: '2025-03-01', left_at: null },
]

const currentMonth = dayjs().startOf('month').format('YYYY-MM-DD')
const previousMonth = dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD')

const invoices: Invoice[] = [
  {
    id: 'inv-current-r101',
    contract_id: 'c-1',
    room_id: 'r-101',
    month: currentMonth,
    status: 'ISSUED',
    due_date: dayjs().startOf('month').add(7, 'day').format('YYYY-MM-DD'),
    issued_at: dayjs().startOf('month').add(1, 'day').toISOString(),
    subtotal: 0,
    discount: 0,
    total: 0,
  },
  {
    id: 'inv-prev-r101',
    contract_id: 'c-1',
    room_id: 'r-101',
    month: previousMonth,
    status: 'PAID',
    due_date: dayjs().subtract(1, 'month').startOf('month').add(7, 'day').format('YYYY-MM-DD'),
    issued_at: dayjs().subtract(1, 'month').startOf('month').add(1, 'day').toISOString(),
    subtotal: 0,
    discount: 0,
    total: 0,
  },
]

const invoiceItems: InvoiceItem[] = [
  { id: 'item-1', invoice_id: 'inv-current-r101', code: 'RENT', name: 'Room rent', quantity: 1, unit_price: 5600000, amount: 5600000 },
  { id: 'item-2', invoice_id: 'inv-current-r101', code: 'ELECTRIC', name: 'Electricity', quantity: 1, unit_price: 540000, amount: 540000 },
  { id: 'item-3', invoice_id: 'inv-current-r101', code: 'WATER', name: 'Water', quantity: 1, unit_price: 180000, amount: 180000 },
  { id: 'item-4', invoice_id: 'inv-current-r101', code: 'OTHER', name: 'Other fees', quantity: 1, unit_price: 120000, amount: 120000 },
  { id: 'item-5', invoice_id: 'inv-prev-r101', code: 'RENT', name: 'Room rent', quantity: 1, unit_price: 5600000, amount: 5600000 },
  { id: 'item-6', invoice_id: 'inv-prev-r101', code: 'ELECTRIC', name: 'Electricity', quantity: 1, unit_price: 500000, amount: 500000 },
  { id: 'item-7', invoice_id: 'inv-prev-r101', code: 'WATER', name: 'Water', quantity: 1, unit_price: 160000, amount: 160000 },
]

let utilityReadings: UtilityReading[] = [
  {
    id: 'reading-current-r101',
    room_id: 'r-101',
    month: currentMonth,
    electricity_prev: 1450,
    electricity_curr: 1585,
    water_prev: 320,
    water_curr: 330,
    reported_by_user_id: 'u-tenant-1',
    reported_at: dayjs().startOf('month').add(2, 'day').toISOString(),
    note: 'Submitted via tenant page',
  },
]

function getCurrentAppUser(): AppUser | null {
  const storedId = localStorage.getItem(AUTH_USER_STORAGE_KEY)
  const byStoredId = storedId ? appUsers.find((user) => user.id === storedId) : null

  if (byStoredId && byStoredId.is_active && byStoredId.role === 'TENANT') {
    return byStoredId
  }

  return appUsers.find((user) => user.role === 'TENANT' && user.is_active) ?? null
}

function getItemAmount(invoiceId: string, code: string) {
  return invoiceItems.filter((item) => item.invoice_id === invoiceId && item.code === code).reduce((total, item) => total + item.amount, 0)
}

function toInvoiceSummary(invoice: Invoice): CurrentMonthInvoiceSummary {
  const rentAmount = getItemAmount(invoice.id, 'RENT')
  const electricAmount = getItemAmount(invoice.id, 'ELECTRIC')
  const waterAmount = getItemAmount(invoice.id, 'WATER')
  const otherAmount = invoiceItems
    .filter((item) => item.invoice_id === invoice.id && !['RENT', 'ELECTRIC', 'WATER'].includes(item.code))
    .reduce((total, item) => total + item.amount, 0)

  const total = rentAmount + electricAmount + waterAmount + otherAmount - invoice.discount

  return {
    id: invoice.id,
    month: invoice.month,
    status: invoice.status,
    due_date: invoice.due_date,
    issued_at: invoice.issued_at,
    rent_amount: rentAmount,
    electric_amount: electricAmount,
    water_amount: waterAmount,
    other_amount: otherAmount,
    total,
  }
}

export async function getMyRoomContext(): Promise<TenantRoomContext | null> {
  await wait(140)
  const user = getCurrentAppUser()
  if (!user) {
    return null
  }

  const tenant = tenants.find((item) => item.user_id === user.id && item.status === 'ACTIVE')
  if (!tenant) {
    return null
  }

  const activeContractTenant = contractTenants.find((item) => item.tenant_id === tenant.id && item.left_at === null)
  if (!activeContractTenant) {
    return null
  }

  const contract = contracts.find((item) => item.id === activeContractTenant.contract_id && item.status === 'ACTIVE')
  if (!contract) {
    return null
  }

  const room = rooms.find((item) => item.id === contract.room_id)
  if (!room) {
    return null
  }

  const building = buildings.find((item) => item.id === room.building_id)
  if (!building) {
    return null
  }

  return { tenant, contract, room, building }
}

export async function getMyRoommates(roomId: string, contractId: string): Promise<RoommateSummary[]> {
  await wait(120)

  return contractTenants
    .filter((item) => item.contract_id === contractId && item.left_at === null)
    .map((item) => {
      const tenant = tenants.find((tenantRow) => tenantRow.id === item.tenant_id)

      return {
        tenant_id: item.tenant_id,
        full_name: tenant?.full_name ?? 'Unknown',
        gender: tenant?.gender ?? null,
        phone: tenant?.phone ?? '-',
        joined_at: item.joined_at,
        is_primary: item.is_primary,
      }
    })
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.full_name.localeCompare(b.full_name))
}

export async function getCurrentMonthBill(contractId: string): Promise<CurrentMonthInvoiceSummary | null> {
  await wait(130)
  const month = dayjs().startOf('month').format('YYYY-MM-DD')
  const invoice = invoices.find((item) => item.contract_id === contractId && item.month === month)

  return invoice ? toInvoiceSummary(invoice) : null
}

export async function listMyRecentBills(contractId: string): Promise<CurrentMonthInvoiceSummary[]> {
  await wait(130)
  return invoices
    .filter((item) => item.contract_id === contractId)
    .map(toInvoiceSummary)
    .sort((a, b) => dayjs(b.month).valueOf() - dayjs(a.month).valueOf())
    .slice(0, 6)
}

export async function getMyUtilityReading(roomId: string, month: string): Promise<UtilityReading | null> {
  await wait(100)
  const normalizedMonth = dayjs(month).startOf('month').format('YYYY-MM-DD')
  return utilityReadings.find((item) => item.room_id === roomId && item.month === normalizedMonth) ?? null
}

export async function upsertMyUtilityReading(roomId: string, payload: UtilityReadingPayload): Promise<UtilityReading> {
  await wait(160)
  const normalizedMonth = dayjs(payload.month).startOf('month').format('YYYY-MM-DD')
  const user = getCurrentAppUser()

  const existing = utilityReadings.find((item) => item.room_id === roomId && item.month === normalizedMonth)

  if (existing) {
    existing.electricity_prev = payload.electricity_prev
    existing.electricity_curr = payload.electricity_curr
    existing.water_prev = payload.water_prev
    existing.water_curr = payload.water_curr
    existing.note = payload.note
    existing.reported_by_user_id = user?.id ?? existing.reported_by_user_id
    existing.reported_at = new Date().toISOString()
    return existing
  }

  const next: UtilityReading = {
    id: crypto.randomUUID(),
    room_id: roomId,
    month: normalizedMonth,
    electricity_prev: payload.electricity_prev,
    electricity_curr: payload.electricity_curr,
    water_prev: payload.water_prev,
    water_curr: payload.water_curr,
    note: payload.note,
    reported_by_user_id: user?.id ?? null,
    reported_at: new Date().toISOString(),
  }

  utilityReadings = [next, ...utilityReadings]
  return next
}
