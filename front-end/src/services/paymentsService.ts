import dayjs from 'dayjs'
import type {
  Building,
  Contract,
  ContractTenant,
  Invoice,
  InvoiceItem,
  Payment,
  PaymentListItem,
  PaymentListParams,
  PaymentSummary,
  PaymentUpsertPayload,
  Room,
  Tenant,
  UtilityRate,
  UtilityReading,
} from '../pages/payments/types'

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const buildingsDb: Building[] = [
  { id: 'b-1', name: 'Sunrise Riverside' },
  { id: 'b-2', name: 'Lotus Garden' },
]

const roomsDb: Room[] = [
  { id: 'r-101', building_id: 'b-1', code: 'A-101', base_rent: 5500000 },
  { id: 'r-102', building_id: 'b-1', code: 'A-102', base_rent: 4800000 },
  { id: 'r-201', building_id: 'b-2', code: 'B-201', base_rent: 6200000 },
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

const utilityRatesDb: UtilityRate[] = [
  { id: 'ur-1', building_id: 'b-1', effective_from: '2025-01-01', electricity_unit_price: 3500, water_unit_price: 18000 },
  { id: 'ur-2', building_id: 'b-2', effective_from: '2025-01-01', electricity_unit_price: 3800, water_unit_price: 20000 },
]

let utilityReadingsDb: UtilityReading[] = [
  {
    id: 'read-1',
    room_id: 'r-101',
    month: dayjs().startOf('month').format('YYYY-MM-DD'),
    electricity_prev: 1200,
    electricity_curr: 1300,
    water_prev: 380,
    water_curr: 388,
    note: null,
  },
  {
    id: 'read-2',
    room_id: 'r-201',
    month: dayjs().startOf('month').format('YYYY-MM-DD'),
    electricity_prev: 930,
    electricity_curr: 1050,
    water_prev: 250,
    water_curr: 258,
    note: null,
  },
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
    subtotal: 0,
    discount: 50000,
    total: 0,
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
    subtotal: 0,
    discount: 0,
    total: 0,
    created_at: dayjs().toISOString(),
    updated_at: dayjs().toISOString(),
  },
]

let invoiceItemsDb: InvoiceItem[] = []

const paymentsDb: Payment[] = [
  { id: 'p-1', invoice_id: 'inv-1', method: 'BANK_TRANSFER', status: 'PENDING', amount: 3000000, paid_at: null },
  { id: 'p-2', invoice_id: 'inv-2', method: 'CASH', status: 'SUCCEEDED', amount: 7000000, paid_at: dayjs().toISOString() },
]

function getPrimaryTenant(contractId: string): Tenant | null {
  const linked = contractTenantsDb.filter((item) => item.contract_id === contractId && item.left_at === null)
  const selected = linked.find((item) => item.is_primary) ?? linked[0]
  return selected ? tenantsDb.find((tenant) => tenant.id === selected.tenant_id) ?? null : null
}

function getRoom(roomId: string) {
  return roomsDb.find((room) => room.id === roomId) ?? null
}

function resolveRate(buildingId: string, month: string) {
  const monthDate = dayjs(month)
  const row = utilityRatesDb
    .filter((rate) => rate.building_id === buildingId && dayjs(rate.effective_from).isSameOrBefore(monthDate, 'day'))
    .sort((a, b) => dayjs(b.effective_from).valueOf() - dayjs(a.effective_from).valueOf())[0]

  return row ?? null
}

function findReading(roomId: string, month: string) {
  return utilityReadingsDb.find((item) => item.room_id === roomId && item.month === month) ?? null
}

function getAmountByCode(invoiceId: string, code: string) {
  return invoiceItemsDb.filter((item) => item.invoice_id === invoiceId && item.code === code).reduce((acc, item) => acc + item.amount, 0)
}

function getLatestPayment(invoiceId: string) {
  const rows = paymentsDb.filter((item) => item.invoice_id === invoiceId)
  if (rows.length === 0) {
    return null
  }

  return rows[rows.length - 1]
}

function calculateUtility(prev: number | null, curr: number | null, unitPrice: number) {
  if (prev === null || curr === null) {
    return { prev, curr, usage: 0, amount: 0 }
  }

  const usage = Math.max(0, curr - prev)
  return { prev, curr, usage, amount: usage * unitPrice }
}

function upsertInvoiceItems(invoice: Invoice, rentAmount: number, electricAmount: number, waterAmount: number, otherFees: number) {
  invoiceItemsDb = invoiceItemsDb.filter((item) => item.invoice_id !== invoice.id)
  const next: InvoiceItem[] = [
    { id: crypto.randomUUID(), invoice_id: invoice.id, code: 'RENT', name: 'Room rent', quantity: 1, unit_price: rentAmount, amount: rentAmount },
    { id: crypto.randomUUID(), invoice_id: invoice.id, code: 'ELECTRIC', name: 'Electricity', quantity: 1, unit_price: electricAmount, amount: electricAmount },
    { id: crypto.randomUUID(), invoice_id: invoice.id, code: 'WATER', name: 'Water', quantity: 1, unit_price: waterAmount, amount: waterAmount },
    { id: crypto.randomUUID(), invoice_id: invoice.id, code: 'OTHER', name: 'Other fees', quantity: 1, unit_price: otherFees, amount: otherFees },
  ]

  invoiceItemsDb = [...invoiceItemsDb, ...next]
}

function hydrateInvoiceTotals(invoice: Invoice) {
  const rent = getAmountByCode(invoice.id, 'RENT')
  const electric = getAmountByCode(invoice.id, 'ELECTRIC')
  const water = getAmountByCode(invoice.id, 'WATER')
  const other = getAmountByCode(invoice.id, 'OTHER')
  const subtotal = rent + electric + water + other
  const total = Math.max(0, subtotal - invoice.discount)

  return { ...invoice, subtotal, total }
}

function toListItem(invoice: Invoice): PaymentListItem {
  const hydratedInvoice = hydrateInvoiceTotals(invoice)
  const room = getRoom(hydratedInvoice.room_id)
  const building = room ? buildingsDb.find((item) => item.id === room.building_id) : null
  const tenant = getPrimaryTenant(hydratedInvoice.contract_id)
  const payment = getLatestPayment(hydratedInvoice.id)
  const reading = findReading(hydratedInvoice.room_id, hydratedInvoice.month)
  const rates = building ? resolveRate(building.id, hydratedInvoice.month) : null

  const electricRate = rates?.electricity_unit_price ?? 0
  const waterRate = rates?.water_unit_price ?? 0
  const electricData = calculateUtility(reading?.electricity_prev ?? null, reading?.electricity_curr ?? null, electricRate)
  const waterData = calculateUtility(reading?.water_prev ?? null, reading?.water_curr ?? null, waterRate)

  return {
    ...hydratedInvoice,
    building_id: building?.id ?? '',
    building_name: building?.name ?? '-',
    room_code: room?.code ?? '-',
    tenant_id: tenant?.id ?? null,
    tenant_name: tenant?.full_name ?? '-',
    rent_amount: getAmountByCode(hydratedInvoice.id, 'RENT'),
    electric_unit_price: electricRate,
    water_unit_price: waterRate,
    electricity_prev: electricData.prev,
    electricity_curr: electricData.curr,
    water_prev: waterData.prev,
    water_curr: waterData.curr,
    electric_usage: electricData.usage,
    water_usage: waterData.usage,
    electric_amount: getAmountByCode(hydratedInvoice.id, 'ELECTRIC'),
    water_amount: getAmountByCode(hydratedInvoice.id, 'WATER'),
    other_fees: getAmountByCode(hydratedInvoice.id, 'OTHER'),
    paid_amount: paymentsDb
      .filter((item) => item.invoice_id === hydratedInvoice.id && item.status === 'SUCCEEDED')
      .reduce((acc, item) => acc + item.amount, 0),
    paid_at: payment?.paid_at ?? null,
    payment_status: payment?.status ?? null,
  }
}

function ensureInvoiceMonth(value: string) {
  return dayjs(value).startOf('month').format('YYYY-MM-DD')
}

function seedInvoiceItemsFromReading() {
  invoicesDb.forEach((invoice) => {
    const room = getRoom(invoice.room_id)
    const buildingId = room?.building_id
    const rates = buildingId ? resolveRate(buildingId, invoice.month) : null
    const reading = findReading(invoice.room_id, invoice.month)
    const rentAmount = contractsDb.find((contract) => contract.id === invoice.contract_id)?.rent_price ?? 0
    const electricUsage = reading?.electricity_prev !== null && reading?.electricity_curr !== null ? Math.max(0, reading.electricity_curr - reading.electricity_prev) : 0
    const waterUsage = reading?.water_prev !== null && reading?.water_curr !== null ? Math.max(0, reading.water_curr - reading.water_prev) : 0
    const electricAmount = electricUsage * (rates?.electricity_unit_price ?? 0)
    const waterAmount = waterUsage * (rates?.water_unit_price ?? 0)

    upsertInvoiceItems(invoice, rentAmount, electricAmount, waterAmount, 80000)
  })
}

seedInvoiceItemsFromReading()

export async function listBuildings() {
  await wait(100)
  return [...buildingsDb]
}

export async function listRooms() {
  await wait(100)
  return [...roomsDb]
}

export async function listTenants() {
  await wait(100)
  return [...tenantsDb]
}

export async function listContracts() {
  await wait(100)
  return [...contractsDb]
}

export async function listPayments(params: PaymentListParams): Promise<PaymentListItem[]> {
  await wait(220)
  const search = params.search?.trim().toLowerCase() ?? ''

  return invoicesDb
    .map(toListItem)
    .filter((item) => {
      const matchesSearch =
        search.length === 0 ||
        item.building_name.toLowerCase().includes(search) ||
        item.room_code.toLowerCase().includes(search) ||
        item.tenant_name.toLowerCase().includes(search)

      const matchesMonth = !params.month || dayjs(item.month).format('YYYY-MM') === params.month
      const matchesInvoiceStatus = !params.invoice_status || item.status === params.invoice_status
      const matchesPaymentStatus = !params.payment_status || item.payment_status === params.payment_status
      const matchesBuilding = !params.building_id || item.building_id === params.building_id
      const matchesRoom = !params.room_id || item.room_id === params.room_id
      const matchesTenant = !params.tenant_id || item.tenant_id === params.tenant_id

      return matchesSearch && matchesMonth && matchesInvoiceStatus && matchesPaymentStatus && matchesBuilding && matchesRoom && matchesTenant
    })
    .sort((a, b) => dayjs(b.month).valueOf() - dayjs(a.month).valueOf())
}

export async function getPayment(id: string): Promise<PaymentListItem> {
  await wait(160)
  const invoice = invoicesDb.find((item) => item.id === id)
  if (!invoice) {
    throw new Error('Invoice not found')
  }

  return toListItem(invoice)
}

function upsertUtilityReading(payload: PaymentUpsertPayload) {
  const normalizedMonth = ensureInvoiceMonth(payload.month)
  const existing = utilityReadingsDb.find((item) => item.room_id === payload.room_id && item.month === normalizedMonth)

  if (existing) {
    existing.electricity_prev = payload.electricity_prev
    existing.electricity_curr = payload.electricity_curr
    existing.water_prev = payload.water_prev
    existing.water_curr = payload.water_curr
    existing.note = payload.note
    return
  }

  utilityReadingsDb = [
    ...utilityReadingsDb,
    {
      id: crypto.randomUUID(),
      room_id: payload.room_id,
      month: normalizedMonth,
      electricity_prev: payload.electricity_prev,
      electricity_curr: payload.electricity_curr,
      water_prev: payload.water_prev,
      water_curr: payload.water_curr,
      note: payload.note,
    },
  ]
}

function computeAmounts(payload: PaymentUpsertPayload) {
  const electricUsage = Math.max(0, payload.electricity_curr - payload.electricity_prev)
  const waterUsage = Math.max(0, payload.water_curr - payload.water_prev)
  const electricAmount = electricUsage * payload.electric_unit_price
  const waterAmount = waterUsage * payload.water_unit_price
  const subtotal = payload.rent_amount + electricAmount + waterAmount + payload.other_fees
  const total = Math.max(0, subtotal - payload.discount)

  return { electricAmount, waterAmount, subtotal, total }
}

export async function createPayment(payload: PaymentUpsertPayload): Promise<PaymentListItem> {
  await wait(220)
  const month = ensureInvoiceMonth(payload.month)
  const now = new Date().toISOString()
  const amounts = computeAmounts(payload)

  const invoice: Invoice = {
    id: crypto.randomUUID(),
    contract_id: payload.contract_id,
    room_id: payload.room_id,
    month,
    status: payload.status,
    issued_at: payload.issued_at,
    due_date: payload.due_date,
    note: payload.note,
    subtotal: amounts.subtotal,
    discount: payload.discount,
    total: amounts.total,
    created_at: now,
    updated_at: now,
  }

  invoicesDb = [...invoicesDb, invoice]
  upsertUtilityReading(payload)
  upsertInvoiceItems(invoice, payload.rent_amount, amounts.electricAmount, amounts.waterAmount, payload.other_fees)
  return toListItem(invoice)
}

export async function updatePayment(id: string, payload: PaymentUpsertPayload): Promise<PaymentListItem> {
  await wait(220)
  const index = invoicesDb.findIndex((item) => item.id === id)
  if (index < 0) {
    throw new Error('Invoice not found')
  }

  const month = ensureInvoiceMonth(payload.month)
  const amounts = computeAmounts(payload)

  const updated: Invoice = {
    ...invoicesDb[index],
    contract_id: payload.contract_id,
    room_id: payload.room_id,
    month,
    status: payload.status,
    issued_at: payload.issued_at,
    due_date: payload.due_date,
    note: payload.note,
    subtotal: amounts.subtotal,
    discount: payload.discount,
    total: amounts.total,
    updated_at: new Date().toISOString(),
  }

  invoicesDb[index] = updated
  upsertUtilityReading(payload)
  upsertInvoiceItems(updated, payload.rent_amount, amounts.electricAmount, amounts.waterAmount, payload.other_fees)

  return toListItem(updated)
}

export async function deletePayment(id: string): Promise<void> {
  await wait(180)
  invoicesDb = invoicesDb.filter((item) => item.id !== id)
  invoiceItemsDb = invoiceItemsDb.filter((item) => item.invoice_id !== id)
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

export async function getEffectiveUtilityRate(roomId: string, month: string) {
  await wait(80)
  const room = getRoom(roomId)
  if (!room) {
    return { electricity_unit_price: 0, water_unit_price: 0 }
  }

  const rate = resolveRate(room.building_id, ensureInvoiceMonth(month))
  return {
    electricity_unit_price: rate?.electricity_unit_price ?? 0,
    water_unit_price: rate?.water_unit_price ?? 0,
  }
}
