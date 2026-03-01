import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { RouteConfig } from '../routes/routeConfig'
import { useBreakpoint } from '../utils/responsive'
import './AppLayout.css'

interface AppLayoutProps {
  pathname: string
  onNavigate: (path: string) => void
  items: RouteConfig[]
  pageTitle: string
  content: ReactNode
}

export function AppLayout({ pathname, onNavigate, items, pageTitle, content }: AppLayoutProps) {
  const { xs } = useBreakpoint()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const breadcrumb = useMemo(() => ['Home', pageTitle], [pageTitle])

  const menu = (
    <ul className="menu-list">
      {items.map((item) => (
        <li key={item.path}>
          <button
            type="button"
            className={`menu-item ${pathname === item.path ? 'active' : ''}`}
            onClick={() => {
              onNavigate(item.path)
              setMobileMenuOpen(false)
            }}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="app-shell">
      {!xs && <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>{menu}</aside>}

      {xs && mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)}>
          <aside className="mobile-sidebar" onClick={(event) => event.stopPropagation()}>
            {menu}
          </aside>
        </div>
      )}

      <div className="main-shell">
        <header className="header">
          <div className="header-left">
            <button
              type="button"
              className="icon-btn"
              onClick={() => (xs ? setMobileMenuOpen((current) => !current) : setCollapsed((current) => !current))}
            >
              ☰
            </button>
            <div>
              <h1>Rent Apartment</h1>
              <p>{breadcrumb.join(' / ')}</p>
            </div>
          </div>

          <div className="avatar-dropdown">
            <span className="avatar">AD</span>
            <span>Admin ▾</span>
          </div>
        </header>

        <main className="content">{content}</main>

        <footer className="footer">© {new Date().getFullYear()} Rent Apartment Management</footer>
      </div>
    </div>
  )
}
