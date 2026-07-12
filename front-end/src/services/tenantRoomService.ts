import dayjs from 'dayjs'
import { apiRequest } from './apiClient'
import { API_ROUTES } from './apiRoutes'
import {
  createVnpayPayment,
  getPaymentRequest,
  submitPaymentProof,
  type PaymentProofPayload,
  type PaymentRecord,
  type PaymentRequest,
  type PaymentRequestStatus,
  type VnpayCreatePaymentResponse,
} from './paymentsService'

export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
export type RoomStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE'
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'OVERDUE'
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELLED'
export type UtilityReadingStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'INVOICED'
export type UtilityEvidenceType = 'ELECTRIC' | 'WATER' | 'OTHER'
export type TenantDocumentType = 'IDENTITY_FRONT' | 'IDENTITY_BACK' | 'RESIDENCE' | 'OTHER'

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
  payment_request_id: string | null
  payment_request_status: PaymentRequestStatus | null
  due_date: string | null
  issued_at: string | null
  paid_at: string | null
  paid_amount: number
  rent_amount: number
  electric_amount: number
  water_amount: number
  other_amount: number
  total: number
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  code: string
  name: string
  quantity: number
  unit_price: number
  amount: number
  meta?: Record<string, unknown> | null
}

export interface InvoiceDetail extends InvoiceSummary {
  subtotal: number
  discount: number
  note: string | null
  items: InvoiceItem[]
  payments: PaymentRecord[]
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
  mime_type: string
  file_size: number
  note: string | null
}

export interface TenantDocument {
  id: string
  tenant_id: string
  doc_type: TenantDocumentType
  file_name: string | null
  file_url: string
  mime_type: string
  file_size: number
  uploaded_by_user_id: string | null
  uploaded_at: string
  note: string | null
  created_at: string
}

export interface TenantDocumentPayload {
  doc_type: TenantDocumentType
  file_name?: string | null
  file_url: string
  mime_type: string
  file_size: number
  note?: string | null
}

interface TenantRoomRow {
  tenant_id: string
  tenant_user_id: string | null
  tenant_name: string
  tenant_gender: string | null
  tenant_phone: string
  tenant_status: Tenant['status']
  room_id: string
  room_code: string
  room_status: RoomStatus
  room_floor: number | null
  room_area_m2: number | null
  room_note: string | null
  base_rent: number | string
  max_occupants: number | string
  building_id: string
  building_code: string
  building_name: string
  manager_user_id: string
  contract_id: string
  contract_status: ContractStatus
  start_date: string
  move_in_date: string | null
  rent_price: number
}

type TenantDocumentApiRow = Omit<TenantDocument, 'file_size'> & {
  file_size: number | string
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
    payment_request_id?: string | null
    payment_request_status?: PaymentRequestStatus | null
    payment_status?: PaymentStatus | null
    paid_at?: string | null
    paid_amount?: number | string | null
    rent_amount?: number | string | null
    electric_amount?: number | string | null
    water_amount?: number | string | null
    other_amount?: number | string | null
  }

  return {
    id: invoice.id,
    month: invoice.month,
    status: invoice.status,
    payment_status: invoice.payment_status ?? null,
    payment_request_id: invoice.payment_request_id ?? null,
    payment_request_status: invoice.payment_request_status ?? null,
    due_date: invoice.due_date ?? null,
    issued_at: invoice.issued_at ?? null,
    paid_at: invoice.paid_at ?? null,
    paid_amount: Number(invoice.paid_amount ?? 0),
    rent_amount: Number(invoice.rent_amount ?? 0),
    electric_amount: Number(invoice.electric_amount ?? 0),
    water_amount: Number(invoice.water_amount ?? 0),
    other_amount: Number(invoice.other_amount ?? 0),
    total: Number(invoice.total ?? invoice.subtotal ?? 0),
  }
}

function toInvoiceItem(row: Record<string, unknown>): InvoiceItem {
  const item = row as unknown as InvoiceItem & {
    quantity?: number | string | null
    unit_price?: number | string | null
    amount?: number | string | null
  }

  return {
    ...item,
    quantity: Number(item.quantity ?? 0),
    unit_price: Number(item.unit_price ?? 0),
    amount: Number(item.amount ?? 0),
  }
}

function toPaymentRecord(row: Record<string, unknown>): PaymentRecord {
  const payment = row as unknown as PaymentRecord & { amount?: number | string | null }
  return {
    ...payment,
    amount: Number(payment.amount ?? 0),
  }
}

function toInvoiceDetail(row: Record<string, unknown>): InvoiceDetail {
  const invoice = row as Record<string, unknown> & {
    subtotal?: number | string | null
    discount?: number | string | null
    note?: string | null
    items?: Record<string, unknown>[]
    payments?: Record<string, unknown>[]
  }

  return {
    ...toInvoiceSummary(row),
    subtotal: Number(invoice.subtotal ?? 0),
    discount: Number(invoice.discount ?? 0),
    note: invoice.note ?? null,
    items: invoice.items?.map(toInvoiceItem) ?? [],
    payments: invoice.payments?.map(toPaymentRecord) ?? [],
  }
}

export async function getMyRoomContext(): Promise<TenantRoomContext | null> {
  const row = await apiRequest<TenantRoomRow | null>(API_ROUTES.me.room)
  if (!row) return null

  return {
    tenant: {
      id: row.tenant_id,
      user_id: row.tenant_user_id,
      full_name: row.tenant_name,
      gender: row.tenant_gender,
      phone: row.tenant_phone,
      status: row.tenant_status,
    },
    room: {
      id: row.room_id,
      building_id: row.building_id,
      code: row.room_code,
      floor: row.room_floor,
      area_m2: row.room_area_m2,
      status: row.room_status,
      base_rent: Number(row.base_rent),
      max_occupants: Number(row.max_occupants),
      note: row.room_note,
    },
    building: {
      id: row.building_id,
      manager_user_id: row.manager_user_id,
      code: row.building_code,
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
  const rows = await apiRequest<RoommateSummary[]>(API_ROUTES.me.roommates)
  return rows.map((row) => ({
    tenant_id: row.tenant_id,
    full_name: row.full_name,
    gender: row.gender,
    phone: row.phone,
    joined_at: row.joined_at,
    is_primary: row.is_primary,
  }))
}

export function listMyDocuments(): Promise<TenantDocument[]> {
  return apiRequest<TenantDocumentApiRow[]>(API_ROUTES.me.documents).then((rows) => rows.map((row) => ({
    ...row,
    file_size: Number(row.file_size ?? 0),
  })))
}

export function createMyDocument(payload: TenantDocumentPayload): Promise<TenantDocument> {
  return apiRequest<TenantDocumentApiRow>(API_ROUTES.me.documents, { method: 'POST', body: payload }).then((row) => ({
    ...row,
    file_size: Number(row.file_size ?? 0),
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

export async function getMyInvoiceDetail(invoiceId: string): Promise<InvoiceDetail> {
  const row = await apiRequest<Record<string, unknown>>(API_ROUTES.me.invoiceDetail(invoiceId))
  return toInvoiceDetail(row)
}

export async function getCurrentAndPreviousUtilityReadings(roomId: string, month: string): Promise<UtilityReadingSnapshot> {
  const rows = await apiRequest<Array<Omit<UtilityReading, 'electricity_prev' | 'electricity_curr' | 'water_prev' | 'water_curr' | 'evidence_count'> & {
    electricity_prev: number | string | null
    electricity_curr: number | string | null
    water_prev: number | string | null
    water_curr: number | string | null
    evidence_count: number | string | null
  }>>(API_ROUTES.utilityReadings.list)
  const normalizedRows: UtilityReading[] = rows.map((row) => ({
    ...row,
    electricity_prev: row.electricity_prev === null ? null : Number(row.electricity_prev),
    electricity_curr: row.electricity_curr === null ? null : Number(row.electricity_curr),
    water_prev: row.water_prev === null ? null : Number(row.water_prev),
    water_curr: row.water_curr === null ? null : Number(row.water_curr),
    evidence_count: Number(row.evidence_count ?? 0),
  }))
  const selectedMonth = dayjs(month)
  const ordered = [...normalizedRows].sort((left, right) => dayjs(right.month).valueOf() - dayjs(left.month).valueOf())
  const current = ordered.find((row) => row.room_id === roomId && dayjs(row.month).isSame(selectedMonth, 'month')) ?? null
  const previous = ordered.find((row) => row.room_id === roomId && dayjs(row.month).isBefore(selectedMonth, 'month')) ?? null

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

export function getMyPaymentRequest(paymentRequestId: string): Promise<PaymentRequest> {
  return getPaymentRequest(paymentRequestId)
}

export function submitMyPaymentProof(paymentRequestId: string, payload: PaymentProofPayload) {
  return submitPaymentProof(paymentRequestId, payload)
}

export function createMyVnpayPayment(invoiceId: string): Promise<VnpayCreatePaymentResponse> {
  return createVnpayPayment({ invoice_id: invoiceId })
}
