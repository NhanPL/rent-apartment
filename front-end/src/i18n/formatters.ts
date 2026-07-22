import { getActiveLanguage } from './i18n'

const currencyFormatters = {
  en: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }),
  vi: new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }),
}

const shortMonthFormatters = {
  en: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }),
  vi: new Intl.DateTimeFormat('vi-VN', { month: 'short', timeZone: 'UTC' }),
}

export const vndCurrency = {
  format(value: number | bigint) {
    return currencyFormatters[getActiveLanguage()].format(value)
  },
}

export function formatShortMonth(value: Date) {
  return shortMonthFormatters[getActiveLanguage()].format(value)
}
