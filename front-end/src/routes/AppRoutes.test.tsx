import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './AppRoutes'
import type { AuthContextValue } from '../features/auth/auth-context-value'
import type { AuthUser } from '../features/auth/types/auth'

const authMock = vi.hoisted(() => ({
  value: undefined as unknown as AuthContextValue,
}))

const authApiMock = vi.hoisted(() => ({
  changePassword: vi.fn(),
  revokeAllSessions: vi.fn(),
}))

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => authMock.value,
}))

vi.mock('../features/auth/authApi', () => ({
  changePassword: authApiMock.changePassword,
  revokeAllSessions: authApiMock.revokeAllSessions,
}))

interface MockRouteItem {
  path: string
  label: string
}

interface MockAppLayoutProps {
  pathname: string
  items: MockRouteItem[]
  pageTitle: string
  content: ReactNode
  currentUserName: string
  onNavigate: (path: string) => void
  onChangePassword: (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => Promise<void>
}

vi.mock('../layout/AppLayout', () => ({
  AppLayout: ({ pathname, items, pageTitle, content, currentUserName, onNavigate, onChangePassword }: MockAppLayoutProps) => (
    <div>
      <h1 data-testid="page-title">{pageTitle}</h1>
      <div data-testid="layout-path">{pathname}</div>
      <div data-testid="current-user">{currentUserName}</div>
      <nav aria-label="sidebar">
        {items.map((item) => (
          <button type="button" key={item.path} onClick={() => onNavigate(item.path)}>{item.label}</button>
        ))}
      </nav>
      <button
        type="button"
        onClick={() => void onChangePassword({
          currentPassword: 'current-password',
          newPassword: 'new-password',
          confirmPassword: 'new-password',
        })}
      >
        Change password test action
      </button>
      <main>{content}</main>
    </div>
  ),
}))

vi.mock('../features/auth/pages/LoginPage', () => ({
  LoginPage: () => <div>Login Page</div>,
}))

vi.mock('../features/auth/pages/ActivateAccountPage', () => ({
  ActivateAccountPage: () => <div>Activate Account Page</div>,
}))

vi.mock('../features/auth/pages/ForgotPasswordPage', () => ({
  ForgotPasswordPage: () => <div>Forgot Password Page</div>,
}))

vi.mock('../features/auth/pages/ResetPasswordPage', () => ({
  ResetPasswordPage: () => <div>Reset Password Page</div>,
}))

vi.mock('../pages/dashboard/DashboardPage', () => ({
  DashboardPage: () => <div>Dashboard Page</div>,
}))

vi.mock('../pages/buildings/BuildingsPage', () => ({
  BuildingsPage: () => <div>Buildings Page</div>,
}))

vi.mock('../pages/contracts/ContractsPage', () => ({
  ContractsPage: () => <div>Contracts Page</div>,
}))

vi.mock('../pages/utilities/UtilitiesPage', () => ({
  UtilitiesPage: () => <div>Utilities Page</div>,
}))

vi.mock('../pages/fixed-charges/FixedChargesPage', () => ({
  FixedChargesPage: () => <div>Fixed Charges Page</div>,
}))

vi.mock('../pages/rooms/RoomDetailPage', () => ({
  RoomDetailPage: ({ roomId }: { roomId: string }) => <div>Room Detail Page {roomId}</div>,
}))

vi.mock('../pages/tenants/TenantsPage', () => ({
  TenantsPage: () => <div>Tenants Page</div>,
}))

vi.mock('../pages/invoices/InvoicesPage', () => ({
  InvoicesPage: () => <div>Invoices Page</div>,
}))

vi.mock('../pages/payments/PaymentsPage', () => ({
  PaymentsPage: () => <div>Payments Page</div>,
}))

vi.mock('../pages/reports/ReportsPage', () => ({
  ReportsPage: () => <div>Reports Page</div>,
}))

vi.mock('../pages/tenant-room/TenantRoomPage', () => ({
  TenantRoomPage: () => <div>Tenant Room Page</div>,
}))

const managerUser: AuthUser = {
  id: 'manager-1',
  email: 'manager@example.com',
  username: 'manager',
  fullName: 'Manager One',
  role: 'MANAGER',
  tenantId: null,
  preferredLanguage: 'en',
}

const tenantUser: AuthUser = {
  id: 'tenant-1',
  email: 'tenant@example.com',
  username: 'tenant',
  fullName: 'Tenant One',
  role: 'TENANT',
  tenantId: 'tenant-profile-1',
  preferredLanguage: 'en',
}

function setAuth(user: AuthUser | null) {
  authMock.value = {
    user,
    isAuthenticated: Boolean(user),
    isInitializing: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshCurrentUser: vi.fn(),
    setPreferredLanguage: vi.fn(),
  }
}

describe('AppRoutes', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    setAuth(null)
  })

  it('redirects unauthenticated users to the login page', async () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<AppRoutes />)

    expect(await screen.findByText('Login Page')).not.toBeNull()
    expect(window.location.pathname).toBe('/login')
  })

  it('allows unauthenticated users to open an account activation link', async () => {
    window.history.replaceState(null, '', '/activate-account?token=invitation-token')

    render(<AppRoutes />)

    expect(await screen.findByText('Activate Account Page')).not.toBeNull()
    expect(window.location.pathname).toBe('/activate-account')
    expect(window.location.search).toBe('?token=invitation-token')
  })

  it.each([
    ['/forgot-password', 'Forgot Password Page'],
    ['/reset-password?token=reset-token', 'Reset Password Page'],
  ])('allows users to open public password route %s', async (path, pageText) => {
    window.history.replaceState(null, '', path)

    render(<AppRoutes />)

    expect(await screen.findByText(pageText)).not.toBeNull()
    expect(window.location.pathname).toBe(path.split('?')[0])
  })

  it('renders the requested manager route with manager sidebar items', async () => {
    setAuth(managerUser)
    window.history.replaceState(null, '', '/dashboard')

    render(<AppRoutes />)

    expect(screen.getByTestId('page-title').textContent).toBe('Dashboard')
    expect(await screen.findByText('Dashboard Page')).not.toBeNull()
    expect(screen.getByTestId('current-user').textContent).toBe('Manager One')
    expect(screen.getByText('Buildings')).not.toBeNull()
    expect(screen.queryByText('My Room')).toBeNull()
  })

  it.each([
    ['/buildings', 'Buildings', 'Buildings Page'],
    ['/contracts', 'Contracts', 'Contracts Page'],
    ['/utilities', 'Utilities', 'Utilities Page'],
    ['/fixed-charges', 'Fixed Charges', 'Fixed Charges Page'],
    ['/tenants', 'Tenants', 'Tenants Page'],
    ['/invoices', 'Invoices', 'Invoices Page'],
    ['/payments', 'Payments', 'Payments Page'],
    ['/reports', 'Reports', 'Reports Page'],
  ])('renders manager deep link %s', async (path, title, pageText) => {
    setAuth(managerUser)
    window.history.replaceState(null, '', path)

    render(<AppRoutes />)

    expect(screen.getByTestId('page-title').textContent).toBe(title)
    expect(await screen.findByText(pageText)).not.toBeNull()
  })

  it('renders room detail deep links under the buildings section', async () => {
    setAuth(managerUser)
    window.history.replaceState(null, '', '/rooms/room-1')

    render(<AppRoutes />)

    expect(screen.getByTestId('page-title').textContent).toBe('Room Detail')
    expect(screen.getByTestId('layout-path').textContent).toBe('/buildings')
    expect(await screen.findByText('Room Detail Page room-1')).not.toBeNull()
  })

  it('shows 403 when a tenant opens a manager-only route', async () => {
    setAuth(tenantUser)
    window.history.replaceState(null, '', '/dashboard')

    render(<AppRoutes />)

    expect(window.location.pathname).toBe('/403')
    expect(screen.getByTestId('page-title').textContent).toBe('Access denied')
    expect(await screen.findByText('You do not have permission to open this page.')).not.toBeNull()
    expect(screen.queryByText('Buildings')).toBeNull()
  })

  it('shows 404 for a removed route', async () => {
    setAuth(tenantUser)
    window.history.replaceState(null, '', '/payment-result')

    render(<AppRoutes />)

    expect(window.location.pathname).toBe('/payment-result')
    expect(await screen.findByText('The page you requested does not exist.')).not.toBeNull()
  })

  it('preserves query filters on manager deep links', async () => {
    setAuth(managerUser)
    window.history.replaceState(null, '', '/invoices?month=2026-08&status=ISSUED')

    render(<AppRoutes />)

    expect(await screen.findByText('Invoices Page')).not.toBeNull()
    expect(window.location.search).toBe('?month=2026-08&status=ISSUED')
  })

  it('supports browser back after sidebar navigation', async () => {
    const user = userEvent.setup()
    setAuth(managerUser)
    window.history.replaceState(null, '', '/dashboard')

    render(<AppRoutes />)
    await user.click(screen.getByRole('button', { name: 'Buildings' }))
    expect(await screen.findByText('Buildings Page')).not.toBeNull()

    window.history.back()
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
    expect(await screen.findByText('Dashboard Page')).not.toBeNull()
  })

  it('sends authenticated users away from login to their role home route', async () => {
    setAuth(managerUser)
    window.history.replaceState(null, '', '/login')

    render(<AppRoutes />)

    expect(window.location.pathname).toBe('/dashboard')
    expect(screen.getByTestId('page-title').textContent).toBe('Dashboard')
    expect(await screen.findByText('Dashboard Page')).not.toBeNull()
  })

  it('logs the user out and returns to login after changing the password', async () => {
    const user = userEvent.setup()
    const logout = vi.fn().mockImplementation(async () => {
      authMock.value = {
        ...authMock.value,
        user: null,
        isAuthenticated: false,
      }
    })
    setAuth(managerUser)
    authMock.value = { ...authMock.value, logout }
    authApiMock.changePassword.mockResolvedValue({ success: true })
    window.history.replaceState(null, '', '/dashboard')

    render(<AppRoutes />)
    await user.click(screen.getByRole('button', { name: 'Change password test action' }))

    await waitFor(() => {
      expect(authApiMock.changePassword).toHaveBeenCalledWith({
        currentPassword: 'current-password',
        newPassword: 'new-password',
        confirmPassword: 'new-password',
      })
      expect(logout).toHaveBeenCalledTimes(1)
      expect(window.location.pathname).toBe('/login')
    })
  })
})
