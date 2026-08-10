import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { AppLanguage } from './translations'

export const i18nInstance = i18next.createInstance()
const loadedLanguages = new Set<AppLanguage>()

void i18nInstance.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en', 'vi'],
  defaultNS: 'common',
  ns: ['common'],
  resources: { en: { common: {} }, vi: { common: {} } },
  interpolation: { escapeValue: false },
  returnNull: false,
  showSupportNotice: false,
})

export async function loadLanguageResources(language: AppLanguage) {
  if (loadedLanguages.has(language)) return
  const { translationCatalog } = await import('./translations')
  const resources = Object.fromEntries(translationCatalog.flatMap((entry) => (
    [entry.en, entry.vi, ...(entry.aliases ?? [])].map((key) => [key.trim().replace(/\s+/g, ' '), entry[language]])
  )))
  i18nInstance.addResourceBundle(language, 'common', resources, true, true)
  loadedLanguages.add(language)
}
