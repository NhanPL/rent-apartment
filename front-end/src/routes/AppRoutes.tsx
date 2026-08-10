import { lazy, Suspense } from 'react'
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { AppLayout } from '../layout/AppLayout'
import { routeItems, sidebarRouteItems } from './routeConfig'
import { useAuth } from '../features/auth/useAuth'
import { changePassword, revokeAllSessions } from '../features/auth/authApi'
import type { AppRole } from '../features/auth/types/auth'
import { useI18n } from '../i18n'
import { Localized } from '../shared/components/Localized'
import { ForbiddenPage } from '../pages/errors/ForbiddenPage'
import { NotFoundPage } from '../pages/errors/NotFoundPage'

const LoginPage = lazy(() => import('../features/auth/pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const ActivateAccountPage = lazy(() => import('../features/auth/pages/ActivateAccountPage').then((module) => ({ default: module.ActivateAccountPage })))
const ForgotPasswordPage = lazy(() => import('../features/auth/pages/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('../features/auth/pages/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })))
const BuildingsPage = lazy(() => import('../pages/buildings/BuildingsPage').then((module) => ({ default: module.BuildingsPage })))
const ContractsPage = lazy(() => import('../pages/contracts/ContractsPage').then((module) => ({ default: module.ContractsPage })))
const RentalRegistrationPage = lazy(() => import('../pages/rental-registration/RentalRegistrationPage').then((module) => ({ default: module.RentalRegistrationPage })))
const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const RoomDetailPage = lazy(() => import('../pages/rooms/RoomDetailPage').then((module) => ({ default: module.RoomDetailPage })))
const TenantsPage = lazy(() => import('../pages/tenants/TenantsPage').then((module) => ({ default: module.TenantsPage })))
const InvoicesPage = lazy(() => import('../pages/invoices/InvoicesPage').then((module) => ({ default: module.InvoicesPage })))
const MonthlyBillingPage = lazy(() => import('../pages/monthly-billing/MonthlyBillingPage').then((module) => ({ default: module.MonthlyBillingPage })))
const FixedChargesPage = lazy(() => import('../pages/fixed-charges/FixedChargesPage').then((module) => ({ default: module.FixedChargesPage })))
const TenantRoomPage = lazy(() => import('../pages/tenant-room/TenantRoomPage').then((module) => ({ default: module.TenantRoomPage })))
const UtilitiesPage = lazy(() => import('../pages/utilities/UtilitiesPage').then((module) => ({ default: module.UtilitiesPage })))
const PaymentsPage = lazy(() => import('../pages/payments/PaymentsPage').then((module) => ({ default: module.PaymentsPage })))
const ReportsPage = lazy(() => import('../pages/reports/ReportsPage').then((module) => ({ default: module.ReportsPage })))
const AuditLogsPage = lazy(() => import('../pages/audit-logs/AuditLogsPage').then((module) => ({ default: module.AuditLogsPage })))

const managerPaths = new Set(routeItems.filter((item) => item.path !== '/my-room').map((item) => item.path))

function RouteFallback() {
  return <Localized><div role="status" aria-live="polite">Loading page...</div></Localized>
}

function homePathByRole(role: AppRole) {
  return role === 'TENANT' ? '/my-room' : '/dashboard'
}

function canAccess(pathname: string, role: AppRole) {
  if (pathname === '/my-room') return role === 'TENANT'
  if (pathname.startsWith('/rooms/')) return role === 'MANAGER'
  if (managerPaths.has(pathname)) return role === 'MANAGER'
  return true
}

function PublicOnlyRoute() {
  const { user, isAuthenticated, isInitializing } = useAuth()
  if (isInitializing) return <RouteFallback />
  if (isAuthenticated && user) return <Navigate to={homePathByRole(user.role)} replace />
  return <Outlet />
}

function ProtectedRoute() {
  const { user, isAuthenticated, isInitializing } = useAuth()
  const location = useLocation()
  if (isInitializing) return <RouteFallback />
  if (!isAuthenticated || !user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

function RoleRoute({ roles }: { roles: AppRole[] }) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) return <Navigate to="/403" replace />
  return <Outlet />
}

function RoleHome() {
  const { user } = useAuth()
  return <Navigate to={user ? homePathByRole(user.role) : '/login'} replace />
}

function DashboardRoute() {
  const navigate = useNavigate()
  return <DashboardPage onNavigate={navigate} />
}

function RoomDetailRoute() {
  const { roomId } = useParams<{ roomId: string }>()
  return roomId ? <RoomDetailPage roomId={roomId} /> : <NotFoundPage />
}

function AuthenticatedLayout() {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  if (!user) return null

  const basePath = location.pathname.startsWith('/rooms/') ? '/buildings' : location.pathname
  const pageTitle = location.pathname.startsWith('/rooms/')
    ? t('Room Detail')
    : location.pathname === '/403'
      ? t('Access denied')
      : t(routeItems.find((item) => item.path === location.pathname)?.label ?? 'Page not found')
  const items = sidebarRouteItems.filter((item) => canAccess(item.path, user.role)).map((item) => ({ ...item, label: t(item.label) }))

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <AppLayout
      pathname={basePath}
      onNavigate={navigate}
      items={items}
      pageTitle={pageTitle}
      content={<Suspense fallback={<RouteFallback />}><Outlet /></Suspense>}
      currentUserName={user.fullName ?? user.username ?? user.email ?? t('User')}
      onLogout={handleLogout}
      onChangePassword={async (payload) => { await changePassword(payload); await handleLogout() }}
      onRevokeAllSessions={async () => { await revokeAllSessions(); await handleLogout() }}
    />
  )
}

function AppRouteTree() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route path="/activate-account" element={<ActivateAccountPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AuthenticatedLayout />}>
          <Route index element={<RoleHome />} />
          <Route element={<RoleRoute roles={['MANAGER']} />}>
            <Route path="/dashboard" element={<DashboardRoute />} />
            <Route path="/buildings" element={<BuildingsPage />} />
            <Route path="/rooms/:roomId" element={<RoomDetailRoute />} />
            <Route path="/rental-registration" element={<RentalRegistrationPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/utilities" element={<UtilitiesPage />} />
            <Route path="/fixed-charges" element={<FixedChargesPage />} />
            <Route path="/tenants" element={<TenantsPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/monthly-billing" element={<MonthlyBillingPage />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
          </Route>
          <Route element={<RoleRoute roles={['TENANT']} />}><Route path="/my-room" element={<TenantRoomPage />} /></Route>
          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export function AppRoutes() {
  return <BrowserRouter><AppRouteTree /></BrowserRouter>
}
