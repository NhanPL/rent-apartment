import { API_ROUTES } from './apiRoutes'
import { apiRequest } from './apiClient'
import type {
  BuildingOption,
  RoomOption,
  TenantCreateResult,
  TenantDetail,
  TenantErasureResult,
  TenantFormPayload,
  TenantIdentityDocumentUpdatePayload,
  TenantIdentityDocuments,
  TenantListItem,
  TenantListParams,
  AccountStatus,
} from '../pages/tenants/types'

interface PaginatedTenantsResponse {
  items: TenantListItem[]
  page: number
  pageSize: number
  total: number
}

export type TenantListResponse = PaginatedTenantsResponse

export function listTenants(params: TenantListParams): Promise<TenantListResponse> {
  const searchParams = new URLSearchParams()
  if (params.search) searchParams.set('search', params.search)
  if (params.status) searchParams.set('status', params.status)
  if (params.building_id) searchParams.set('building_id', params.building_id)
  if (params.room_id) searchParams.set('room_id', params.room_id)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))
  return apiRequest<TenantListResponse>(`${API_ROUTES.tenants.list}?${searchParams.toString()}`)
}

export function getTenant(id: string): Promise<TenantDetail> {
  return apiRequest<TenantDetail>(API_ROUTES.tenants.detail(id))
}

export function createTenant(payload: TenantFormPayload): Promise<TenantCreateResult> {
  return apiRequest<TenantCreateResult>(API_ROUTES.tenants.list, { method: 'POST', body: payload })
}

export function updateTenant(id: string, payload: TenantFormPayload): Promise<TenantListItem> {
  return apiRequest<TenantListItem>(API_ROUTES.tenants.detail(id), { method: 'PATCH', body: { tenant: payload.tenant } })
}

export function updateTenantIdentityDocuments(id: string, payload: TenantIdentityDocumentUpdatePayload): Promise<TenantIdentityDocuments> {
  return apiRequest<TenantIdentityDocuments>(API_ROUTES.tenants.identityDocuments(id), { method: 'PUT', body: payload })
}

export function deleteTenant(id: string): Promise<TenantErasureResult> {
  return apiRequest<TenantErasureResult>(API_ROUTES.tenants.detail(id), { method: 'DELETE' })
}

export function exportTenantData(id: string): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`${API_ROUTES.tenants.detail(id)}/data-export`)
}

export function resendTenantActivation(id: string): Promise<{
  message: string
  emailSent: boolean
  expiresAt: string
}> {
  return apiRequest(API_ROUTES.tenants.resendActivation(id), { method: 'POST' })
}

export function updateTenantAccountStatus(
  id: string,
  status: Extract<AccountStatus, 'ACTIVE' | 'DISABLED'>,
): Promise<{ accountStatus: Extract<AccountStatus, 'ACTIVE' | 'DISABLED'> }> {
  return apiRequest(API_ROUTES.tenants.accountStatus(id), { method: 'PATCH', body: { status } })
}

export function listTenantContracts(id: string) {
  return apiRequest<Array<Record<string, unknown>>>(`${API_ROUTES.tenants.detail(id)}/contracts`)
}
export function listTenantInvoices(id: string) {
  return apiRequest<Array<Record<string, unknown>>>(`${API_ROUTES.tenants.detail(id)}/invoices`)
}
export function listTenantPayments(id: string) {
  return apiRequest<Array<Record<string, unknown>>>(`${API_ROUTES.tenants.detail(id)}/payments`)
}

export function listBuildings(): Promise<BuildingOption[]> {
  return apiRequest<BuildingOption[]>(API_ROUTES.buildings.list)
}

export function listRooms(buildingId?: string): Promise<RoomOption[]> {
  const query = buildingId ? `?building_id=${encodeURIComponent(buildingId)}` : ''
  return apiRequest<RoomOption[]>(`${API_ROUTES.rooms.list}${query}`)
}
