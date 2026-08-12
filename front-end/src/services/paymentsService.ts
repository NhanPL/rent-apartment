import { apiRequest } from './apiClient'
import { API_ROUTES } from './apiRoutes'
import { appendPaginationParams, type PaginatedResponse, type PaginationParams } from './pagination'

export type PaymentRequestStatus = 'DRAFT' | 'WAITING_TRANSFER' | 'TRANSFER_SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'
export type PaymentProofStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELLED'
export type PaymentEntryType = 'PAYMENT' | 'REVERSAL'
export type LatestProofFilter = PaymentProofStatus | 'NONE'

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
  entry_type: PaymentEntryType
  original_payment_id: string | null
  reversal_payment_id: string | null
  method: string
  amount: number
  signed_amount: number
  paid_at: string | null
  note: string | null
  reversal_reason: string | null
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
  gross_payment_amount?: number
  reversal_amount?: number
  remaining_amount?: number
  building_id?: string
  building_name?: string
  room_id?: string
  room_code?: string
  tenant_name?: string | null
  tenant_id?: string | null
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

export type PaymentRequestSortBy = 'createdAt' | 'month' | 'amount' | 'status' | 'building' | 'room' | 'tenant' | 'latestProofSubmittedAt'

export interface PaymentRequestListFilters extends PaginationParams<PaymentRequestSortBy> {
  search?: string
  month?: string
  building_id?: string
  room_id?: string
  tenant_id?: string
  request_status?: PaymentRequestStatus
  latest_proof_status?: LatestProofFilter
}

export interface PaymentProofReviewResult {
  proof: PaymentProof
  payment: PaymentRecord
  paid_amount: number
  remaining_amount: number
  invoice_status: string
}

type NumericPaymentRequestFields = 'amount' | 'invoice_total' | 'paid_amount' | 'gross_payment_amount' | 'reversal_amount' | 'remaining_amount'
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
type PaymentRecordApiRow = Omit<PaymentRecord, 'amount' | 'signed_amount'> & {
  amount: number | string | null
  signed_amount: number | string | null
}

export interface PaymentBulkReviewResult {
  action: 'APPROVE' | 'REJECT'
  succeeded: string[]
  failed: Array<{ id: string; code: string; message: string }>
  total: number
}

const toNumber = (value: unknown): number => Number(value ?? 0)

function toPaymentProof(row: PaymentProofApiRow): PaymentProof {
  return {
    ...row,
    file_size: row.file_size === null || row.file_size === undefined ? null : toNumber(row.file_size),
    transfer_amount: toNumber(row.transfer_amount),
  }
}

function toPaymentRecord(row: PaymentRecordApiRow): PaymentRecord {
  const amount = toNumber(row.amount)
  const entryType = row.entry_type ?? 'PAYMENT'
  return {
    ...row,
    entry_type: entryType,
    original_payment_id: row.original_payment_id ?? null,
    reversal_payment_id: row.reversal_payment_id ?? null,
    reversal_reason: row.reversal_reason ?? null,
    amount,
    signed_amount: row.signed_amount === null || row.signed_amount === undefined
      ? (entryType === 'REVERSAL' ? -amount : amount)
      : toNumber(row.signed_amount),
  }
}

function toPaymentRequest(row: PaymentRequestApiRow): PaymentRequest {
  return {
    ...row,
    amount: toNumber(row.amount),
    invoice_total: toNumber(row.invoice_total),
    paid_amount: toNumber(row.paid_amount),
    gross_payment_amount: toNumber(row.gross_payment_amount),
    reversal_amount: toNumber(row.reversal_amount),
    remaining_amount: toNumber(row.remaining_amount),
    proofs: row.proofs?.map(toPaymentProof) ?? [],
    payments: row.payments?.map(toPaymentRecord) ?? [],
    payment: row.payment ? toPaymentRecord(row.payment) : null,
  }
}

export async function listPaymentRequests(filters: PaymentRequestListFilters = {}): Promise<PaginatedResponse<PaymentRequest>> {
  const search = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value && !['page', 'pageSize', 'sortBy', 'sortOrder'].includes(key)) search.set(key, String(value))
  })
  appendPaginationParams(search, filters)
  const queryString = search.toString()
  const route = queryString ? `${API_ROUTES.payments.requests}?${queryString}` : API_ROUTES.payments.requests
  const response = await apiRequest<PaginatedResponse<PaymentRequestApiRow>>(route)
  return { ...response, items: response.items.map(toPaymentRequest) }
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

export function approvePaymentProof(id: string): Promise<PaymentProofReviewResult> {
  return apiRequest<PaymentProofReviewResult>(API_ROUTES.payments.approveProof(id), { method: 'POST' })
}

export function rejectPaymentProof(id: string, reason: string) {
  return apiRequest(API_ROUTES.payments.rejectProof(id), { method: 'POST', body: { reason } })
}

export function bulkReviewPaymentProofs(
  proofIds: string[],
  action: 'APPROVE' | 'REJECT',
  reason?: string,
): Promise<PaymentBulkReviewResult> {
  return apiRequest<PaymentBulkReviewResult>(API_ROUTES.payments.bulkReviewProofs, {
    method: 'POST',
    body: { proof_ids: proofIds, action, reason },
  })
}

export function reversePayment(id: string, reason: string) {
  return apiRequest(API_ROUTES.payments.reversePayment(id), { method: 'POST', body: { reason } })
}
