import type { ReactNode } from 'react'
import { BankOutlined, CreditCardOutlined, DashboardOutlined, UserSwitchOutlined, UserOutlined } from '@ant-design/icons'

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
  { key: 'rooms', path: '/rooms', label: 'Rooms' },
  { key: 'tenants', path: '/tenants', label: 'Tenants' },
  { key: 'contracts', path: '/contracts', label: 'Contracts' },
  { key: 'payments', path: '/payments', label: 'Payments' },
  { key: 'reports', path: '/reports', label: 'Reports' },
  { key: 'my-room', path: '/my-room', label: 'My Room' },
]

export const sidebarRouteItems: SidebarRouteItem[] = [
  { key: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: <DashboardOutlined /> },
  { key: 'buildings', path: '/buildings', label: 'Buildings', icon: <BankOutlined /> },
  { key: 'tenants', path: '/tenants', label: 'Tenants', icon: <UserOutlined /> },
  { key: 'payments', path: '/payments', label: 'Payments', icon: <CreditCardOutlined /> },
  { key: 'my-room', path: '/my-room', label: 'My Room', icon: <UserSwitchOutlined /> },
]
