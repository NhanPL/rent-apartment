export type NotificationTemplateCode =
  | 'PAYMENT_REMINDER'
  | 'UTILITY_READING_REJECTED'
  | 'INVOICE_ISSUED'
  | 'PAYMENT_PROOF_REJECTED'
  | 'PAYMENT_APPROVED'

export interface InAppNotification {
  id: string
  template_code: NotificationTemplateCode
  payload: Record<string, unknown>
  entity_type: string | null
  entity_id: string | null
  read_at: string | null
  created_at: string
}

export interface NotificationPage {
  items: InAppNotification[]
  total: number
  unreadCount: number
  page: number
  pageSize: number
}
