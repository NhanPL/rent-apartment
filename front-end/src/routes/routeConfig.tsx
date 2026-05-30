import type { ReactNode } from 'react'
import { BankOutlined, FileTextOutlined, DashboardOutlined, ProfileOutlined, UserSwitchOutlined, UserOutlined } from '@ant-design/icons'

export interface RouteDefinition {
  key: string
  path: string
  label: string
}

export interface SidebarRouteItem extends RouteDefinition {
  icon: ReactNode
}

export const routeItems: RouteDefinition[] = [
  { key: 'dashboard', path: '/dashboard', label: 'Dashboard' },
  { key: 'buildings', path: '/buildings', label: 'Buildings' },
  { key: 'contracts', path: '/contracts', label: 'Contracts' },
  { key: 'tenants', path: '/tenants', label: 'Tenants' },
  { key: 'invoices', path: '/invoices', label: 'Invoices' },
  { key: 'my-room', path: '/my-room', label: 'My Room' },
]

export const sidebarRouteItems: SidebarRouteItem[] = [
  { key: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: <DashboardOutlined /> },
  { key: 'buildings', path: '/buildings', label: 'Buildings', icon: <BankOutlined /> },
  { key: 'contracts', path: '/contracts', label: 'Contracts', icon: <ProfileOutlined /> },
  { key: 'tenants', path: '/tenants', label: 'Tenants', icon: <UserOutlined /> },
  { key: 'invoices', path: '/invoices', label: 'Invoices', icon: <FileTextOutlined /> },
  { key: 'my-room', path: '/my-room', label: 'My Room', icon: <UserSwitchOutlined /> },
]
