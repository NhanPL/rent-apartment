import { ConfigProvider } from 'antd'
import enUS from 'antd/locale/en_US'
import viVN from 'antd/locale/vi_VN'
import dayjs from 'dayjs'
import 'dayjs/locale/en'
import 'dayjs/locale/vi'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import {
  detectInitialLanguage,
  LANGUAGE_STORAGE_KEY,
  setActiveLanguage,
  translateTemplate,
} from './i18n'
import type { AppLanguage } from './translations'
import { I18nContext, type I18nContextValue } from './i18n-context-value'
import { i18nInstance, loadLanguageResources } from './i18nextInstance'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(detectInitialLanguage)
  const [resourcesVersion, setResourcesVersion] = useState(0)
  setActiveLanguage(language)
  dayjs.locale(language)

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setActiveLanguage(nextLanguage)
    setLanguageState(nextLanguage)
  }, [])

  useEffect(() => {
    let active = true
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    document.documentElement.lang = language
    dayjs.locale(language)
    void loadLanguageResources(language).then(async () => {
      await i18nInstance.changeLanguage(language)
      if (active) setResourcesVersion((current) => current + 1)
    })

    return () => {
      active = false
    }
  }, [language])

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale: language === 'vi' ? 'vi-VN' : 'en-US',
      setLanguage,
      t: (source, parameters) => {
        void resourcesVersion
        return translateTemplate(source, parameters, language)
      },
    }),
    [language, resourcesVersion, setLanguage],
  )

  return (
    <I18nContext.Provider value={value}>
      <I18nextProvider i18n={i18nInstance}>
        <ConfigProvider
          locale={language === 'vi' ? viVN : enUS}
          theme={{
            token: {
              colorPrimary: '#0958d9',
              colorPrimaryHover: '#0647b5',
              colorPrimaryActive: '#003f91',
              colorLink: '#0958d9',
              colorLinkHover: '#0647b5',
              colorTextSecondary: '#4b5563',
              colorTextTertiary: '#5b6472',
            },
          }}
        >{children}</ConfigProvider>
      </I18nextProvider>
    </I18nContext.Provider>
  )
}
