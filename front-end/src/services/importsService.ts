import { apiRequest } from './apiClient'
import { API_ROUTES } from './apiRoutes'

export type ImportEntity = 'BUILDING' | 'ROOM' | 'TENANT'

export interface ImportRowError {
  row: number
  field: string
  code: string
  message: string
}

export interface ImportPreview {
  entity: ImportEntity
  valid: boolean
  total: number
  rows: Record<string, unknown>[]
  errors: ImportRowError[]
}

export interface ImportResult {
  entity: ImportEntity
  imported: number
  ids: string[]
  failed: Array<{ row: number; code: string; message: string }>
}

export const previewImport = (entity: ImportEntity, rows: Record<string, unknown>[]) => (
  apiRequest<ImportPreview>(API_ROUTES.imports.preview, { method: 'POST', body: { entity, rows } })
)

export const commitImport = (entity: ImportEntity, rows: Record<string, unknown>[]) => (
  apiRequest<ImportResult>(API_ROUTES.imports.commit, { method: 'POST', body: { entity, rows } })
)
