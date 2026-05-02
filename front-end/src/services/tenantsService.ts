import { API_ROUTES } from './apiRoutes'
import { apiRequest } from './apiClient'
import type {
  BuildingOption,
  RentalContractExportData,
  RoomOption,
  TenantDetail,
  TenantFormPayload,
  TenantListItem,
  TenantListParams,
} from '../pages/tenants/types'

interface PaginatedTenantsResponse {
  items: TenantListItem[]
  page: number
  pageSize: number
  total: number
}

export interface TenantListResponse extends PaginatedTenantsResponse {}

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

export function createTenant(payload: TenantFormPayload): Promise<TenantListItem> {
  return apiRequest<TenantListItem>(API_ROUTES.tenants.list, { method: 'POST', body: payload })
}

export function updateTenant(id: string, payload: TenantFormPayload): Promise<TenantListItem> {
  return apiRequest<TenantListItem>(API_ROUTES.tenants.detail(id), { method: 'PATCH', body: payload })
}

export function deleteTenant(id: string): Promise<void> {
  return apiRequest<void>(API_ROUTES.tenants.detail(id), { method: 'DELETE' })
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

export async function getTenantContractExportData(tenantId: string): Promise<RentalContractExportData> {
  const detail = await apiRequest<Record<string, unknown>>(`${API_ROUTES.tenants.detail(tenantId)}/export-contract`, {
    method: 'POST',
  })

  return {
    landlord: { full_name: 'Manager', phone: null, address: String(detail.address ?? '') },
    tenant: {
      full_name: String(detail.tenant_name ?? ''),
      phone: String(detail.phone ?? ''),
      email: (detail.email as string | null) ?? null,
      identity_number: String(detail.identity_number ?? ''),
      permanent_address: (detail.permanent_address as string | null) ?? null,
    },
    building: { name: String(detail.building_name ?? ''), address: String(detail.address ?? '') },
    room: {
      code: String(detail.room_code ?? ''),
      floor: detail.floor ? Number(detail.floor) : null,
      area_m2: detail.area_m2 ? Number(detail.area_m2) : null,
    },
    contract: {
      contract_code: (detail.contract_code as string | null) ?? null,
      start_date: String(detail.start_date ?? ''),
      end_date: (detail.end_date as string | null) ?? null,
      rent_price: Number(detail.rent_price ?? 0),
      deposit_amount: Number(detail.deposit_amount ?? 0),
      billing_day: Number(detail.billing_day ?? 1),
      note: (detail.contract_note as string | null) ?? null,
    },
  }
}

export function listBuildings(): Promise<BuildingOption[]> {
  return apiRequest<BuildingOption[]>(API_ROUTES.buildings.list)
}

export function listRooms(buildingId?: string): Promise<RoomOption[]> {
  const query = buildingId ? `?building_id=${encodeURIComponent(buildingId)}` : ''
  return apiRequest<RoomOption[]>(`${API_ROUTES.rooms.list}${query}`)
}
