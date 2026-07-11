import { API_ROUTES } from './apiRoutes'
import { apiRequest } from './apiClient'
import type {
  BuildingOption,
  ContractClosePayload,
  ContractCreatePayload,
  ContractDetail,
  ContractDocument,
  ContractDocumentPayload,
  ContractListItem,
  ContractListParams,
  ContractTenant,
  ContractTenantPayload,
  ContractUpdatePayload,
  PaginatedContractsResponse,
  RoomOption,
  TenantOption,
} from '../pages/contracts/types'

type NumericContractFields = 'rent_price' | 'deposit_amount' | 'billing_day' | 'active_tenants_count'
type NumericRoomFields = 'base_rent' | 'deposit_default' | 'max_occupants'

type ContractApiRow = Omit<ContractListItem, NumericContractFields> &
  Record<NumericContractFields, number | string | null>

type ContractApiDetail = ContractApiRow & {
  max_occupants: number | string | null
  tenants?: ContractTenant[]
  documents?: ContractDocument[]
}

type RoomApiRow = Omit<RoomOption, NumericRoomFields> & Record<NumericRoomFields, number | string | null>

interface TenantListResponse {
  items: TenantOption[]
  page: number
  pageSize: number
  total: number
}

interface ContractListResponse {
  items: ContractApiRow[]
  page: number
  pageSize: number
  total: number
}

const toNumber = (value: unknown, fallback = 0): number => {
  const numericValue = Number(value ?? fallback)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

const toContractListItem = (row: ContractApiRow): ContractListItem => ({
  ...row,
  rent_price: toNumber(row.rent_price),
  deposit_amount: toNumber(row.deposit_amount),
  billing_day: toNumber(row.billing_day, 1),
  active_tenants_count: toNumber(row.active_tenants_count),
  tenant_id: row.tenant_id ?? null,
  tenant_name: row.tenant_name ?? null,
  tenant_names: row.tenant_names ?? '',
})

const toContractDetail = (row: ContractApiDetail): ContractDetail => ({
  ...toContractListItem({
    ...row,
    active_tenants_count: row.tenants?.filter((tenant) => !tenant.left_at).length ?? row.active_tenants_count,
    tenant_id: row.tenant_id ?? row.tenants?.find((tenant) => !tenant.left_at && tenant.is_primary)?.tenant_id ?? null,
    tenant_name: row.tenant_name ?? row.tenants?.find((tenant) => !tenant.left_at && tenant.is_primary)?.full_name ?? null,
    tenant_names: row.tenant_names ?? row.tenants?.filter((tenant) => !tenant.left_at).map((tenant) => tenant.full_name).join(', ') ?? '',
  }),
  max_occupants: toNumber(row.max_occupants, 1),
  tenants: row.tenants ?? [],
  documents: row.documents?.map((document) => ({
    ...document,
    file_size: document.file_size === null || document.file_size === undefined ? null : toNumber(document.file_size),
  })) ?? [],
})

const toQueryString = (params: ContractListParams): string => {
  const searchParams = new URLSearchParams()
  if (params.search) searchParams.set('search', params.search)
  if (params.building_id) searchParams.set('building_id', params.building_id)
  if (params.room_id) searchParams.set('room_id', params.room_id)
  if (params.tenant_id) searchParams.set('tenant_id', params.tenant_id)
  if (params.status) searchParams.set('status', params.status)
  if (params.business_stage) searchParams.set('business_stage', params.business_stage)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))

  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

export async function listContracts(params: ContractListParams = {}): Promise<PaginatedContractsResponse> {
  const response = await apiRequest<ContractListResponse>(`${API_ROUTES.contracts.list}${toQueryString(params)}`)
  return {
    page: response.page,
    pageSize: response.pageSize,
    total: response.total,
    items: response.items.map(toContractListItem),
  }
}

export async function getContract(id: string): Promise<ContractDetail> {
  const response = await apiRequest<ContractApiDetail>(API_ROUTES.contracts.detail(id))
  return toContractDetail(response)
}

export function createContract(payload: ContractCreatePayload): Promise<ContractListItem> {
  return apiRequest<ContractListItem>(API_ROUTES.contracts.list, { method: 'POST', body: payload })
}

export function updateContract(id: string, payload: ContractUpdatePayload): Promise<ContractListItem> {
  return apiRequest<ContractListItem>(API_ROUTES.contracts.detail(id), { method: 'PATCH', body: payload })
}

export function activateContract(id: string): Promise<ContractListItem> {
  return apiRequest<ContractListItem>(`${API_ROUTES.contracts.detail(id)}/activate`, { method: 'POST' })
}

export function endContract(id: string, payload: ContractClosePayload): Promise<ContractListItem> {
  return apiRequest<ContractListItem>(`${API_ROUTES.contracts.detail(id)}/end`, { method: 'POST', body: payload })
}

export function cancelContract(id: string, payload: ContractClosePayload): Promise<ContractListItem> {
  return apiRequest<ContractListItem>(`${API_ROUTES.contracts.detail(id)}/cancel`, { method: 'POST', body: payload })
}

export function addContractTenant(id: string, payload: Required<Pick<ContractTenantPayload, 'tenant_id'>> & ContractTenantPayload): Promise<ContractTenant[]> {
  return apiRequest<ContractTenant[]>(`${API_ROUTES.contracts.detail(id)}/tenants`, { method: 'POST', body: payload })
}

export function updateContractTenant(id: string, tenantId: string, payload: Omit<ContractTenantPayload, 'tenant_id'>): Promise<ContractTenant[]> {
  return apiRequest<ContractTenant[]>(`${API_ROUTES.contracts.detail(id)}/tenants/${tenantId}`, { method: 'PATCH', body: payload })
}

export function removeContractTenant(id: string, tenantId: string, leftAt?: string): Promise<void> {
  const queryString = leftAt ? `?left_at=${encodeURIComponent(leftAt)}` : ''
  return apiRequest<void>(`${API_ROUTES.contracts.detail(id)}/tenants/${tenantId}${queryString}`, { method: 'DELETE' })
}

export function addContractDocument(id: string, payload: ContractDocumentPayload): Promise<ContractDocument> {
  return apiRequest<ContractDocument>(API_ROUTES.contracts.documents(id), { method: 'POST', body: payload })
}

export function deleteContractDocument(id: string, documentId: string): Promise<void> {
  return apiRequest<void>(API_ROUTES.contracts.documentDetail(id, documentId), { method: 'DELETE' })
}

export function listBuildings(): Promise<BuildingOption[]> {
  return apiRequest<BuildingOption[]>(API_ROUTES.buildings.list)
}

export async function listRooms(): Promise<RoomOption[]> {
  const rows = await apiRequest<RoomApiRow[]>(API_ROUTES.rooms.list)
  return rows.map((row) => ({
    id: row.id,
    building_id: row.building_id,
    code: row.code,
    base_rent: toNumber(row.base_rent),
    deposit_default: toNumber(row.deposit_default),
    max_occupants: toNumber(row.max_occupants, 1),
  }))
}

export async function listTenants(): Promise<TenantOption[]> {
  const firstPage = await apiRequest<TenantListResponse>(`${API_ROUTES.tenants.list}?page=1&pageSize=100`)
  const pages = [firstPage]

  for (let page = 2; (page - 1) * firstPage.pageSize < firstPage.total; page += 1) {
    pages.push(await apiRequest<TenantListResponse>(`${API_ROUTES.tenants.list}?page=${page}&pageSize=100`))
  }

  return pages.flatMap((response) => response.items.map((tenant) => ({
    id: tenant.id,
    full_name: tenant.full_name,
    phone: tenant.phone ?? null,
    email: tenant.email ?? null,
    identity_number: tenant.identity_number ?? null,
    status: tenant.status ?? null,
  })))
}
