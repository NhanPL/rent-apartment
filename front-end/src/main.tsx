import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'antd/dist/reset.css'
import './index.css'
import App from './App'
import { AuthProvider } from './features/auth/AuthContext'
import { I18nProvider } from './i18n'
import { configureAntdFeedbackLocalization } from './i18n/antdFeedback'
import { QueryProvider } from './query/QueryProvider'
import { FeatureFlagsProvider } from './features/feature-flags/FeatureFlagsProvider'

configureAntdFeedbackLocalization()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <QueryProvider>
        <AuthProvider>
          <FeatureFlagsProvider><App /></FeatureFlagsProvider>
        </AuthProvider>
      </QueryProvider>
    </I18nProvider>
  </StrictMode>,
)
