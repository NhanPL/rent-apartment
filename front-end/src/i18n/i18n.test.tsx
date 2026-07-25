import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Localized } from '../shared/components/Localized'
import { I18nProvider } from './I18nContext'
import { LANGUAGE_STORAGE_KEY, setActiveLanguage, translate } from './i18n'
import { useI18n } from './useI18n'

function LanguageHarness() {
  const { setLanguage } = useI18n()

  return (
    <>
      <button onClick={() => setLanguage('vi')}>switch</button>
      <Localized>
        <button title="Save">Dashboard</button>
      </Localized>
    </>
  )
}

describe('application i18n', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActiveLanguage('en')
  })

  it('translates English, legacy Vietnamese, enums, and dynamic labels', () => {
    expect(translate('Dashboard', 'vi')).toBe('Tổng quan')
    expect(translate('Chỉ số điện tháng này', 'en')).toBe('Current electricity reading')
    expect(translate('WAITING_HANDOVER', 'vi')).toBe('Chờ bàn giao')
    expect(translate('Delete room A-103?', 'vi')).toBe('Xóa phòng A-103?')
  })

  it('updates localized content and persists the selected language', async () => {
    render(
      <I18nProvider>
        <LanguageHarness />
      </I18nProvider>,
    )

    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('title', 'Save')
    fireEvent.click(screen.getByRole('button', { name: 'switch' }))

    expect(screen.getByRole('button', { name: 'Tổng quan' })).toHaveAttribute('title', 'Lưu')
    await waitFor(() => expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('vi'))
    expect(document.documentElement.lang).toBe('vi')
  })
})
