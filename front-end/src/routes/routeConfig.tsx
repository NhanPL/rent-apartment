import type { ReactNode } from 'react'
import {
  BankOutlined,
  BarChartOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  FileTextOutlined,
  HomeOutlined,
  UserOutlined,
} from '@ant-design/icons'

export interface RouteConfig {
  key: string
  path: string
  label: string
  icon: ReactNode
}

export const routeItems: RouteConfig[] = [
  { key: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: <DashboardOutlined /> },
  { key: 'buildings', path: '/buildings', label: 'Buildings', icon: <BankOutlined /> },
  { key: 'rooms', path: '/rooms', label: 'Rooms', icon: <HomeOutlined /> },
  { key: 'tenants', path: '/tenants', label: 'Tenants', icon: <UserOutlined /> },
  { key: 'contracts', path: '/contracts', label: 'Contracts', icon: <FileTextOutlined /> },
  { key: 'payments', path: '/payments', label: 'Payments', icon: <CreditCardOutlined /> },
  { key: 'reports', path: '/reports', label: 'Reports', icon: <BarChartOutlined /> },
]
