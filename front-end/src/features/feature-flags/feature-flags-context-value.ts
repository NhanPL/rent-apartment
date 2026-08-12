import { createContext } from 'react'
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags, type FeatureKey } from './featureFlagsApi'

export interface FeatureFlagsContextValue {
  flags: FeatureFlags
  loading: boolean
  error: string | null
  isEnabled: (key: FeatureKey) => boolean
  refresh: () => Promise<void>
  setFlag: (key: FeatureKey, enabled: boolean) => Promise<void>
}

export const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  flags: DEFAULT_FEATURE_FLAGS,
  loading: false,
  error: null,
  isEnabled: () => true,
  refresh: async () => undefined,
  setFlag: async () => undefined,
})
