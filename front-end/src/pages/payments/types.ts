export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'OVERDUE'
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'VNPAY' | 'MOMO'
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELLED'

export interface Building {
  id: string
  name: string
}

export interface Room {
  id: string
  building_id: string
  code: string
  base_rent: number
}

export interface Tenant {
  id: string
  full_name: string
}

export interface Contract {
  id: string
  room_id: string
  status: ContractStatus
  rent_price: number
  billing_day: number
}

export interface ContractTenant {
  contract_id: string
  tenant_id: string
  is_primary: boolean
  left_at: string | null
}

export interface UtilityRate {
  id: string
  building_id: string
  effective_from: string
  electricity_unit_price: number
  water_unit_price: number
}

export interface UtilityReading {
  id: string
  room_id: string
  month: string
  electricity_prev: number | null
  electricity_curr: number | null
  water_prev: number | null
  water_curr: number | null
  note: string | null
}

export interface Invoice {
  id: string
  contract_id: string
  room_id: string
  month: string
  status: InvoiceStatus
  issued_at: string | null
  due_date: string | null
  note: string | null
  subtotal: number
  discount: number
  total: number
  created_at: string
  updated_at: string
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  code: string
  name: string
  quantity: number
  unit_price: number
  amount: number
}

export interface Payment {
  id: string
  invoice_id: string
  method: PaymentMethod
  status: PaymentStatus
  amount: number
  paid_at: string | null
}

export interface PaymentListParams {
  search?: string
  month?: string
  invoice_status?: InvoiceStatus
  payment_status?: PaymentStatus
  building_id?: string
  room_id?: string
  tenant_id?: string
}

export interface PaymentListItem extends Invoice {
  building_id: string
  building_name: string
  room_code: string
  tenant_id: string | null
  tenant_name: string
  rent_amount: number
  electric_unit_price: number
  water_unit_price: number
  electricity_prev: number | null
  electricity_curr: number | null
  water_prev: number | null
  water_curr: number | null
  electric_usage: number
  water_usage: number
  electric_amount: number
  water_amount: number
  other_fees: number
  paid_amount: number
  paid_at: string | null
  payment_status: PaymentStatus | null
}

export interface PaymentUpsertPayload {
  contract_id: string
  room_id: string
  month: string
  status: InvoiceStatus
  issued_at: string | null
  due_date: string | null
  note: string | null
  discount: number
  rent_amount: number
  other_fees: number
  electricity_prev: number
  electricity_curr: number
  water_prev: number
  water_curr: number
  electric_unit_price: number
  water_unit_price: number
}

export interface PaymentSummary {
  totalInvoices: number
  paidInvoices: number
  unpaidInvoices: number
  totalRevenue: number
}
