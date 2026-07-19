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
}))

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => authMock.value,
}))

vi.mock('../features/auth/authApi', () => ({
  changePassword: authApiMock.changePassword,
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
  onChangePassword: (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => Promise<void>
}

vi.mock('../layout/AppLayout', () => ({
  AppLayout: ({ pathname, items, pageTitle, content, currentUserName, onChangePassword }: MockAppLayoutProps) => (
    <div>
      <h1 data-testid="page-title">{pageTitle}</h1>
      <div data-testid="layout-path">{pathname}</div>
      <div data-testid="current-user">{currentUserName}</div>
      <nav aria-label="sidebar">
        {items.map((item) => (
          <span key={item.path}>{item.label}</span>
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
}

const tenantUser: AuthUser = {
  id: 'tenant-1',
  email: 'tenant@example.com',
  username: 'tenant',
  fullName: 'Tenant One',
  role: 'TENANT',
  tenantId: 'tenant-profile-1',
}

function setAuth(user: AuthUser | null) {
  authMock.value = {
    user,
    isAuthenticated: Boolean(user),
    isInitializing: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshCurrentUser: vi.fn(),
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

  it('redirects tenants away from manager-only routes to their room page', async () => {
    setAuth(tenantUser)
    window.history.replaceState(null, '', '/dashboard')

    render(<AppRoutes />)

    expect(window.location.pathname).toBe('/my-room')
    expect(screen.getByTestId('page-title').textContent).toBe('My Room')
    expect(await screen.findByText('Tenant Room Page')).not.toBeNull()
    expect(screen.getAllByText('My Room')).toHaveLength(2)
    expect(screen.queryByText('Buildings')).toBeNull()
  })

  it('redirects the removed payment result route to the tenant room page', async () => {
    setAuth(tenantUser)
    window.history.replaceState(null, '', '/payment-result')

    render(<AppRoutes />)

    expect(window.location.pathname).toBe('/my-room')
    expect(await screen.findByText('Tenant Room Page')).not.toBeNull()
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
