import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n/I18nContext'
import { NotificationBell } from './NotificationBell'

const apiMocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))

vi.mock('./notificationsApi', () => apiMocks)

const renderBell = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <I18nProvider>
        <QueryClientProvider client={client}><NotificationBell /></QueryClientProvider>
      </I18nProvider>
    </MemoryRouter>,
  )
}

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.markNotificationRead.mockResolvedValue(undefined)
    apiMocks.markAllNotificationsRead.mockResolvedValue(undefined)
    apiMocks.listNotifications.mockResolvedValue({
      items: [{
        id: '00000000-0000-4000-8000-000000000901',
        template_code: 'INVOICE_ISSUED',
        payload: { roomCode: 'A101', month: '2026-08' },
        entity_type: 'INVOICE',
        entity_id: '00000000-0000-4000-8000-000000000601',
        read_at: null,
        created_at: '2026-08-12T10:00:00.000Z',
      }],
      total: 1,
      unreadCount: 1,
      page: 1,
      pageSize: 10,
    })
  })

  it('shows unread tenant notifications and marks all as read', async () => {
    const user = userEvent.setup()
    renderBell()

    await user.click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(await screen.findByText('Invoice issued for room A101 in 2026-08.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mark all read' }))
    expect(apiMocks.markAllNotificationsRead).toHaveBeenCalledOnce()
  })
})
