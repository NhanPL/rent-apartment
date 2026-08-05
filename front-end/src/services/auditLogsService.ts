import { apiRequest } from './apiClient'
import { API_ROUTES } from './apiRoutes'

export type AuditActorRole = 'MANAGER' | 'TENANT' | 'SYSTEM' | 'ANONYMOUS'

export interface AuditLogItem {
  id: string
  actor_user_id: string | null
  actor_role: AuditActorRole
  actor_name: string | null
  manager_user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  request_id: string | null
  client_ip_hash: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  before_snapshot: Record<string, unknown> | null
  after_snapshot: Record<string, unknown> | null
  created_at: string
}

export interface AuditLogFilters {
  page?: number
  pageSize?: number
  from?: string
  to?: string
  actorRole?: AuditActorRole
  action?: string
  entityType?: string
  entityId?: string
  requestId?: string
  search?: string
}

export interface AuditLogListResponse {
  items: AuditLogItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
}

export function listAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogListResponse> {
  const params = new URLSearchParams()
  if (filters.page) params.set('page', String(filters.page))
  if (filters.pageSize) params.set('page_size', String(filters.pageSize))
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.actorRole) params.set('actor_role', filters.actorRole)
  if (filters.action) params.set('action', filters.action)
  if (filters.entityType) params.set('entity_type', filters.entityType)
  if (filters.entityId) params.set('entity_id', filters.entityId)
  if (filters.requestId) params.set('request_id', filters.requestId)
  if (filters.search) params.set('search', filters.search)
  const query = params.toString()
  return apiRequest<AuditLogListResponse>(`${API_ROUTES.auditLogs.list}${query ? `?${query}` : ''}`)
}
