import { API_ROUTES } from './apiRoutes'
import { apiRequest } from './apiClient'
import type {
  BuildingOption,
  RoomOption,
  UtilityEvidence,
  UtilityEvidencePayload,
  UtilityRate,
  UtilityRatePayload,
  UtilityReadingDetail,
  UtilityReadingListItem,
  UtilityReadingListParams,
} from '../pages/utilities/types'

type NumericReadingFields = 'electricity_prev' | 'electricity_curr' | 'water_prev' | 'water_curr' | 'evidence_count'
type NumericRateFields = 'electricity_unit_price' | 'water_unit_price'

type UtilityReadingApiRow = Omit<UtilityReadingListItem, NumericReadingFields> &
  Record<NumericReadingFields, number | string | null>

type UtilityReadingApiDetail = UtilityReadingApiRow & {
  evidence?: UtilityEvidence[]
}

type UtilityRateApiRow = Omit<UtilityRate, NumericRateFields> & Record<NumericRateFields, number | string | null>

const toNumber = (value: unknown, fallback = 0): number => {
  const numericValue = Number(value ?? fallback)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

const toReading = (row: UtilityReadingApiRow): UtilityReadingListItem => ({
  ...row,
  electricity_prev: toNullableNumber(row.electricity_prev),
  electricity_curr: toNullableNumber(row.electricity_curr),
  water_prev: toNullableNumber(row.water_prev),
  water_curr: toNullableNumber(row.water_curr),
  evidence_count: toNumber(row.evidence_count),
  tenant_id: row.tenant_id ?? null,
  tenant_name: row.tenant_name ?? null,
})

const toReadingDetail = (row: UtilityReadingApiDetail): UtilityReadingDetail => ({
  ...toReading(row),
  evidence: row.evidence ?? [],
})

const toRate = (row: UtilityRateApiRow): UtilityRate => ({
  ...row,
  electricity_unit_price: toNumber(row.electricity_unit_price),
  water_unit_price: toNumber(row.water_unit_price),
})

const toReadingQuery = (params: UtilityReadingListParams): string => {
  const searchParams = new URLSearchParams()
  if (params.building_id) searchParams.set('building_id', params.building_id)
  if (params.room_id) searchParams.set('room_id', params.room_id)
  if (params.month) searchParams.set('month', `${params.month}-01`)
  if (params.status) searchParams.set('status', params.status)
  const queryString = searchParams.toString()
  return queryString ? `?${queryString}` : ''
}

export async function listUtilityReadings(params: UtilityReadingListParams = {}): Promise<UtilityReadingListItem[]> {
  const rows = await apiRequest<UtilityReadingApiRow[]>(`${API_ROUTES.utilityReadings.list}${toReadingQuery(params)}`)
  return rows.map(toReading)
}

export async function getUtilityReading(id: string): Promise<UtilityReadingDetail> {
  const row = await apiRequest<UtilityReadingApiDetail>(API_ROUTES.utilityReadings.detail(id))
  return toReadingDetail(row)
}

export async function approveUtilityReading(id: string): Promise<UtilityReadingDetail> {
  const row = await apiRequest<UtilityReadingApiDetail>(API_ROUTES.utilityReadings.approve(id), { method: 'POST' })
  return toReadingDetail(row)
}

export async function rejectUtilityReading(id: string, reason: string): Promise<UtilityReadingDetail> {
  const row = await apiRequest<UtilityReadingApiDetail>(API_ROUTES.utilityReadings.reject(id), {
    method: 'POST',
    body: { reason },
  })
  return toReadingDetail(row)
}

export async function requestUtilityReadingCorrection(id: string, reason: string): Promise<UtilityReadingDetail> {
  const row = await apiRequest<UtilityReadingApiDetail>(API_ROUTES.utilityReadings.requestCorrection(id), {
    method: 'POST',
    body: { reason },
  })
  return toReadingDetail(row)
}

export function attachUtilityReadingEvidence(id: string, payload: UtilityEvidencePayload): Promise<UtilityEvidence> {
  return apiRequest<UtilityEvidence>(API_ROUTES.utilityReadings.evidence(id), { method: 'POST', body: payload })
}

export async function listUtilityRates(buildingId?: string): Promise<UtilityRate[]> {
  const queryString = buildingId ? `?building_id=${encodeURIComponent(buildingId)}` : ''
  const rows = await apiRequest<UtilityRateApiRow[]>(`${API_ROUTES.utilityRates.list}${queryString}`)
  return rows.map(toRate)
}

export async function getUtilityRate(id: string): Promise<UtilityRate> {
  const row = await apiRequest<UtilityRateApiRow>(API_ROUTES.utilityRates.detail(id))
  return toRate(row)
}

export async function createUtilityRate(payload: UtilityRatePayload): Promise<UtilityRate> {
  const row = await apiRequest<UtilityRateApiRow>(API_ROUTES.utilityRates.list, { method: 'POST', body: payload })
  return toRate(row)
}

export async function updateUtilityRate(id: string, payload: UtilityRatePayload): Promise<UtilityRate> {
  const row = await apiRequest<UtilityRateApiRow>(API_ROUTES.utilityRates.detail(id), { method: 'PATCH', body: payload })
  return toRate(row)
}

export function deleteUtilityRate(id: string): Promise<void> {
  return apiRequest<void>(API_ROUTES.utilityRates.detail(id), { method: 'DELETE' })
}

export function listBuildings(): Promise<BuildingOption[]> {
  return apiRequest<BuildingOption[]>(API_ROUTES.buildings.list)
}

export function listRooms(buildingId?: string): Promise<RoomOption[]> {
  const queryString = buildingId ? `?building_id=${encodeURIComponent(buildingId)}` : ''
  return apiRequest<RoomOption[]>(`${API_ROUTES.rooms.list}${queryString}`)
}
