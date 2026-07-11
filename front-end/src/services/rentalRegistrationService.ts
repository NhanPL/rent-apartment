import { API_ROUTES } from './apiRoutes'
import { apiRequest } from './apiClient'
import type { ContractListItem } from '../pages/contracts/types'

export interface AvailableRoom {
  id: string
  building_id: string
  building_name: string
  code: string
  floor: number | null
  area_m2: number | null
  base_rent: number
  deposit_default: number
  max_occupants: number
}

export interface TenantDraftPayload {
  full_name: string
  phone: string
  identity_number: string
  email?: string | null
  dob?: string | null
  gender?: string | null
  identity_issued_date?: string | null
  identity_issued_place?: string | null
  permanent_address?: string | null
  note?: string | null
}

export interface ReservePayload {
  room_id: string
  tenant_id?: string
  tenant?: TenantDraftPayload
  start_date: string
  end_date?: string | null
  rent_price: number
  deposit_amount: number
  billing_day: number
  note?: string | null
}

export interface HandoverPayload {
  move_in_date: string
  electricity_curr: number
  water_curr: number
  persons_count: number
  vehicles_count: number
  note?: string | null
}

export interface CancelRegistrationPayload {
  reason: string
  cancel_date?: string
}

const toNumber = (value: unknown, fallback = 0): number => {
  const numericValue = Number(value ?? fallback)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

export async function listAvailableRooms(buildingId?: string): Promise<AvailableRoom[]> {
  const query = buildingId ? `?building_id=${encodeURIComponent(buildingId)}` : ''
  const rows = await apiRequest<Array<Omit<AvailableRoom, 'base_rent' | 'deposit_default' | 'max_occupants' | 'area_m2'> & {
    area_m2: number | string | null
    base_rent: number | string | null
    deposit_default: number | string | null
    max_occupants: number | string | null
  }>>(`${API_ROUTES.rentalRegistration.availableRooms}${query}`)

  return rows.map((room) => ({
    ...room,
    area_m2: room.area_m2 === null || room.area_m2 === undefined ? null : toNumber(room.area_m2),
    base_rent: toNumber(room.base_rent),
    deposit_default: toNumber(room.deposit_default),
    max_occupants: toNumber(room.max_occupants, 1),
  }))
}

export function reserveRoom(payload: ReservePayload): Promise<ContractListItem> {
  return apiRequest<ContractListItem>(API_ROUTES.rentalRegistration.reserve, { method: 'POST', body: payload })
}

export function handoverContract(contractId: string, payload: HandoverPayload): Promise<ContractListItem> {
  return apiRequest<ContractListItem>(API_ROUTES.rentalRegistration.handover(contractId), { method: 'POST', body: payload })
}

export function cancelRegistration(contractId: string, payload: CancelRegistrationPayload): Promise<ContractListItem> {
  return apiRequest<ContractListItem>(API_ROUTES.rentalRegistration.cancel(contractId), { method: 'POST', body: payload })
}
