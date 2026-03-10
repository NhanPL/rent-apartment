import dayjs from 'dayjs'
import type {
  Building,
  Contract,
  ContractTenant,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  Payment,
  PaymentListItem,
  PaymentListParams,
  PaymentSummary,
  PaymentUpsertPayload,
  Room,
  Tenant,
  UnpaidRoomItem,
} from '../pages/payments/types'

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const buildingsDb: Building[] = [
  { id: 'b-1', name: 'Sunrise Riverside' },
  { id: 'b-2', name: 'Lotus Garden' },
]

const roomsDb: Room[] = [
  { id: 'r-101', building_id: 'b-1', code: 'A-101' },
  { id: 'r-102', building_id: 'b-1', code: 'A-102' },
  { id: 'r-201', building_id: 'b-2', code: 'B-201' },
]

const tenantsDb: Tenant[] = [
  { id: 't-1', full_name: 'Nguyen Minh Anh' },
  { id: 't-2', full_name: 'Tran Gia Bao' },
  { id: 't-3', full_name: 'Le Thanh Binh' },
]

const contractsDb: Contract[] = [
  { id: 'c-1', room_id: 'r-101', status: 'ACTIVE', rent_price: 5500000, billing_day: 5 },
  { id: 'c-2', room_id: 'r-102', status: 'ACTIVE', rent_price: 4800000, billing_day: 8 },
  { id: 'c-3', room_id: 'r-201', status: 'ACTIVE', rent_price: 6200000, billing_day: 10 },
]

const contractTenantsDb: ContractTenant[] = [
  { contract_id: 'c-1', tenant_id: 't-1', is_primary: true, left_at: null },
  { contract_id: 'c-2', tenant_id: 't-2', is_primary: true, left_at: null },
  { contract_id: 'c-3', tenant_id: 't-3', is_primary: true, left_at: null },
]

let invoicesDb: Invoice[] = [
  {
    id: 'inv-1',
    contract_id: 'c-1',
    room_id: 'r-101',
    month: dayjs().startOf('month').format('YYYY-MM-DD'),
    status: 'ISSUED',
    issued_at: dayjs().startOf('month').add(1, 'day').toISOString(),
    due_date: dayjs().startOf('month').add(5, 'day').format('YYYY-MM-DD'),
    note: 'Monthly billing',
    subtotal: 6050000,
    discount: 50000,
    total: 6000000,
    created_at: dayjs().toISOString(),
    updated_at: dayjs().toISOString(),
  },
  {
    id: 'inv-2',
    contract_id: 'c-3',
    room_id: 'r-201',
    month: dayjs().startOf('month').format('YYYY-MM-DD'),
    status: 'PAID',
    issued_at: dayjs().startOf('month').add(1, 'day').toISOString(),
    due_date: dayjs().startOf('month').add(10, 'day').format('YYYY-MM-DD'),
    note: null,
    subtotal: 7000000,
    discount: 0,
    total: 7000000,
    created_at: dayjs().toISOString(),
    updated_at: dayjs().toISOString(),
  },
]

let invoiceItemsDb: InvoiceItem[] = [
  { id: 'itm-1', invoice_id: 'inv-1', code: 'RENT', name: 'Room rent', quantity: 1, unit_price: 5500000, amount: 5500000 },
  { id: 'itm-2', invoice_id: 'inv-1', code: 'ELECTRIC', name: 'Electricity', quantity: 1, unit_price: 350000, amount: 350000 },
  { id: 'itm-3', invoice_id: 'inv-1', code: 'WATER', name: 'Water', quantity: 1, unit_price: 120000, amount: 120000 },
  { id: 'itm-4', invoice_id: 'inv-1', code: 'SERVICE', name: 'Service fee', quantity: 1, unit_price: 80000, amount: 80000 },
  { id: 'itm-5', invoice_id: 'inv-2', code: 'RENT', name: 'Room rent', quantity: 1, unit_price: 6200000, amount: 6200000 },
  { id: 'itm-6', invoice_id: 'inv-2', code: 'ELECTRIC', name: 'Electricity', quantity: 1, unit_price: 500000, amount: 500000 },
  { id: 'itm-7', invoice_id: 'inv-2', code: 'WATER', name: 'Water', quantity: 1, unit_price: 150000, amount: 150000 },
  { id: 'itm-8', invoice_id: 'inv-2', code: 'SERVICE', name: 'Service fee', quantity: 1, unit_price: 150000, amount: 150000 },
]

const paymentsDb: Payment[] = [
  { id: 'p-1', invoice_id: 'inv-1', method: 'BANK_TRANSFER', status: 'PENDING', amount: 3000000, paid_at: null },
  { id: 'p-2', invoice_id: 'inv-2', method: 'CASH', status: 'SUCCEEDED', amount: 7000000, paid_at: dayjs().toISOString() },
]

const STATUS_ORDER: InvoiceStatus[] = ['OVERDUE', 'ISSUED', 'DRAFT', 'PAID', 'VOID']

function getPrimaryTenant(contractId: string): Tenant | null {
  const linked = contractTenantsDb.filter((item) => item.contract_id === contractId && item.left_at === null)
  const selected = linked.find((item) => item.is_primary) ?? linked[0]
  return selected ? tenantsDb.find((tenant) => tenant.id === selected.tenant_id) ?? null : null
}

function amountByCode(invoiceId: string, code: string) {
  return invoiceItemsDb.filter((item) => item.invoice_id === invoiceId && item.code === code).reduce((acc, item) => acc + item.amount, 0)
}

function toListItem(invoice: Invoice): PaymentListItem {
  const room = roomsDb.find((item) => item.id === invoice.room_id)
  const building = buildingsDb.find((item) => item.id === room?.building_id)
  const tenant = getPrimaryTenant(invoice.contract_id)
  const paidRows = paymentsDb.filter((item) => item.invoice_id === invoice.id && item.status === 'SUCCEEDED')

  return {
    ...invoice,
    building_name: building?.name ?? '-',
    room_code: room?.code ?? '-',
    tenant_name: tenant?.full_name ?? '-',
    rent_amount: amountByCode(invoice.id, 'RENT'),
    electric_amount: amountByCode(invoice.id, 'ELECTRIC'),
    water_amount: amountByCode(invoice.id, 'WATER'),
    service_amount: amountByCode(invoice.id, 'SERVICE'),
    paid_amount: paidRows.reduce((acc, row) => acc + row.amount, 0),
    paid_at: paidRows.map((item) => item.paid_at).find((value): value is string => Boolean(value)) ?? null,
  }
}

export async function listBuildings() {
  await wait(120)
  return [...buildingsDb]
}

export async function listRooms() {
  await wait(120)
  return [...roomsDb]
}

export async function listTenants() {
  await wait(120)
  return [...tenantsDb]
}

export async function listContracts() {
  await wait(120)
  return [...contractsDb]
}

export async function listPayments(params: PaymentListParams): Promise<PaymentListItem[]> {
  await wait(240)

  const search = params.search?.trim().toLowerCase() ?? ''

  return invoicesDb
    .map(toListItem)
    .filter((item) => {
      const room = roomsDb.find((row) => row.id === item.room_id)
      const buildingId = room?.building_id
      const tenant = getPrimaryTenant(item.contract_id)

      const matchesSearch =
        search.length === 0 ||
        item.room_code.toLowerCase().includes(search) ||
        item.building_name.toLowerCase().includes(search) ||
        item.tenant_name.toLowerCase().includes(search)

      const matchesMonth = !params.month || dayjs(item.month).format('YYYY-MM') === params.month
      const matchesStatus = !params.status || item.status === params.status
      const matchesBuilding = !params.building_id || buildingId === params.building_id
      const matchesRoom = !params.room_id || item.room_id === params.room_id
      const matchesTenant = !params.tenant_id || tenant?.id === params.tenant_id

      return matchesSearch && matchesMonth && matchesStatus && matchesBuilding && matchesRoom && matchesTenant
    })
    .sort((a, b) => {
      const monthDiff = dayjs(b.month).valueOf() - dayjs(a.month).valueOf()
      if (monthDiff !== 0) return monthDiff
      return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    })
}

export async function getPayment(id: string): Promise<PaymentListItem> {
  await wait(200)
  const invoice = invoicesDb.find((item) => item.id === id)
  if (!invoice) {
    throw new Error('Invoice not found')
  }
  return toListItem(invoice)
}

export async function createPayment(payload: PaymentUpsertPayload): Promise<PaymentListItem> {
  await wait(240)
  const subtotal = payload.rent_amount + payload.electric_amount + payload.water_amount + payload.service_amount
  const total = Math.max(0, subtotal - payload.discount)
  const now = new Date().toISOString()

  const row: Invoice = {
    id: crypto.randomUUID(),
    contract_id: payload.contract_id,
    room_id: payload.room_id,
    month: payload.month,
    status: payload.status,
    issued_at: payload.issued_at,
    due_date: payload.due_date,
    note: payload.note,
    subtotal,
    discount: payload.discount,
    total,
    created_at: now,
    updated_at: now,
  }

  invoicesDb = [...invoicesDb, row]

  const nextItems: InvoiceItem[] = [
    { id: crypto.randomUUID(), invoice_id: row.id, code: 'RENT', name: 'Room rent', quantity: 1, unit_price: payload.rent_amount, amount: payload.rent_amount },
    { id: crypto.randomUUID(), invoice_id: row.id, code: 'ELECTRIC', name: 'Electricity', quantity: 1, unit_price: payload.electric_amount, amount: payload.electric_amount },
    { id: crypto.randomUUID(), invoice_id: row.id, code: 'WATER', name: 'Water', quantity: 1, unit_price: payload.water_amount, amount: payload.water_amount },
    { id: crypto.randomUUID(), invoice_id: row.id, code: 'SERVICE', name: 'Service fee', quantity: 1, unit_price: payload.service_amount, amount: payload.service_amount },
  ]

  invoiceItemsDb = [...invoiceItemsDb, ...nextItems]
  return toListItem(row)
}

export async function updatePayment(id: string, payload: PaymentUpsertPayload): Promise<PaymentListItem> {
  await wait(240)
  const idx = invoicesDb.findIndex((item) => item.id === id)
  if (idx < 0) {
    throw new Error('Invoice not found')
  }

  const subtotal = payload.rent_amount + payload.electric_amount + payload.water_amount + payload.service_amount
  const total = Math.max(0, subtotal - payload.discount)

  const updated: Invoice = {
    ...invoicesDb[idx],
    contract_id: payload.contract_id,
    room_id: payload.room_id,
    month: payload.month,
    status: payload.status,
    issued_at: payload.issued_at,
    due_date: payload.due_date,
    note: payload.note,
    subtotal,
    discount: payload.discount,
    total,
    updated_at: new Date().toISOString(),
  }

  invoicesDb[idx] = updated

  invoiceItemsDb = invoiceItemsDb.filter((item) => item.invoice_id !== id)
  invoiceItemsDb.push(
    { id: crypto.randomUUID(), invoice_id: id, code: 'RENT', name: 'Room rent', quantity: 1, unit_price: payload.rent_amount, amount: payload.rent_amount },
    { id: crypto.randomUUID(), invoice_id: id, code: 'ELECTRIC', name: 'Electricity', quantity: 1, unit_price: payload.electric_amount, amount: payload.electric_amount },
    { id: crypto.randomUUID(), invoice_id: id, code: 'WATER', name: 'Water', quantity: 1, unit_price: payload.water_amount, amount: payload.water_amount },
    { id: crypto.randomUUID(), invoice_id: id, code: 'SERVICE', name: 'Service fee', quantity: 1, unit_price: payload.service_amount, amount: payload.service_amount },
  )

  return toListItem(updated)
}

export async function deletePayment(id: string): Promise<void> {
  await wait(220)
  invoicesDb = invoicesDb.filter((item) => item.id !== id)
  invoiceItemsDb = invoiceItemsDb.filter((item) => item.invoice_id !== id)
}

export async function getUnpaidRooms(month: string): Promise<UnpaidRoomItem[]> {
  await wait(200)

  return contractsDb
    .filter((contract) => contract.status === 'ACTIVE')
    .map((contract) => {
      const room = roomsDb.find((item) => item.id === contract.room_id)
      const building = buildingsDb.find((item) => item.id === room?.building_id)
      const tenant = getPrimaryTenant(contract.id)
      const invoice = invoicesDb.find((row) => row.contract_id === contract.id && dayjs(row.month).format('YYYY-MM') === month)

      if (!room || !building || !tenant) {
        return null
      }

      if (invoice?.status === 'PAID') {
        return null
      }

      return {
        contract_id: contract.id,
        building_id: building.id,
        building_name: building.name,
        room_id: room.id,
        room_code: room.code,
        tenant_id: tenant.id,
        tenant_name: tenant.full_name,
        month,
        amount_due: invoice?.total ?? contract.rent_price,
        due_date: invoice?.due_date ?? null,
        invoice_id: invoice?.id ?? null,
      }
    })
    .filter((item): item is UnpaidRoomItem => Boolean(item))
}

export async function getPaymentsSummary(month: string): Promise<PaymentSummary> {
  const rows = await listPayments({ month })
  return {
    totalInvoices: rows.length,
    paidInvoices: rows.filter((item) => item.status === 'PAID').length,
    unpaidInvoices: rows.filter((item) => item.status !== 'PAID' && item.status !== 'VOID').length,
    totalRevenue: rows.filter((item) => item.status === 'PAID').reduce((acc, item) => acc + item.total, 0),
  }
}
