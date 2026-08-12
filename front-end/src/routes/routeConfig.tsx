import type { ReactNode } from 'react'
import { BankOutlined, BarChartOutlined, CreditCardOutlined, DollarOutlined, FileSyncOutlined, FileTextOutlined, DashboardOutlined, FormOutlined, ImportOutlined, LaptopOutlined, ProfileOutlined, SafetyCertificateOutlined, ThunderboltOutlined, UserSwitchOutlined, UserOutlined } from '@ant-design/icons'

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
  { key: 'audit-logs', path: '/audit-logs', label: 'Audit Log' },
  { key: 'imports', path: '/imports', label: 'Data Import' },
  { key: 'my-room', path: '/my-room', label: 'My Room' },
  { key: 'sessions', path: '/sessions', label: 'Sessions & Devices' },
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
  { key: 'audit-logs', path: '/audit-logs', label: 'Audit Log', icon: <SafetyCertificateOutlined /> },
  { key: 'imports', path: '/imports', label: 'Data Import', icon: <ImportOutlined /> },
  { key: 'my-room', path: '/my-room', label: 'My Room', icon: <UserSwitchOutlined /> },
  { key: 'sessions', path: '/sessions', label: 'Sessions & Devices', icon: <LaptopOutlined /> },
]
