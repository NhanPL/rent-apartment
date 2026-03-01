export interface RouteConfig {
  key: string
  path: string
  label: string
}

export const routeItems: RouteConfig[] = [
  { key: 'dashboard', path: '/dashboard', label: 'Dashboard' },
  { key: 'buildings', path: '/buildings', label: 'Buildings' },
  { key: 'rooms', path: '/rooms', label: 'Rooms' },
  { key: 'tenants', path: '/tenants', label: 'Tenants' },
  { key: 'contracts', path: '/contracts', label: 'Contracts' },
  { key: 'utilities', path: '/utilities', label: 'Utilities' },
  { key: 'charges', path: '/charges', label: 'Charges' },
  { key: 'invoices', path: '/invoices', label: 'Invoices' },
  { key: 'payments', path: '/payments', label: 'Payments' },
]
