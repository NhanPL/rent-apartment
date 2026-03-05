export type TenantStatus = 'ACTIVE' | 'MOVED_OUT' | 'BLACKLIST'

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

export interface BuildingOption {
  id: string
  name: string
}

export interface RoomOption {
  id: string
  building_id: string
  code: string
}
