import { useEffect, useMemo, useState } from 'react'
import { AppLayout } from '../layout/AppLayout'
import { BuildingsPage } from '../pages/buildings/BuildingsPage'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { mockBuildings } from '../pages/buildings/mockData'
import { RoomDetailPage } from '../pages/rooms/RoomDetailPage'
import { PlaceholderPage } from '../pages/shared/PlaceholderPage'
import { TenantsPage } from '../pages/tenants/TenantsPage'
import { PaymentsPage } from '../pages/payments/PaymentsPage'
import { TenantRoomPage } from '../pages/tenant-room/TenantRoomPage'
import { routeItems } from './routeConfig'

function getBasePath(pathname: string) {
  if (pathname.startsWith('/rooms/')) {
    return '/rooms'
  }
  return pathname
}

function resolvePathname(pathname: string) {
  if (pathname === '/') {
    return '/dashboard'
  }

  if (pathname.startsWith('/rooms/')) {
    return pathname
  }

  const found = routeItems.find((item) => item.path === pathname)
  return found ? found.path : '/dashboard'
}

export function AppRoutes() {
  const [pathname, setPathname] = useState(resolvePathname(window.location.pathname))

  useEffect(() => {
    const sync = () => setPathname(resolvePathname(window.location.pathname))
    window.addEventListener('popstate', sync)
    sync()

    return () => window.removeEventListener('popstate', sync)
  }, [])

  useEffect(() => {
    if (window.location.pathname !== pathname) {
      window.history.replaceState(null, '', pathname)
    }
  }, [pathname])

  const pageTitle = useMemo(() => {
    if (pathname.startsWith('/rooms/')) {
      return 'Room Detail'
    }

    return routeItems.find((item) => item.path === pathname)?.label ?? 'Dashboard'
  }, [pathname])

  const renderPage = () => {
    if (pathname === '/dashboard') {
      return <DashboardPage onNavigate={setPathname} />
    }

    if (pathname === '/buildings') {
      return <BuildingsPage />
    }

    if (pathname.startsWith('/rooms/')) {
      const roomId = pathname.split('/')[2]
      return <RoomDetailPage roomId={roomId} buildings={mockBuildings} />
    }

    if (pathname === '/tenants') {
      return <TenantsPage />
    }

    if (pathname === '/payments') {
      return <PaymentsPage />
    }

    if (pathname === '/my-room') {
      return <TenantRoomPage />
    }

    return <PlaceholderPage title={pageTitle} />
  }

  return (
    <AppLayout
      pathname={getBasePath(pathname)}
      onNavigate={setPathname}
      items={routeItems}
      pageTitle={pageTitle}
      content={renderPage()}
    />
  )
}
