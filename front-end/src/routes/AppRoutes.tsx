import { useEffect, useState } from 'react'
import { AppLayout } from '../layout/AppLayout'
import { BuildingsPage } from '../pages/buildings/BuildingsPage'
import { ContractsPage } from '../pages/contracts/ContractsPage'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { RoomDetailPage } from '../pages/rooms/RoomDetailPage'
import { TenantsPage } from '../pages/tenants/TenantsPage'
import { InvoicesPage } from '../pages/invoices/InvoicesPage'
import { FixedChargesPage } from '../pages/fixed-charges/FixedChargesPage'
import { TenantRoomPage } from '../pages/tenant-room/TenantRoomPage'
import { UtilitiesPage } from '../pages/utilities/UtilitiesPage'
import { PaymentsPage } from '../pages/payments/PaymentsPage'
import { routeItems, sidebarRouteItems } from './routeConfig'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { useAuth } from '../features/auth/useAuth'
import type { AppRole } from '../features/auth/types/auth'

const adminPaths = new Set(['/dashboard', '/buildings', '/contracts', '/utilities', '/fixed-charges', '/tenants', '/invoices', '/payments'])

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
    return <LoginPage />
  }

  if (pathname === '/login') {
    const homePath = homePathByRole(user.role)
    window.history.replaceState(null, '', homePath)
    return null
  }

  const protectedPath = resolveProtectedPath(pathname, user.role)
  if (protectedPath !== pathname) {
    window.history.replaceState(null, '', protectedPath)
    return null
  }

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
    if (protectedPath === '/contracts') return <ContractsPage />
    if (protectedPath === '/utilities') return <UtilitiesPage />
    if (protectedPath === '/fixed-charges') return <FixedChargesPage />
    if (protectedPath.startsWith('/rooms/')) return <RoomDetailPage roomId={protectedPath.split('/')[2]} />
    if (protectedPath === '/tenants') return <TenantsPage />
    if (protectedPath === '/invoices') return <InvoicesPage />
    if (protectedPath === '/payments') return <PaymentsPage />
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
      content={renderPage()}
      currentUserName={user.fullName ?? user.username ?? user.email ?? 'User'}
      onLogout={async () => {
        await logout()
        window.history.replaceState(null, '', '/login')
        setPathname('/login')
      }}
    />
  )
}
