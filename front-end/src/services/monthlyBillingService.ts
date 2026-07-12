import dayjs from 'dayjs'
import { apiRequest } from './apiClient'
import { API_ROUTES } from './apiRoutes'
import { generateInvoices, issueInvoice } from './invoicesService'

export type MonthlyBillingAction = 'ENTER_READING' | 'REVIEW_READING' | 'CORRECT_READING' | 'GENERATE_INVOICE' | 'REVIEW_DRAFT' | 'WAITING_PAYMENT' | 'RECONCILE_PAYMENT' | 'PAID'

export interface MonthlyBillingItem {
  building_id: string
  building_name: string
  room_id: string
  room_code: string
  contract_id: string
  contract_code: string
  tenant_id: string | null
  primary_tenant: string | null
  reading_id: string | null
  reading_status: string | null
  invoice_id: string | null
  invoice_status: string | null
  invoice_total: number
  payment_request_id: string | null
  payment_request_status: string | null
  paid_amount: number
  outstanding_amount: number
  next_action: MonthlyBillingAction
}

export async function listMonthlyBilling(buildingId: string | undefined, month: string) {
  const params = new URLSearchParams({ month: dayjs(month).startOf('month').format('YYYY-MM-DD') })
  if (buildingId) params.set('building_id', buildingId)
  const result = await apiRequest<{ month: string; items: Array<Omit<MonthlyBillingItem, 'invoice_total' | 'paid_amount' | 'outstanding_amount'> & { invoice_total: number | string | null; paid_amount: number | string; outstanding_amount: number | string }> }>(`${API_ROUTES.monthlyBilling.summary}?${params}`)
  return {
    ...result,
    items: result.items.map((item) => ({ ...item, invoice_total: Number(item.invoice_total ?? 0), paid_amount: Number(item.paid_amount ?? 0), outstanding_amount: Number(item.outstanding_amount ?? 0) })),
  }
}

export const generateMonthlyInvoice = (roomId: string, month: string) => generateInvoices({ scope: 'room', room_id: roomId, month })
export const issueMonthlyInvoice = (invoiceId: string) => issueInvoice(invoiceId)
