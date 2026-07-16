import { lazy, Suspense, useEffect, useState } from 'react'
import { AppLayout } from '../layout/AppLayout'
import { routeItems, sidebarRouteItems } from './routeConfig'
import { useAuth } from '../features/auth/useAuth'
import type { AppRole } from '../features/auth/types/auth'

const LoginPage = lazy(() => import('../features/auth/pages/LoginPage').then((module) => ({ default: module.LoginPage })))
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

const adminPaths = new Set(['/dashboard', '/buildings', '/rental-registration', '/contracts', '/utilities', '/fixed-charges', '/tenants', '/invoices', '/monthly-billing', '/payments', '/reports'])

function RouteFallback() {
  return (
    <div role="status" aria-live="polite">
      Loading page...
    </div>
  )
}

function getBasePath(pathname: string) {
  if (pathname.startsWith('/rooms/')) {
    return '/buildings'
  }
  return pathname
}

function homePathByRole(role: AppRole) {
  return role === 'TENANT' ? '/my-room' : '/dashboard'
}

function canAccess(pathname: string, role: AppRole) {
  if (pathname === '/my-room') {
    return role === 'TENANT'
  }

  if (pathname.startsWith('/rooms/')) {
    return role === 'MANAGER'
  }

  if (adminPaths.has(pathname)) {
    return role === 'MANAGER'
  }

  return true
}

function resolveProtectedPath(pathname: string, role: AppRole) {
  const normalized = pathname === '/' ? homePathByRole(role) : pathname
  const found = normalized.startsWith('/rooms/') || routeItems.some((item) => normalized === item.path)

  if (!found) {
    return homePathByRole(role)
  }

  if (!canAccess(normalized, role)) {
    return homePathByRole(role)
  }

  return normalized
}

export function AppRoutes() {
  const { user, isAuthenticated, logout } = useAuth()
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  if (!isAuthenticated || !user) {
    if (pathname !== '/login') {
      window.history.replaceState(null, '', '/login')
    }
    return (
      <Suspense fallback={<RouteFallback />}>
        <LoginPage />
      </Suspense>
    )
  }

  const targetPath = pathname === '/login' ? homePathByRole(user.role) : resolveProtectedPath(pathname, user.role)
  if (targetPath !== pathname) {
    window.history.replaceState(null, '', targetPath)
  }
  const protectedPath = targetPath

  const pageTitle = protectedPath.startsWith('/rooms/')
    ? 'Room Detail'
    : routeItems.find((item) => item.path === protectedPath)?.label ?? 'Dashboard'

  const renderPage = () => {
    if (protectedPath === '/dashboard') {
      return <DashboardPage onNavigate={(path) => {
        window.history.pushState(null, '', path)
        setPathname(path)
      }} />
    }
    if (protectedPath === '/buildings') return <BuildingsPage />
    if (protectedPath === '/rental-registration') return <RentalRegistrationPage />
    if (protectedPath === '/contracts') return <ContractsPage />
    if (protectedPath === '/utilities') return <UtilitiesPage />
    if (protectedPath === '/fixed-charges') return <FixedChargesPage />
    if (protectedPath.startsWith('/rooms/')) return <RoomDetailPage roomId={protectedPath.split('/')[2]} />
    if (protectedPath === '/tenants') return <TenantsPage />
    if (protectedPath === '/invoices') return <InvoicesPage />
    if (protectedPath === '/monthly-billing') return <MonthlyBillingPage />
    if (protectedPath === '/payments') return <PaymentsPage />
    if (protectedPath === '/reports') return <ReportsPage />
    if (protectedPath === '/my-room') return <TenantRoomPage />
    return null
  }

  const allowedSidebarItems = sidebarRouteItems.filter((item) => canAccess(item.path, user.role))

  return (
    <AppLayout
      pathname={getBasePath(protectedPath)}
      onNavigate={(path) => {
        window.history.pushState(null, '', path)
        setPathname(path)
      }}
      items={allowedSidebarItems}
      pageTitle={pageTitle}
      content={<Suspense fallback={<RouteFallback />}>{renderPage()}</Suspense>}
      currentUserName={user.fullName ?? user.username ?? user.email ?? 'User'}
      onLogout={async () => {
        await logout()
        window.history.replaceState(null, '', '/login')
        setPathname('/login')
      }}
    />
  )
}
