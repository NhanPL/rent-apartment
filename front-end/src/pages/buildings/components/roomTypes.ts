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
  contract_id: string
  month: string
  electricity_prev: number
  electricity_curr: number
  water_prev: number
  water_curr: number
  electric_unit_price: number
  water_unit_price: number
  rent_amount: number
  other_fees: number
  discount: number
  electric_usage: number
  water_usage: number
  electric_amount: number
  water_amount: number
  total_bill_amount: number
  invoice_status: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'OVERDUE'
  issued_at: string | null
  due_date: string | null
  note: string | null
}

export interface MonthlyBillUpsertPayload {
  room_id: string
  contract_id: string
  month: string
  electricity_prev: number
  electricity_curr: number
  water_prev: number
  water_curr: number
  electric_unit_price: number
  water_unit_price: number
  rent_amount: number
  other_fees: number
  discount: number
  invoice_status: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'OVERDUE'
  issued_at: string | null
  due_date: string | null
  note: string | null
}
