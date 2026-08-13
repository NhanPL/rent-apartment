import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../../i18n/I18nContext'
import { SessionsPage } from './SessionsPage'

const authApiMocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
}))
const authMocks = vi.hoisted(() => ({ logout: vi.fn() }))

vi.mock('../authApi', () => authApiMocks)
vi.mock('../useAuth', () => ({ useAuth: () => authMocks }))

const renderPage = () => render(
  <MemoryRouter><I18nProvider><SessionsPage /></I18nProvider></MemoryRouter>,
)

describe('SessionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authApiMocks.listSessions.mockResolvedValue({
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0',
          createdAt: '2026-08-12T10:00:00.000Z',
          lastUsedAt: '2026-08-12T11:00:00.000Z',
          expiresAt: '2026-08-19T10:00:00.000Z',
          current: true,
        },
      ],
    })
  })

  it('shows active devices and clearly identifies the current session', async () => {
    renderPage()

    expect(await screen.findByText('Google Chrome on Windows')).toBeInTheDocument()
    expect(screen.getByText('Current device')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
  })

  it('shows an actionable error when sessions cannot be loaded', async () => {
    const user = userEvent.setup()
    authApiMocks.listSessions
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ items: [] })
    renderPage()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No active sessions found')).toBeInTheDocument()
    expect(authApiMocks.listSessions).toHaveBeenCalledTimes(2)
  })
})
