import { API_ROUTES } from './apiRoutes'
import { apiRequest } from './apiClient'
import type {
  BuildingCharge,
  BuildingChargePayload,
  BuildingOption,
  ChargeCatalog,
  ChargeCatalogPayload,
  ContractChargeOverride,
  ContractChargeOverridePayload,
  ContractOption,
  ResolvedFixedCharge,
  ResolvedFixedChargePreview,
  RoomChargeOverride,
  RoomChargeOverridePayload,
  RoomMonthExtra,
  RoomMonthExtraPayload,
  RoomOption,
} from '../pages/fixed-charges/types'

type NumericChargeFields = 'unit_price'
type NumericExtraFields = 'persons_count' | 'vehicles_count'
type NumericResolvedFields = 'quantity' | 'unit_price' | 'amount' | 'persons_count' | 'vehicles_count'

type BuildingChargeApiRow = Omit<BuildingCharge, NumericChargeFields> & Record<NumericChargeFields, number | string | null>
type RoomChargeApiRow = Omit<RoomChargeOverride, NumericChargeFields> & Record<NumericChargeFields, number | string | null>
type ContractChargeApiRow = Omit<ContractChargeOverride, NumericChargeFields> & Record<NumericChargeFields, number | string | null>
type RoomMonthExtraApiRow = Omit<RoomMonthExtra, NumericExtraFields> & Record<NumericExtraFields, number | string | null>
type ResolvedChargeApiRow = Omit<ResolvedFixedCharge, NumericResolvedFields> & Record<NumericResolvedFields, number | string | null>

interface ContractListResponse {
  items: ContractOption[]
  page: number
  pageSize: number
  total: number
}

interface ResolvedPreviewApiRow extends Omit<ResolvedFixedChargePreview, 'items' | 'total'> {
  items: ResolvedChargeApiRow[]
  total: number | string | null
}

const toNumber = (value: unknown, fallback = 0): number => {
  const numericValue = Number(value ?? fallback)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

const toQuery = (params: Record<string, string | undefined>): string => {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, value)
  })
  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

const toBuildingCharge = (row: BuildingChargeApiRow): BuildingCharge => ({
  ...row,
  unit_price: toNumber(row.unit_price),
})

const toRoomCharge = (row: RoomChargeApiRow): RoomChargeOverride => ({
  ...row,
  unit_price: toNumber(row.unit_price),
})

const toContractCharge = (row: ContractChargeApiRow): ContractChargeOverride => ({
  ...row,
  unit_price: toNumber(row.unit_price),
})

const toRoomMonthExtra = (row: RoomMonthExtraApiRow): RoomMonthExtra => ({
  ...row,
  persons_count: toNullableNumber(row.persons_count),
  vehicles_count: toNullableNumber(row.vehicles_count),
})

const toResolvedCharge = (row: ResolvedChargeApiRow): ResolvedFixedCharge => ({
  ...row,
  quantity: toNumber(row.quantity),
  unit_price: toNumber(row.unit_price),
  amount: toNumber(row.amount),
  persons_count: toNumber(row.persons_count),
  vehicles_count: toNumber(row.vehicles_count),
})

export function listBuildings(): Promise<BuildingOption[]> {
  return apiRequest<BuildingOption[]>(API_ROUTES.buildings.list)
}

export function listRooms(buildingId?: string): Promise<RoomOption[]> {
  return apiRequest<RoomOption[]>(`${API_ROUTES.rooms.list}${toQuery({ building_id: buildingId })}`)
}

export async function listContracts(): Promise<ContractOption[]> {
  const firstResponse = await apiRequest<ContractListResponse | ContractOption[]>(`${API_ROUTES.contracts.list}?page=1&pageSize=100`)
  const rows = Array.isArray(firstResponse) ? [...firstResponse] : [...firstResponse.items]

  if (!Array.isArray(firstResponse)) {
    for (let page = 2; (page - 1) * firstResponse.pageSize < firstResponse.total; page += 1) {
      const response = await apiRequest<ContractListResponse>(`${API_ROUTES.contracts.list}?page=${page}&pageSize=100`)
      rows.push(...response.items)
    }
  }

  return rows
}

export function listChargeCatalog(activeOnly = false): Promise<ChargeCatalog[]> {
  return apiRequest<ChargeCatalog[]>(`${API_ROUTES.fixedCharges.catalog}${activeOnly ? '?is_active=true' : ''}`)
}

export function createChargeCatalog(payload: ChargeCatalogPayload): Promise<ChargeCatalog> {
  return apiRequest<ChargeCatalog>(API_ROUTES.fixedCharges.catalog, { method: 'POST', body: payload })
}

export function updateChargeCatalog(id: string, payload: ChargeCatalogPayload): Promise<ChargeCatalog> {
  return apiRequest<ChargeCatalog>(API_ROUTES.fixedCharges.catalogDetail(id), { method: 'PATCH', body: payload })
}

export function deleteChargeCatalog(id: string): Promise<void> {
  return apiRequest<void>(API_ROUTES.fixedCharges.catalogDetail(id), { method: 'DELETE' })
}

export async function listBuildingCharges(buildingId?: string): Promise<BuildingCharge[]> {
  const rows = await apiRequest<BuildingChargeApiRow[]>(`${API_ROUTES.fixedCharges.buildingCharges}${toQuery({ building_id: buildingId })}`)
  return rows.map(toBuildingCharge)
}

export async function createBuildingCharge(payload: BuildingChargePayload): Promise<BuildingCharge> {
  const row = await apiRequest<BuildingChargeApiRow>(API_ROUTES.fixedCharges.buildingCharges, { method: 'POST', body: payload })
  return toBuildingCharge(row)
}

export async function updateBuildingCharge(id: string, payload: BuildingChargePayload): Promise<BuildingCharge> {
  const row = await apiRequest<BuildingChargeApiRow>(API_ROUTES.fixedCharges.buildingChargeDetail(id), { method: 'PATCH', body: payload })
  return toBuildingCharge(row)
}

export function deleteBuildingCharge(id: string): Promise<void> {
  return apiRequest<void>(API_ROUTES.fixedCharges.buildingChargeDetail(id), { method: 'DELETE' })
}

export async function listRoomChargeOverrides(params: { buildingId?: string; roomId?: string } = {}): Promise<RoomChargeOverride[]> {
  const rows = await apiRequest<RoomChargeApiRow[]>(`${API_ROUTES.fixedCharges.roomOverrides}${toQuery({
    building_id: params.buildingId,
    room_id: params.roomId,
  })}`)
  return rows.map(toRoomCharge)
}

export async function createRoomChargeOverride(payload: RoomChargeOverridePayload): Promise<RoomChargeOverride> {
  const row = await apiRequest<RoomChargeApiRow>(API_ROUTES.fixedCharges.roomOverrides, { method: 'POST', body: payload })
  return toRoomCharge(row)
}

export async function updateRoomChargeOverride(id: string, payload: RoomChargeOverridePayload): Promise<RoomChargeOverride> {
  const row = await apiRequest<RoomChargeApiRow>(API_ROUTES.fixedCharges.roomOverrideDetail(id), { method: 'PATCH', body: payload })
  return toRoomCharge(row)
}

export function deleteRoomChargeOverride(id: string): Promise<void> {
  return apiRequest<void>(API_ROUTES.fixedCharges.roomOverrideDetail(id), { method: 'DELETE' })
}

export async function listContractChargeOverrides(params: { buildingId?: string; roomId?: string; contractId?: string } = {}): Promise<ContractChargeOverride[]> {
  const rows = await apiRequest<ContractChargeApiRow[]>(`${API_ROUTES.fixedCharges.contractOverrides}${toQuery({
    building_id: params.buildingId,
    room_id: params.roomId,
    contract_id: params.contractId,
  })}`)
  return rows.map(toContractCharge)
}

export async function createContractChargeOverride(payload: ContractChargeOverridePayload): Promise<ContractChargeOverride> {
  const row = await apiRequest<ContractChargeApiRow>(API_ROUTES.fixedCharges.contractOverrides, { method: 'POST', body: payload })
  return toContractCharge(row)
}

export async function updateContractChargeOverride(id: string, payload: ContractChargeOverridePayload): Promise<ContractChargeOverride> {
  const row = await apiRequest<ContractChargeApiRow>(API_ROUTES.fixedCharges.contractOverrideDetail(id), { method: 'PATCH', body: payload })
  return toContractCharge(row)
}

export function deleteContractChargeOverride(id: string): Promise<void> {
  return apiRequest<void>(API_ROUTES.fixedCharges.contractOverrideDetail(id), { method: 'DELETE' })
}

export async function listRoomMonthExtras(params: { buildingId?: string; roomId?: string; month?: string } = {}): Promise<RoomMonthExtra[]> {
  const rows = await apiRequest<RoomMonthExtraApiRow[]>(`${API_ROUTES.fixedCharges.roomMonthExtras}${toQuery({
    building_id: params.buildingId,
    room_id: params.roomId,
    month: params.month,
  })}`)
  return rows.map(toRoomMonthExtra)
}

export async function createRoomMonthExtra(payload: RoomMonthExtraPayload): Promise<RoomMonthExtra> {
  const row = await apiRequest<RoomMonthExtraApiRow>(API_ROUTES.fixedCharges.roomMonthExtras, { method: 'POST', body: payload })
  return toRoomMonthExtra(row)
}

export async function updateRoomMonthExtra(id: string, payload: RoomMonthExtraPayload): Promise<RoomMonthExtra> {
  const row = await apiRequest<RoomMonthExtraApiRow>(API_ROUTES.fixedCharges.roomMonthExtraDetail(id), { method: 'PATCH', body: payload })
  return toRoomMonthExtra(row)
}

export function deleteRoomMonthExtra(id: string): Promise<void> {
  return apiRequest<void>(API_ROUTES.fixedCharges.roomMonthExtraDetail(id), { method: 'DELETE' })
}

export async function resolveFixedCharges(contractId: string, month: string): Promise<ResolvedFixedChargePreview> {
  const row = await apiRequest<ResolvedPreviewApiRow>(`${API_ROUTES.fixedCharges.resolve}${toQuery({
    contract_id: contractId,
    month,
  })}`)
  return {
    ...row,
    items: row.items.map(toResolvedCharge),
    total: toNumber(row.total),
  }
}
