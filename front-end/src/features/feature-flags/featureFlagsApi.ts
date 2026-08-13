import { apiRequest } from '../../services/apiClient'
import { API_ROUTES } from '../../services/apiRoutes'

export const FEATURE_KEYS = ['CSV_IMPORTS', 'BULK_BILLING_ACTIONS', 'LIVE_DASHBOARD', 'INVOICE_BRANDING'] as const
export type FeatureKey = typeof FEATURE_KEYS[number]
export type FeatureFlags = Record<FeatureKey, boolean>

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  CSV_IMPORTS: true,
  BULK_BILLING_ACTIONS: true,
  LIVE_DASHBOARD: true,
  INVOICE_BRANDING: true,
}

export const getFeatureFlags = (): Promise<FeatureFlags> => apiRequest(API_ROUTES.featureFlags)
export const updateFeatureFlag = (key: FeatureKey, enabled: boolean): Promise<FeatureFlags> =>
  apiRequest(API_ROUTES.featureFlags, { method: 'PATCH', body: { key, enabled } })
