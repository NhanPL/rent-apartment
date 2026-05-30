import dayjs from 'dayjs'
import { API_ROUTES } from './apiRoutes'
import { apiRequest } from './apiClient'
import type {
  Building,
  Contract,
  InvoiceListItem,
  InvoiceListParams,
  InvoicePrefill,
  InvoiceSummary,
  InvoiceUpsertPayload,
  Room,
  Tenant,
} from '../pages/invoices/types'

interface TenantListResponse {
  items: Array<Tenant & { current_room?: { contract_id: string | null } | null }>
  page: number
  pageSize: number
  total: number
}

interface ContractListResponse {
  items: Array<Contract & { rent_price: number | string; billing_day: number | string }>
  page: number
  pageSize: number
  total: number
}

type NumericInvoiceFields =
  | 'subtotal'
  | 'discount'
  | 'total'
  | 'rent_amount'
  | 'electric_unit_price'
  | 'water_unit_price'
  | 'electricity_prev'
  | 'electricity_curr'
  | 'water_prev'
  | 'water_curr'
  | 'electric_usage'
  | 'water_usage'
  | 'electric_amount'
  | 'water_amount'
  | 'other_fees'
  | 'paid_amount'

type InvoiceApiRow = Omit<InvoiceListItem, NumericInvoiceFields> & Record<NumericInvoiceFields, number | string | null>

const toNumber = (value: unknown): number => Number(value ?? 0)

const toInvoiceListItem = (row: InvoiceApiRow): InvoiceListItem => ({
  ...row,
  subtotal: toNumber(row.subtotal),
  discount: toNumber(row.discount),
  total: toNumber(row.total),
  rent_amount: toNumber(row.rent_amount),
  electric_unit_price: toNumber(row.electric_unit_price),
  water_unit_price: toNumber(row.water_unit_price),
  electricity_prev: toNumber(row.electricity_prev),
  electricity_curr: toNumber(row.electricity_curr),
  water_prev: toNumber(row.water_prev),
  water_curr: toNumber(row.water_curr),
  electric_usage: toNumber(row.electric_usage),
  water_usage: toNumber(row.water_usage),
  electric_amount: toNumber(row.electric_amount),
  water_amount: toNumber(row.water_amount),
  other_fees: toNumber(row.other_fees),
  paid_amount: toNumber(row.paid_amount),
})

const toInvoicePayload = (payload: InvoiceUpsertPayload) => ({
  ...payload,
  month: dayjs(payload.month).startOf('month').format('YYYY-MM-DD'),
})

function matchesInvoiceFilters(item: InvoiceListItem, params: InvoiceListParams) {
  const search = params.search?.trim().toLowerCase() ?? ''
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
}

export async function listBuildings(): Promise<Building[]> {
  const rows = await apiRequest<Array<Building & { units?: number }>>(API_ROUTES.buildings.list)
  return rows.map((row) => ({ id: row.id, name: row.name }))
}

export async function listRooms(): Promise<Room[]> {
  const rows = await apiRequest<Array<Room & { base_rent: number | string }>>(API_ROUTES.rooms.list)
  return rows.map((row) => ({
    id: row.id,
    building_id: row.building_id,
    code: row.code,
    base_rent: toNumber(row.base_rent),
  }))
}

export async function listTenants(): Promise<Tenant[]> {
  const firstPage = await apiRequest<TenantListResponse>(`${API_ROUTES.tenants.list}?page=1&pageSize=100`)
  const pages = [firstPage]

  for (let page = 2; (page - 1) * firstPage.pageSize < firstPage.total; page += 1) {
    pages.push(await apiRequest<TenantListResponse>(`${API_ROUTES.tenants.list}?page=${page}&pageSize=100`))
  }

  return pages.flatMap((response) => response.items.map((tenant) => ({ id: tenant.id, full_name: tenant.full_name })))
}

export async function listContracts(): Promise<Contract[]> {
  const firstResponse = await apiRequest<ContractListResponse | ContractListResponse['items']>(`${API_ROUTES.contracts.list}?page=1&pageSize=100`)
  const rows = Array.isArray(firstResponse) ? firstResponse : [...firstResponse.items]

  if (!Array.isArray(firstResponse)) {
    for (let page = 2; (page - 1) * firstResponse.pageSize < firstResponse.total; page += 1) {
      const response = await apiRequest<ContractListResponse>(`${API_ROUTES.contracts.list}?page=${page}&pageSize=100`)
      rows.push(...response.items)
    }
  }

  return rows.map((contract) => ({
    ...contract,
    rent_price: toNumber(contract.rent_price),
    billing_day: toNumber(contract.billing_day),
    tenant_id: contract.tenant_id ?? null,
    tenant_name: contract.tenant_name ?? null,
  }))
}

export async function listInvoices(params: InvoiceListParams): Promise<InvoiceListItem[]> {
  const rows = await apiRequest<InvoiceApiRow[]>(API_ROUTES.invoices.list)
  return rows
    .map(toInvoiceListItem)
    .filter((item) => matchesInvoiceFilters(item, params))
    .sort((left, right) => dayjs(right.month).valueOf() - dayjs(left.month).valueOf())
}

export async function getInvoice(id: string): Promise<InvoiceListItem> {
  const row = await apiRequest<InvoiceApiRow>(API_ROUTES.invoices.detail(id))
  return toInvoiceListItem(row)
}

export async function createInvoice(payload: InvoiceUpsertPayload): Promise<InvoiceListItem> {
  const row = await apiRequest<InvoiceApiRow>(API_ROUTES.invoices.list, {
    method: 'POST',
    body: toInvoicePayload(payload),
  })
  return toInvoiceListItem(row)
}

export async function updateInvoice(id: string, payload: InvoiceUpsertPayload): Promise<InvoiceListItem> {
  const row = await apiRequest<InvoiceApiRow>(API_ROUTES.invoices.detail(id), {
    method: 'PUT',
    body: toInvoicePayload(payload),
  })
  return toInvoiceListItem(row)
}

export function deleteInvoice(id: string): Promise<void> {
  return apiRequest<void>(API_ROUTES.invoices.detail(id), { method: 'DELETE' })
}

export async function getInvoicesSummary(month: string): Promise<InvoiceSummary> {
  const rows = await listInvoices({ month })
  return {
    totalInvoices: rows.length,
    paidInvoices: rows.filter((item) => item.status === 'PAID').length,
    unpaidInvoices: rows.filter((item) => item.status !== 'PAID' && item.status !== 'VOID').length,
    totalRevenue: rows.filter((item) => item.status === 'PAID').reduce((acc, item) => acc + item.total, 0),
  }
}

export async function getInvoicePrefill(roomId: string, month: string): Promise<InvoicePrefill> {
  const params = new URLSearchParams({ room_id: roomId, month: dayjs(month).startOf('month').format('YYYY-MM-DD') })
  const prefill = await apiRequest<InvoicePrefill>(`${API_ROUTES.invoices.prefill}?${params.toString()}`)

  return {
    ...prefill,
    rent_amount: toNumber(prefill.rent_amount),
    electricity_prev: toNumber(prefill.electricity_prev),
    water_prev: toNumber(prefill.water_prev),
    electric_unit_price: toNumber(prefill.electric_unit_price),
    water_unit_price: toNumber(prefill.water_unit_price),
  }
}

export async function getEffectiveUtilityRate(roomId: string, month: string) {
  const prefill = await getInvoicePrefill(roomId, month)
  return {
    electricity_unit_price: prefill.electric_unit_price,
    water_unit_price: prefill.water_unit_price,
  }
}
