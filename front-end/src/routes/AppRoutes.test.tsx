import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './AppRoutes'
import type { AuthContextValue } from '../features/auth/auth-context-value'
import type { AuthUser } from '../features/auth/types/auth'

const authMock = vi.hoisted(() => ({
  value: undefined as unknown as AuthContextValue,
}))

vi.mock('../features/auth/useAuth', () => ({
  useAuth: () => authMock.value,
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
}

vi.mock('../layout/AppLayout', () => ({
  AppLayout: ({ pathname, items, pageTitle, content, currentUserName }: MockAppLayoutProps) => (
    <div>
      <h1 data-testid="page-title">{pageTitle}</h1>
      <div data-testid="layout-path">{pathname}</div>
      <div data-testid="current-user">{currentUserName}</div>
      <nav aria-label="sidebar">
        {items.map((item) => (
          <span key={item.path}>{item.label}</span>
        ))}
      </nav>
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

vi.mock('../pages/payments/PaymentResultPage', () => ({
  PaymentResultPage: () => <div>Payment Result Page</div>,
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

  it('redirects unauthenticated users to the login page', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<AppRoutes />)

    expect(screen.getByText('Login Page')).not.toBeNull()
    expect(window.location.pathname).toBe('/login')
  })

  it('renders the requested manager route with manager sidebar items', () => {
    setAuth(managerUser)
    window.history.replaceState(null, '', '/dashboard')

    render(<AppRoutes />)

    expect(screen.getByTestId('page-title').textContent).toBe('Dashboard')
    expect(screen.getByText('Dashboard Page')).not.toBeNull()
    expect(screen.getByTestId('current-user').textContent).toBe('Manager One')
    expect(screen.getByText('Buildings')).not.toBeNull()
    expect(screen.queryByText('My Room')).toBeNull()
  })

  it('redirects tenants away from manager-only routes to their room page', () => {
    setAuth(tenantUser)
    window.history.replaceState(null, '', '/dashboard')

    render(<AppRoutes />)

    expect(window.location.pathname).toBe('/my-room')
    expect(screen.getByTestId('page-title').textContent).toBe('My Room')
    expect(screen.getByText('Tenant Room Page')).not.toBeNull()
    expect(screen.getAllByText('My Room')).toHaveLength(2)
    expect(screen.queryByText('Buildings')).toBeNull()
  })

  it('sends authenticated users away from login to their role home route', () => {
    setAuth(managerUser)
    window.history.replaceState(null, '', '/login')

    render(<AppRoutes />)

    expect(window.location.pathname).toBe('/dashboard')
    expect(screen.getByTestId('page-title').textContent).toBe('Dashboard')
    expect(screen.getByText('Dashboard Page')).not.toBeNull()
  })
})
