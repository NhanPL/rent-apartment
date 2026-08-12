import { useContext } from 'react'
import { FeatureFlagsContext } from './feature-flags-context-value'

export const useFeatureFlags = () => useContext(FeatureFlagsContext)
