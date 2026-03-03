export type RoomStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE'

export interface Room {
  id: string
  building_id: string
  code: string
  floor: number | null
  area_m2: number | null
  status: RoomStatus
  base_rent: number
  deposit_default: number
  max_occupants: number
  note: string | null
  created_at: string
  updated_at: string
}

export interface RoomUpsertPayload {
  building_id: string
  code: string
  floor: number | null
  area_m2: number | null
  status: RoomStatus
  base_rent: number
  deposit_default: number
  max_occupants: number
  note: string | null
}

export interface TenantSummary {
  id: string
  full_name: string
  email: string | null
  phone: string
  status: 'ACTIVE' | 'MOVED_OUT' | 'BLACKLIST'
  contract_start_date: string | null
}

export interface MonthlyBill {
  id: string
  room_id: string
  month: string
  electricity_prev: number | null
  electricity_curr: number | null
  water_prev: number | null
  water_curr: number | null
  total_bill_amount: number
  invoice_status: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'OVERDUE'
  note: string | null
}

export interface MonthlyBillUpsertPayload {
  room_id: string
  month: string
  electricity_prev: number | null
  electricity_curr: number | null
  water_prev: number | null
  water_curr: number | null
  total_bill_amount: number
  invoice_status: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'OVERDUE'
  note: string | null
}
