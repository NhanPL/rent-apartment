import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'antd/dist/reset.css'
import './index.css'
import App from './App'
import { AuthProvider } from './features/auth/AuthContext'
import { I18nProvider } from './i18n'
import { configureAntdFeedbackLocalization } from './i18n/antdFeedback'

configureAntdFeedbackLocalization()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
)
