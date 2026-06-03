import { API_ROUTES } from './apiRoutes'
import { apiRequest } from './apiClient'
import type {
  DashboardBuildingDistributionPoint,
  DashboardBuildingOption,
  DashboardData,
  DashboardFilters,
  DashboardMonthlyRevenuePoint,
  DashboardRecentActivityItem,
  DashboardRoomStatusPoint,
  DashboardSummary,
  DashboardUnpaidInvoiceItem,
} from '../pages/dashboard/types'

type NumericSummaryField = keyof DashboardSummary
type DashboardApiSummary = Omit<DashboardSummary, NumericSummaryField> &
  Record<NumericSummaryField, number | string | null>

type DashboardApiMonthlyRevenuePoint = Omit<DashboardMonthlyRevenuePoint, 'billed' | 'collected' | 'unpaid'> & {
  billed: number | string | null
  collected: number | string | null
  unpaid: number | string | null
}

type DashboardApiBuildingDistributionPoint = Omit<DashboardBuildingDistributionPoint, 'totalRooms' | 'occupiedRooms'> & {
  totalRooms: number | string | null
  occupiedRooms: number | string | null
}

type DashboardApiRoomStatusPoint = Omit<DashboardRoomStatusPoint, 'value'> & {
  value: number | string | null
}

type DashboardApiUnpaidInvoiceItem = Omit<DashboardUnpaidInvoiceItem, 'total'> & {
  total: number | string | null
}

interface DashboardApiData {
  summary: DashboardApiSummary
  roomStatusChart: DashboardApiRoomStatusPoint[]
  monthlyRevenueChart: DashboardApiMonthlyRevenuePoint[]
  buildingDistributionChart: DashboardApiBuildingDistributionPoint[]
  recentTenants: DashboardRecentActivityItem[]
  recentUnpaidInvoices: DashboardApiUnpaidInvoiceItem[]
}

const currencyFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' })

const toNumber = (value: unknown): number => {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue : 0
}

const formatChartMonth = (value: string): string => {
  const monthKey = value.slice(0, 7)
  const date = new Date(`${monthKey}-01T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    return monthKey
  }

  return `${monthFormatter.format(date)} ${monthKey.slice(2, 4)}`
}

const toDashboardData = (data: DashboardApiData): DashboardData => ({
  summary: {
    totalBuildings: toNumber(data.summary.totalBuildings),
    totalRooms: toNumber(data.summary.totalRooms),
    occupiedRooms: toNumber(data.summary.occupiedRooms),
    vacantRooms: toNumber(data.summary.vacantRooms),
    totalTenants: toNumber(data.summary.totalTenants),
    overdueInvoices: toNumber(data.summary.overdueInvoices),
    overdueAmount: toNumber(data.summary.overdueAmount),
    unpaidInvoices: toNumber(data.summary.unpaidInvoices),
    unpaidAmount: toNumber(data.summary.unpaidAmount),
    monthlyRevenue: toNumber(data.summary.monthlyRevenue),
    occupancyRate: toNumber(data.summary.occupancyRate),
  },
  roomStatusChart: data.roomStatusChart.map((item) => ({
    ...item,
    value: toNumber(item.value),
  })),
  monthlyRevenueChart: data.monthlyRevenueChart.map((item) => ({
    month: formatChartMonth(item.month),
    billed: toNumber(item.billed),
    collected: toNumber(item.collected),
    unpaid: toNumber(item.unpaid),
  })),
  buildingDistributionChart: data.buildingDistributionChart.map((item) => ({
    ...item,
    totalRooms: toNumber(item.totalRooms),
    occupiedRooms: toNumber(item.occupiedRooms),
  })),
  recentTenants: data.recentTenants,
  recentUnpaidInvoices: data.recentUnpaidInvoices.map((item) => ({
    ...item,
    total: toNumber(item.total),
  })),
})

export async function getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  const params = new URLSearchParams({ month: filters.month })
  if (filters.buildingId) {
    params.set('building_id', filters.buildingId)
  }

  const data = await apiRequest<DashboardApiData>(`${API_ROUTES.dashboard.summary}?${params.toString()}`)
  return toDashboardData(data)
}

export async function listDashboardBuildings(): Promise<DashboardBuildingOption[]> {
  const rows = await apiRequest<Array<DashboardBuildingOption & { units?: number }>>(API_ROUTES.buildings.list)
  return rows.map((row) => ({ id: row.id, name: row.name }))
}

export const dashboardFormatters = {
  currency: (value: number) => currencyFormatter.format(value),
}
