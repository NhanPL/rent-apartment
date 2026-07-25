import { createContext } from 'react'
import { translateTemplate } from './i18n'
import type { AppLanguage } from './translations'

export interface I18nContextValue {
  language: AppLanguage
  locale: string
  setLanguage: (language: AppLanguage) => void
  t: (value: string, parameters?: Record<string, string | number>) => string
}

export const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  locale: 'en-US',
  setLanguage: () => undefined,
  t: (value, parameters) => translateTemplate(value, parameters, 'en'),
})
