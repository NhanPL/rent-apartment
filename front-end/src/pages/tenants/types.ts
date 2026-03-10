export type TenantStatus = 'ACTIVE' | 'MOVED_OUT' | 'BLACKLIST'

export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED'

export interface Tenant {
  id: string
  user_id: string | null
  full_name: string
  dob: string | null
  gender: string | null
  identity_number: string
  identity_issued_date: string | null
  identity_issued_place: string | null
  email: string | null
  phone: string
  permanent_address: string | null
  status: TenantStatus
  note: string | null
  created_at: string
  updated_at: string
}

export interface Contract {
  id: string
  room_id: string
  contract_code: string | null
  status: ContractStatus
  start_date: string
  end_date: string | null
  move_in_date: string | null
  move_out_date: string | null
  rent_price: number
  deposit_amount: number
  billing_day: number
  note: string | null
}

export interface TenantCurrentRoom {
  tenant_id: string
  room_id: string
  room_code: string
  building_id: string
  building_name: string
  contract_id: string
  start_date: string
}

export interface TenantListItem extends Tenant {
  current_room: TenantCurrentRoom | null
}

export interface TenantDetail extends TenantListItem {
  current_contract: Contract | null
}

export interface TenantListParams {
  search?: string
  status?: TenantStatus
  building_id?: string
  room_id?: string
}

export interface TenantUpsertPayload {
  full_name: string
  dob: string | null
  gender: string | null
  identity_number: string
  identity_issued_date: string | null
  identity_issued_place: string | null
  email: string | null
  phone: string
  permanent_address: string | null
  status: TenantStatus
  note: string | null
}

export interface ContractUpsertPayload {
  room_id: string | null
  contract_code: string | null
  status: ContractStatus
  start_date: string | null
  end_date: string | null
  move_in_date: string | null
  move_out_date: string | null
  rent_price: number | null
  deposit_amount: number | null
  billing_day: number | null
  note: string | null
}

export interface TenantFormPayload {
  tenant: TenantUpsertPayload
  contract: ContractUpsertPayload | null
}

export interface BuildingOption {
  id: string
  name: string
}

export interface RoomOption {
  id: string
  building_id: string
  code: string
}
