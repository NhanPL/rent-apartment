import { useEffect, useMemo, useState } from 'react'
import { AppLayout } from '../layout/AppLayout'
import { BuildingsPage } from '../pages/buildings/BuildingsPage'
import { PlaceholderPage } from '../pages/shared/PlaceholderPage'
import { routeItems } from './routeConfig'

function resolvePathname(pathname: string) {
  if (pathname === '/') {
    return '/buildings'
  }

  const found = routeItems.find((item) => item.path === pathname)
  return found ? found.path : '/buildings'
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

  const title = useMemo(() => routeItems.find((item) => item.path === pathname)?.label ?? 'Buildings', [pathname])

  const renderPage = () => {
    if (pathname === '/buildings') {
      return <BuildingsPage />
    }

    return <PlaceholderPage title={title} />
  }

  return (
    <AppLayout
      pathname={pathname}
      onNavigate={setPathname}
      items={routeItems}
      pageTitle={title}
      content={renderPage()}
    />
  )
}
