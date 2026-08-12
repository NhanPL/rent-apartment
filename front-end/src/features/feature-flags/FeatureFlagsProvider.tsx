import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { getUserErrorMessage } from '../../services/errorMessage'
import {
  DEFAULT_FEATURE_FLAGS,
  getFeatureFlags,
  updateFeatureFlag,
  type FeatureFlags,
  type FeatureKey,
} from './featureFlagsApi'
import { FeatureFlagsContext } from './feature-flags-context-value'

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isAuthenticated || user?.role !== 'MANAGER') {
      setFlags(DEFAULT_FEATURE_FLAGS)
      setError(null)
      return
    }
    setLoading(true)
    try {
      setFlags(await getFeatureFlags())
      setError(null)
    } catch (requestError) {
      setError(getUserErrorMessage(requestError, 'Unable to load feature flags.'))
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, user?.role])

  useEffect(() => { void refresh() }, [refresh])

  const setFlag = useCallback(async (key: FeatureKey, enabled: boolean) => {
    setFlags(await updateFeatureFlag(key, enabled))
    setError(null)
  }, [])

  const value = useMemo(() => ({
    flags,
    loading,
    error,
    isEnabled: (key: FeatureKey) => flags[key],
    refresh,
    setFlag,
  }), [error, flags, loading, refresh, setFlag])

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>
}
