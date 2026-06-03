import type { ContractStatus } from '../contracts/types'

export type ChargeType = 'FLAT' | 'PER_PERSON' | 'PER_VEHICLE'
export type FixedChargeSource = 'CONTRACT_OVERRIDE' | 'ROOM_OVERRIDE' | 'BUILDING_DEFAULT'

export interface BuildingOption {
  id: string
  name: string
}

export interface RoomOption {
  id: string
  building_id: string
  code: string
}

export interface ContractOption {
  id: string
  room_id: string
  room_code: string
  building_id: string
  building_name: string
  contract_code: string | null
  status: ContractStatus
  tenant_name: string | null
}

export interface ChargeCatalog {
  id: string
  code: string
  name: string
  charge_type: ChargeType
  is_active: boolean
  note: string | null
  created_at: string
  updated_at: string
}

export interface ChargeCatalogPayload {
  code: string
  name: string
  charge_type: ChargeType
  is_active?: boolean
  note?: string | null
}

export interface BuildingCharge {
  id: string
  building_id: string
  building_name: string
  charge_id: string
  charge_code: string
  charge_name: string
  charge_type: ChargeType
  unit_price: number
  effective_from: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BuildingChargePayload {
  building_id: string
  charge_id: string
  unit_price: number
  effective_from: string
  is_active?: boolean
}

export interface RoomChargeOverride {
  id: string
  room_id: string
  room_code: string
  building_id: string
  building_name: string
  charge_id: string
  charge_code: string
  charge_name: string
  charge_type: ChargeType
  unit_price: number
  effective_from: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RoomChargeOverridePayload {
  room_id: string
  charge_id: string
  unit_price: number
  effective_from: string
  is_active?: boolean
}

export interface ContractChargeOverride {
  id: string
  contract_id: string
  contract_code: string | null
  contract_status: ContractStatus
  tenant_name: string | null
  room_id: string
  room_code: string
  building_id: string
  building_name: string
  charge_id: string
  charge_code: string
  charge_name: string
  charge_type: ChargeType
  unit_price: number
  effective_from: string
  effective_to: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ContractChargeOverridePayload {
  contract_id: string
  charge_id: string
  unit_price: number
  effective_from: string
  effective_to?: string | null
  is_active?: boolean
}

export interface RoomMonthExtra {
  id: string
  room_id: string
  room_code: string
  building_id: string
  building_name: string
  month: string
  persons_count: number | null
  vehicles_count: number | null
  reported_by_user_id: string | null
  reported_at: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface RoomMonthExtraPayload {
  room_id: string
  month: string
  persons_count?: number | null
  vehicles_count?: number | null
  note?: string | null
}

export interface ResolvedFixedCharge {
  charge_id: string
  charge_code: string
  charge_name: string
  charge_type: ChargeType
  source: FixedChargeSource
  source_id: string
  effective_from: string
  quantity: number
  unit_price: number
  amount: number
  persons_count: number
  vehicles_count: number
  room_month_extra_id: string | null
}

export interface ResolvedFixedChargePreview {
  contract_id: string
  room_id: string
  room_code: string
  building_id: string
  building_name: string
  month: string
  items: ResolvedFixedCharge[]
  total: number
}
