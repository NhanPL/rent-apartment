import { apiRequest } from './apiClient'
import { API_ROUTES } from './apiRoutes'

export type PaymentRequestStatus = 'DRAFT' | 'WAITING_TRANSFER' | 'TRANSFER_SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'
export type PaymentProofStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELLED'

export interface PaymentProof {
  id: string
  payment_request_id: string
  status: PaymentProofStatus
  file_name: string | null
  file_url: string
  mime_type: string | null
  file_size: number | null
  submitted_at: string
  transfer_amount: number
  transfer_time: string | null
  payer_note: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
}

export interface PaymentRecord {
  id: string
  invoice_id: string
  payment_request_id: string | null
  payment_proof_id: string | null
  status: PaymentStatus
  method: string
  amount: number
  paid_at: string | null
  note: string | null
}

export interface PaymentRequest {
  id: string
  invoice_id: string
  status: PaymentRequestStatus
  amount: number
  currency: string
  qr_content: string | null
  qr_image_url: string | null
  bank_code: string | null
  bank_account_no: string | null
  bank_account_name: string | null
  transfer_note: string | null
  expires_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
  month?: string
  invoice_status?: string
  invoice_total?: number
  due_date?: string | null
  paid_amount?: number
  remaining_amount?: number
  building_id?: string
  building_name?: string
  room_id?: string
  room_code?: string
  tenant_name?: string | null
  latest_proof_id?: string | null
  latest_proof_status?: PaymentProofStatus | null
  latest_proof_submitted_at?: string | null
  proofs?: PaymentProof[]
  payments?: PaymentRecord[]
  payment?: PaymentRecord | null
}

export interface PaymentRequestPayload {
  invoice_id: string
  amount?: number | null
  currency?: string
  bank_code?: string | null
  bank_account_no?: string | null
  bank_account_name?: string | null
  transfer_note?: string | null
  expires_at?: string | null
}

export interface PaymentProofPayload {
  file_name?: string | null
  file_url: string
  mime_type: string
  file_size: number
  transfer_amount?: number | null
  transfer_time?: string | null
  payer_note?: string | null
}

type NumericPaymentRequestFields = 'amount' | 'invoice_total' | 'paid_amount' | 'remaining_amount'
type PaymentRequestApiRow = Omit<PaymentRequest, NumericPaymentRequestFields | 'proofs' | 'payments' | 'payment'> &
  Record<NumericPaymentRequestFields, number | string | null> & {
    proofs?: PaymentProofApiRow[]
    payments?: PaymentRecordApiRow[]
    payment?: PaymentRecordApiRow | null
  }
type PaymentProofApiRow = Omit<PaymentProof, 'transfer_amount' | 'file_size'> & {
  transfer_amount: number | string | null
  file_size: number | string | null
}
type PaymentRecordApiRow = Omit<PaymentRecord, 'amount'> & { amount: number | string | null }

const toNumber = (value: unknown): number => Number(value ?? 0)

function toPaymentProof(row: PaymentProofApiRow): PaymentProof {
  return {
    ...row,
    file_size: row.file_size === null || row.file_size === undefined ? null : toNumber(row.file_size),
    transfer_amount: toNumber(row.transfer_amount),
  }
}

function toPaymentRecord(row: PaymentRecordApiRow): PaymentRecord {
  return {
    ...row,
    amount: toNumber(row.amount),
  }
}

function toPaymentRequest(row: PaymentRequestApiRow): PaymentRequest {
  return {
    ...row,
    amount: toNumber(row.amount),
    invoice_total: toNumber(row.invoice_total),
    paid_amount: toNumber(row.paid_amount),
    remaining_amount: toNumber(row.remaining_amount),
    proofs: row.proofs?.map(toPaymentProof) ?? [],
    payments: row.payments?.map(toPaymentRecord) ?? [],
    payment: row.payment ? toPaymentRecord(row.payment) : null,
  }
}

export async function listPaymentRequests(): Promise<PaymentRequest[]> {
  const rows = await apiRequest<PaymentRequestApiRow[]>(API_ROUTES.payments.requests)
  return rows.map(toPaymentRequest)
}

export async function getPaymentRequest(id: string): Promise<PaymentRequest> {
  const row = await apiRequest<PaymentRequestApiRow>(API_ROUTES.payments.requestDetail(id))
  return toPaymentRequest(row)
}

export async function getPaymentRequestByInvoice(invoiceId: string): Promise<PaymentRequest | null> {
  const row = await apiRequest<PaymentRequestApiRow | null>(API_ROUTES.payments.invoiceRequest(invoiceId))
  return row ? toPaymentRequest(row) : null
}

export async function createPaymentRequest(payload: PaymentRequestPayload): Promise<PaymentRequest> {
  const row = await apiRequest<PaymentRequestApiRow>(API_ROUTES.payments.requests, { method: 'POST', body: payload })
  return toPaymentRequest(row)
}

export async function cancelPaymentRequest(id: string): Promise<PaymentRequest> {
  const row = await apiRequest<PaymentRequestApiRow>(API_ROUTES.payments.cancelRequest(id), { method: 'POST' })
  return toPaymentRequest(row)
}

export async function expirePaymentRequest(id: string): Promise<PaymentRequest> {
  const row = await apiRequest<PaymentRequestApiRow>(API_ROUTES.payments.expireRequest(id), { method: 'POST' })
  return toPaymentRequest(row)
}

export function submitPaymentProof(id: string, payload: PaymentProofPayload): Promise<PaymentProof> {
  return apiRequest<PaymentProof>(API_ROUTES.payments.submitProof(id), { method: 'POST', body: payload })
}

export function approvePaymentProof(id: string) {
  return apiRequest(API_ROUTES.payments.approveProof(id), { method: 'POST' })
}

export function rejectPaymentProof(id: string, reason: string) {
  return apiRequest(API_ROUTES.payments.rejectProof(id), { method: 'POST', body: { reason } })
}
