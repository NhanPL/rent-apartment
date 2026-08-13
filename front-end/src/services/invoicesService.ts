import dayjs from 'dayjs'
import { API_ROUTES } from './apiRoutes'
import { apiRequest } from './apiClient'
import type {
  Building,
  Contract,
  InvoiceDetail,
  InvoiceGeneratePayload,
  InvoiceGenerationResult,
  InvoiceItem,
  InvoiceIssuePaymentPayload,
  InvoiceListItem,
  InvoiceListParams,
  InvoiceListResponse,
  InvoicePrefill,
  InvoiceSummary,
  InvoiceUpsertPayload,
  Room,
  Tenant,
} from '../pages/invoices/types'
import type { InvoiceBranding } from './invoiceBrandingService'
import { appendPaginationParams, type PaginatedResponse } from './pagination'

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
type InvoiceItemApiRow = Omit<InvoiceItem, 'quantity' | 'unit_price' | 'amount'> & {
  quantity: number | string | null
  unit_price: number | string | null
  amount: number | string | null
}
type InvoiceDetailApiRow = InvoiceApiRow & {
  branding?: InvoiceBranding | null
  items?: InvoiceItemApiRow[]
  adjustments?: InvoiceDetail['adjustments']
}

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

const toInvoiceItem = (row: InvoiceItemApiRow): InvoiceItem => ({
  ...row,
  quantity: toNumber(row.quantity),
  unit_price: toNumber(row.unit_price),
  amount: toNumber(row.amount),
})

const toInvoiceDetail = (row: InvoiceDetailApiRow): InvoiceDetail => ({
  ...toInvoiceListItem(row),
  branding: row.branding ?? null,
  items: row.items?.map(toInvoiceItem) ?? [],
  adjustments: row.adjustments ?? [],
})

const toInvoicePayload = (payload: InvoiceUpsertPayload) => ({
  ...payload,
  month: dayjs(payload.month).startOf('month').format('YYYY-MM-DD'),
})

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

export async function listInvoices(params: InvoiceListParams = {}): Promise<InvoiceListResponse> {
  const search = new URLSearchParams()
  if (params.search) search.set('search', params.search)
  if (params.month) search.set('month', params.month)
  if (params.invoice_status) search.set('invoice_status', params.invoice_status)
  if (params.payment_status) search.set('payment_status', params.payment_status)
  if (params.building_id) search.set('building_id', params.building_id)
  if (params.room_id) search.set('room_id', params.room_id)
  if (params.tenant_id) search.set('tenant_id', params.tenant_id)
  appendPaginationParams(search, params)
  const route = search.size ? `${API_ROUTES.invoices.list}?${search.toString()}` : API_ROUTES.invoices.list
  const response = await apiRequest<PaginatedResponse<InvoiceApiRow>>(route)
  return { ...response, items: response.items.map(toInvoiceListItem) }
}

export async function getInvoice(id: string): Promise<InvoiceDetail> {
  const row = await apiRequest<InvoiceDetailApiRow>(API_ROUTES.invoices.detail(id))
  return toInvoiceDetail(row)
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

export async function generateInvoices(payload: InvoiceGeneratePayload): Promise<InvoiceGenerationResult> {
  const route =
    payload.scope === 'room'
      ? API_ROUTES.invoices.generateRoom
      : payload.scope === 'building'
        ? API_ROUTES.invoices.generateBuilding
        : API_ROUTES.invoices.generateAll

  const body = {
    month: dayjs(payload.month).startOf('month').format('YYYY-MM-DD'),
    ...(payload.scope === 'room' ? { room_id: payload.room_id } : {}),
    ...(payload.scope === 'building' ? { building_id: payload.building_id } : {}),
  }
  const response = await apiRequest<{
    month: string
    generated: InvoiceApiRow[]
    skipped: InvoiceGenerationResult['skipped']
    total: number
  }>(route, { method: 'POST', body })

  return {
    ...response,
    generated: response.generated.map(toInvoiceListItem),
  }
}

export async function issueInvoice(id: string, payload?: InvoiceIssuePaymentPayload): Promise<InvoiceDetail> {
  const row = await apiRequest<InvoiceDetailApiRow>(API_ROUTES.invoices.issue(id), { method: 'POST', body: payload })
  return toInvoiceDetail(row)
}

export interface BulkActionResult {
  action: string
  succeeded: string[]
  failed: Array<{ id: string; code: string; message: string }>
  total: number
}

export function bulkIssueInvoices(invoiceIds: string[], payload: Omit<InvoiceIssuePaymentPayload, 'transfer_note'>): Promise<BulkActionResult> {
  return apiRequest<BulkActionResult>(API_ROUTES.invoices.bulkIssue, {
    method: 'POST',
    body: { invoice_ids: invoiceIds, ...payload },
  })
}

export async function addInvoiceAdjustment(id: string, amount: number, reason: string): Promise<InvoiceDetail> {
  const row = await apiRequest<InvoiceDetailApiRow>(API_ROUTES.invoices.adjustments(id), { method: 'POST', body: { amount, reason } })
  return toInvoiceDetail(row)
}

export async function voidInvoice(id: string, reason: string): Promise<InvoiceDetail> {
  const row = await apiRequest<InvoiceDetailApiRow>(API_ROUTES.invoices.void(id), { method: 'POST', body: { reason } })
  return toInvoiceDetail(row)
}

export async function createReplacementInvoice(id: string): Promise<InvoiceDetail> {
  const row = await apiRequest<InvoiceDetailApiRow>(API_ROUTES.invoices.replacement(id), { method: 'POST' })
  return toInvoiceDetail(row)
}

export async function getInvoicesSummary(month: string): Promise<InvoiceSummary> {
  const search = new URLSearchParams()
  if (month) search.set('month', month)
  const route = search.size ? `${API_ROUTES.invoices.summary}?${search.toString()}` : API_ROUTES.invoices.summary
  const response = await apiRequest<InvoiceSummary & { totalRevenue: number | string | null }>(route)
  return { ...response, totalRevenue: toNumber(response.totalRevenue) }
}

export async function getInvoicePrefill(roomId: string, month: string): Promise<InvoicePrefill> {
  const params = new URLSearchParams({ room_id: roomId, month: dayjs(month).startOf('month').format('YYYY-MM-DD') })
  const prefill = await apiRequest<InvoicePrefill>(`${API_ROUTES.invoices.prefill}?${params.toString()}`)

  return {
    ...prefill,
    rent_amount: toNumber(prefill.rent_amount),
    other_fees: toNumber(prefill.other_fees),
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
