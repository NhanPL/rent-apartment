import { ConfigProvider } from 'antd'
import enUS from 'antd/locale/en_US'
import viVN from 'antd/locale/vi_VN'
import dayjs from 'dayjs'
import 'dayjs/locale/en'
import 'dayjs/locale/vi'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  detectInitialLanguage,
  LANGUAGE_STORAGE_KEY,
  setActiveLanguage,
  translateTemplate,
} from './i18n'
import type { AppLanguage } from './translations'
import { I18nContext, type I18nContextValue } from './i18n-context-value'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(detectInitialLanguage)
  setActiveLanguage(language)
  dayjs.locale(language)

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setActiveLanguage(nextLanguage)
    setLanguageState(nextLanguage)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    document.documentElement.lang = language
    dayjs.locale(language)
  }, [language])

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale: language === 'vi' ? 'vi-VN' : 'en-US',
      setLanguage,
      t: (source, parameters) => translateTemplate(source, parameters, language),
    }),
    [language, setLanguage],
  )

  return (
    <I18nContext.Provider value={value}>
      <ConfigProvider locale={language === 'vi' ? viVN : enUS}>{children}</ConfigProvider>
    </I18nContext.Provider>
  )
}
