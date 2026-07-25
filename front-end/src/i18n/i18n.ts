import type { AppLanguage, TranslationEntry } from './translations'
import { translationCatalog } from './translations'

export const LANGUAGE_STORAGE_KEY = 'rent_apartment_language'
export const DEFAULT_LANGUAGE: AppLanguage = 'en'

let activeLanguage: AppLanguage = DEFAULT_LANGUAGE

const normalizeLookup = (value: string) => value.trim().replace(/\s+/g, ' ')

function createLookup(catalog: TranslationEntry[]) {
  const lookup = new Map<string, TranslationEntry>()

  for (const entry of catalog) {
    for (const source of [entry.en, entry.vi, ...(entry.aliases ?? [])]) {
      lookup.set(normalizeLookup(source), entry)
    }
  }

  return lookup
}

const translationLookup = createLookup(translationCatalog)

interface PatternTranslation {
  patterns: RegExp[]
  en: string
  vi: string
}

const patternTranslations: PatternTranslation[] = [
  { patterns: [/^Delete room (.+)\?$/], en: 'Delete room $1?', vi: 'Xóa phòng $1?' },
  { patterns: [/^View room (.+)$/], en: 'View room $1', vi: 'Xem phòng $1' },
  { patterns: [/^Create (.+)$/], en: 'Create $1', vi: 'Tạo $1' },
  { patterns: [/^Edit room (.+)$/], en: 'Edit room $1', vi: 'Chỉnh sửa phòng $1' },
  { patterns: [/^Delete room (.+)$/], en: 'Delete room $1', vi: 'Xóa phòng $1' },
  { patterns: [/^View invoice (.+)$/], en: 'View invoice $1', vi: 'Xem hóa đơn $1' },
  { patterns: [/^View (.+)$/], en: 'View $1', vi: 'Xem $1' },
  { patterns: [/^Edit (.+)$/], en: 'Edit $1', vi: 'Chỉnh sửa $1' },
  { patterns: [/^Delete (.+)$/], en: 'Delete $1', vi: 'Xóa $1' },
  { patterns: [/^Remove (.+)$/], en: 'Remove $1', vi: 'Xóa $1' },
  { patterns: [/^(.+) updated by admin$/], en: '$1 updated by admin', vi: '$1 được quản lý cập nhật' },
  { patterns: [/^(.+) synced with billing$/], en: '$1 synced with billing', vi: '$1 đã đồng bộ với hóa đơn' },
  { patterns: [/^(.+) was created$/], en: '$1 was created', vi: '$1 đã được tạo' },
  { patterns: [/^Generated (\d+) invoice\(s\)\.$/], en: 'Generated $1 invoice(s).', vi: 'Đã tạo $1 hóa đơn.' },
  { patterns: [/^Payment confirmed\. Remaining balance: (.+)\.$/], en: 'Payment confirmed. Remaining balance: $1.', vi: 'Đã xác nhận thanh toán. Số dư còn lại: $1.' },
  { patterns: [/^Generated (\d+)\/(\d+); skipped (\d+)\.$/], en: 'Generated $1/$2; skipped $3.', vi: 'Đã tạo $1/$2; bỏ qua $3.' },
  { patterns: [/^Added (\d+) and removed (\d+) document\(s\)\.$/], en: 'Added $1 and removed $2 document(s).', vi: 'Đã thêm $1 và xóa $2 giấy tờ.' },
  { patterns: [/^Completed (\d+) change\(s\)\. The remaining changes failed: (.+)$/], en: 'Completed $1 change(s). The remaining changes failed: $2', vi: 'Đã hoàn tất $1 thay đổi. Các thay đổi còn lại thất bại: $2' },
  { patterns: [/^Room reserved for (.+)$/], en: 'Room reserved for $1', vi: 'Đã giữ phòng cho $1' },
  { patterns: [/^Room (.+) - (.+)$/], en: 'Room $1 - $2', vi: 'Phòng $1 - $2' },
  { patterns: [/^Suggested rent (.+), deposit (.+), capacity (.+)\.$/], en: 'Suggested rent $1, deposit $2, capacity $3.', vi: 'Giá thuê đề xuất $1, tiền cọc $2, sức chứa $3.' },
  { patterns: [/^Add documents \((\d+)\)$/], en: 'Add documents ($1)', vi: 'Bổ sung giấy tờ ($1)' },
  { patterns: [/^Room handover \((\d+)\)$/], en: 'Room handover ($1)', vi: 'Bàn giao phòng ($1)' },
  { patterns: [/^Add documents - (.*)$/], en: 'Add documents - $1', vi: 'Bổ sung giấy tờ - $1' },
  { patterns: [/^Room handover - (.*)$/], en: 'Room handover - $1', vi: 'Bàn giao phòng - $1' },
  { patterns: [/^Cancel registration - (.*)$/], en: 'Cancel registration - $1', vi: 'Hủy đăng ký - $1' },
  { patterns: [/^Generated invoice for (.+)$/], en: 'Generated invoice for $1', vi: 'Đã tạo hóa đơn tháng $1' },
  { patterns: [/^Invoice was not generated: (.+)$/], en: 'Invoice was not generated: $1', vi: 'Không thể tạo hóa đơn: $1' },
  { patterns: [/^Payment request created for (.+)$/], en: 'Payment request created for $1', vi: 'Đã tạo yêu cầu thanh toán tháng $1' },
  { patterns: [/^VietQR payment for invoice (.+)$/], en: 'VietQR payment for invoice $1', vi: 'Thanh toán VietQR cho hóa đơn $1' },
  { patterns: [/^Gender: (.+) • Phone: (.+) • Move-in date: (.+)$/, /^Giới tính: (.+) • SĐT: (.+) • Ngày vào ở: (.+)$/], en: 'Gender: $1 • Phone: $2 • Move-in date: $3', vi: 'Giới tính: $1 • SĐT: $2 • Ngày vào ở: $3' },
  { patterns: [/^Electricity \((.+)\)$/, /^Điện \((.+)\)$/], en: 'Electricity ($1)', vi: 'Điện ($1)' },
  { patterns: [/^Water \((.+)\)$/, /^Nước \((.+)\)$/], en: 'Water ($1)', vi: 'Nước ($1)' },
  { patterns: [/^Last submitted: (.+)$/, /^Lần gửi gần nhất: (.+)$/], en: 'Last submitted: $1', vi: 'Lần gửi gần nhất: $1' },
  { patterns: [/^Readings \((\d+)\)$/], en: 'Readings ($1)', vi: 'Chỉ số ($1)' },
]

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return value === 'en' || value === 'vi'
}

export function detectInitialLanguage(): AppLanguage {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE

  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (isAppLanguage(storedLanguage)) return storedLanguage

  return window.navigator.language.toLowerCase().startsWith('vi') ? 'vi' : DEFAULT_LANGUAGE
}

export function setActiveLanguage(language: AppLanguage) {
  activeLanguage = language
}

export function getActiveLanguage() {
  return activeLanguage
}

export function translate(value: string, language = activeLanguage): string {
  if (!value.trim()) return value

  const leadingWhitespace = value.match(/^\s*/)?.[0] ?? ''
  const trailingWhitespace = value.match(/\s*$/)?.[0] ?? ''
  const entry = translationLookup.get(normalizeLookup(value))
  if (!entry) {
    const normalizedValue = normalizeLookup(value)
    for (const patternTranslation of patternTranslations) {
      for (const pattern of patternTranslation.patterns) {
        if (pattern.test(normalizedValue)) {
          return normalizedValue.replace(pattern, (...matches: string[]) =>
            patternTranslation[language].replace(/\$(\d+)/g, (placeholder, index: string) => {
              const capturedValue = matches[Number(index)]
              return capturedValue === undefined ? placeholder : translate(capturedValue, language)
            }),
          )
        }
      }
    }
    return value
  }

  return `${leadingWhitespace}${entry[language]}${trailingWhitespace}`
}

export function translateTemplate(
  value: string,
  parameters: Record<string, string | number> = {},
  language = activeLanguage,
) {
  const translated = translate(value, language)
  return translated.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(parameters, key) ? String(parameters[key]) : match,
  )
}

export function hasTranslation(value: string) {
  return translationLookup.has(normalizeLookup(value))
}
