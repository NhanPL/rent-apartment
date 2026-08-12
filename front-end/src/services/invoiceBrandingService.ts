import { apiRequest } from './apiClient'
import { API_ROUTES } from './apiRoutes'

export interface InvoiceBranding {
  display_name: string
  business_address: string | null
  tax_code: string | null
  logo_url: string | null
  accent_color: string
  invoice_title: string
  default_note: string | null
}

export function getInvoiceBranding(): Promise<InvoiceBranding> {
  return apiRequest<InvoiceBranding>(API_ROUTES.invoiceBranding)
}

export function updateInvoiceBranding(payload: InvoiceBranding): Promise<InvoiceBranding> {
  return apiRequest<InvoiceBranding>(API_ROUTES.invoiceBranding, { method: 'PUT', body: payload })
}
