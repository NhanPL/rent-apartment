import type { ReactNode } from 'react'
import { BankOutlined, BarChartOutlined, CreditCardOutlined, DollarOutlined, FileSyncOutlined, FileTextOutlined, DashboardOutlined, FormOutlined, ProfileOutlined, ThunderboltOutlined, UserSwitchOutlined, UserOutlined } from '@ant-design/icons'

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
  { key: 'rental-registration', path: '/rental-registration', label: 'Rental Registration' },
  { key: 'contracts', path: '/contracts', label: 'Contracts' },
  { key: 'utilities', path: '/utilities', label: 'Utilities' },
  { key: 'fixed-charges', path: '/fixed-charges', label: 'Fixed Charges' },
  { key: 'tenants', path: '/tenants', label: 'Tenants' },
  { key: 'invoices', path: '/invoices', label: 'Invoices' },
  { key: 'monthly-billing', path: '/monthly-billing', label: 'Monthly Billing' },
  { key: 'payments', path: '/payments', label: 'Payments' },
  { key: 'reports', path: '/reports', label: 'Reports' },
  { key: 'my-room', path: '/my-room', label: 'My Room' },
  { key: 'payment-result', path: '/payment-result', label: 'Payment Result' },
]

export const sidebarRouteItems: SidebarRouteItem[] = [
  { key: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: <DashboardOutlined /> },
  { key: 'buildings', path: '/buildings', label: 'Buildings', icon: <BankOutlined /> },
  { key: 'rental-registration', path: '/rental-registration', label: 'Rental Registration', icon: <FormOutlined /> },
  { key: 'contracts', path: '/contracts', label: 'Contracts', icon: <ProfileOutlined /> },
  { key: 'utilities', path: '/utilities', label: 'Utilities', icon: <ThunderboltOutlined /> },
  { key: 'fixed-charges', path: '/fixed-charges', label: 'Fixed Charges', icon: <DollarOutlined /> },
  { key: 'tenants', path: '/tenants', label: 'Tenants', icon: <UserOutlined /> },
  { key: 'invoices', path: '/invoices', label: 'Invoices', icon: <FileTextOutlined /> },
  { key: 'monthly-billing', path: '/monthly-billing', label: 'Monthly Billing', icon: <FileSyncOutlined /> },
  { key: 'payments', path: '/payments', label: 'Payments', icon: <CreditCardOutlined /> },
  { key: 'reports', path: '/reports', label: 'Reports', icon: <BarChartOutlined /> },
  { key: 'my-room', path: '/my-room', label: 'My Room', icon: <UserSwitchOutlined /> },
]
