import dayjs from 'dayjs'
import { apiRequest } from './apiClient'
import { API_ROUTES } from './apiRoutes'

export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
export type RoomStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE'
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'OVERDUE'
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELLED'
export type UtilityReadingStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'INVOICED'
export type UtilityEvidenceType = 'ELECTRIC' | 'WATER' | 'OTHER'

export interface Tenant {
  id: string
  user_id: string | null
  full_name: string
  gender: string | null
  phone: string
  status: 'ACTIVE' | 'MOVED_OUT' | 'BLACKLIST'
}

export interface Building {
  id: string
  manager_user_id: string
  code: string
  name: string
}

export interface Room {
  id: string
  building_id: string
  code: string
  floor: number | null
  area_m2: number | null
  status: RoomStatus
  base_rent: number
  max_occupants: number
  note: string | null
}

export interface Contract {
  id: string
  room_id: string
  status: ContractStatus
  start_date: string
  move_in_date: string | null
  rent_price: number
}

export interface UtilityReading {
  id: string
  room_id: string
  month: string
  electricity_prev: number | null
  electricity_curr: number | null
  water_prev: number | null
  water_curr: number | null
  status: UtilityReadingStatus
  reported_by_user_id: string | null
  reported_at: string | null
  submitted_at: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  evidence_count: number
  note: string | null
}

export interface TenantRoomContext {
  tenant: Tenant
  room: Room
  building: Building
  contract: Contract
}

export interface RoommateSummary {
  tenant_id: string
  full_name: string
  gender: string | null
  phone: string
  joined_at: string
  is_primary: boolean
}

export interface InvoiceSummary {
  id: string
  month: string
  status: InvoiceStatus
  payment_status: PaymentStatus | null
  due_date: string | null
  issued_at: string | null
  paid_at: string | null
  rent_amount: number
  electric_amount: number
  water_amount: number
  other_amount: number
  total: number
}

export interface UtilityReadingSnapshot {
  month: string
  current_reading: UtilityReading | null
  previous_reading: UtilityReading | null
  electricity_prev_value: number | null
  electricity_curr_value: number | null
  electricity_usage: number | null
  water_prev_value: number | null
  water_curr_value: number | null
  water_usage: number | null
}

export interface UtilityReadingSubmitPayload {
  month: string
  electricity_curr: number
  water_curr: number
  note: string | null
}

export interface UtilityEvidenceSubmitPayload {
  evidence_type: UtilityEvidenceType
  file_name: string | null
  file_url: string
  mime_type: string | null
  file_size: number | null
  note: string | null
}

interface TenantRoomRow {
  tenant_id: string
  tenant_name: string
  room_id: string
  room_code: string
  room_status: RoomStatus
  room_floor: number | null
  room_area_m2: number | null
  building_id: string
  building_name: string
  contract_id: string
  contract_status: ContractStatus
  start_date: string
  move_in_date: string | null
  rent_price: number
}

function toInvoiceSummary(row: Record<string, unknown>): InvoiceSummary {
  const invoice = row as {
    id: string
    month: string
    status: InvoiceStatus
    due_date: string | null
    issued_at: string | null
    total: number
    subtotal?: number
    payment_request_status?: PaymentStatus | null
  }

  return {
    id: invoice.id,
    month: invoice.month,
    status: invoice.status,
    payment_status: invoice.payment_request_status ?? null,
    due_date: invoice.due_date ?? null,
    issued_at: invoice.issued_at ?? null,
    paid_at: null,
    rent_amount: 0,
    electric_amount: 0,
    water_amount: 0,
    other_amount: 0,
    total: invoice.total ?? invoice.subtotal ?? 0,
  }
}

export async function getMyRoomContext(): Promise<TenantRoomContext | null> {
  const row = await apiRequest<TenantRoomRow | null>(API_ROUTES.me.room)
  if (!row) return null

  return {
    tenant: {
      id: row.tenant_id,
      user_id: null,
      full_name: row.tenant_name,
      gender: null,
      phone: '',
      status: 'ACTIVE',
    },
    room: {
      id: row.room_id,
      building_id: row.building_id,
      code: row.room_code,
      floor: row.room_floor,
      area_m2: row.room_area_m2,
      status: row.room_status,
      base_rent: row.rent_price,
      max_occupants: 1,
      note: null,
    },
    building: {
      id: row.building_id,
      manager_user_id: '',
      code: row.building_name,
      name: row.building_name,
    },
    contract: {
      id: row.contract_id,
      room_id: row.room_id,
      status: row.contract_status,
      start_date: row.start_date,
      move_in_date: row.move_in_date,
      rent_price: row.rent_price,
    },
  }
}

export async function getMyRoommates(): Promise<RoommateSummary[]> {
  const rows = await apiRequest<Array<{ id: string; full_name: string; gender: string | null; phone: string }>>(API_ROUTES.me.roommates)
  return rows.map((row) => ({
    tenant_id: row.id,
    full_name: row.full_name,
    gender: row.gender,
    phone: row.phone,
    joined_at: dayjs().format('YYYY-MM-DD'),
    is_primary: false,
  }))
}

export async function getCurrentMonthBill(): Promise<InvoiceSummary | null> {
  const row = await apiRequest<Record<string, unknown> | null>(API_ROUTES.me.currentBill)
  return row ? toInvoiceSummary(row) : null
}

export async function listMyRecentBills(): Promise<InvoiceSummary[]> {
  const rows = await apiRequest<Array<Record<string, unknown>>>(API_ROUTES.me.paymentStatus)
  return rows.map(toInvoiceSummary)
}

export async function getCurrentAndPreviousUtilityReadings(roomId: string, month: string): Promise<UtilityReadingSnapshot> {
  const rows = await apiRequest<UtilityReading[]>(API_ROUTES.utilityReadings.list)
  const ordered = [...rows].sort((left, right) => dayjs(right.month).valueOf() - dayjs(left.month).valueOf())
  const current = ordered.find((row) => row.room_id === roomId && row.month === month) ?? null
  const previous = ordered.find((row) => row.room_id === roomId && dayjs(row.month).isBefore(dayjs(month))) ?? null

  return {
    month,
    current_reading: current,
    previous_reading: previous,
    electricity_prev_value: current?.electricity_prev ?? previous?.electricity_curr ?? null,
    electricity_curr_value: current?.electricity_curr ?? null,
    electricity_usage:
      current?.electricity_prev !== null && current?.electricity_curr !== null
        ? Math.max(0, (current?.electricity_curr ?? 0) - (current?.electricity_prev ?? 0))
        : null,
    water_prev_value: current?.water_prev ?? previous?.water_curr ?? null,
    water_curr_value: current?.water_curr ?? null,
    water_usage: current?.water_prev !== null && current?.water_curr !== null ? Math.max(0, (current?.water_curr ?? 0) - (current?.water_prev ?? 0)) : null,
  }
}

export async function upsertMyUtilityReading(roomId: string, payload: UtilityReadingSubmitPayload): Promise<UtilityReading> {
  return apiRequest<UtilityReading>(API_ROUTES.utilityReadings.create, {
    method: 'POST',
    body: {
      room_id: roomId,
      month: payload.month,
      electricity_curr: payload.electricity_curr,
      water_curr: payload.water_curr,
      note: payload.note,
    },
  })
}

export async function attachMyUtilityReadingEvidence(readingId: string, payload: UtilityEvidenceSubmitPayload) {
  return apiRequest(API_ROUTES.utilityReadings.evidence(readingId), {
    method: 'POST',
    body: payload,
  })
}
