import { API_ROUTES } from './apiRoutes'
import { apiRequest, apiRequestText } from './apiClient'
import type {
  DebtReportRow,
  DebtSummary,
  OccupancyReportRow,
  ReportBuildingOption,
  ReportFilters,
  ReportSection,
  ReportsData,
  ReportsSummary,
  RevenueBuildingRow,
  RevenueMonthRow,
} from '../pages/reports/types'

type NumericSummaryField = keyof ReportsSummary
type NumericRevenueField = 'invoiceCount' | 'billed' | 'collected' | 'unpaid'
type NumericDebtField = 'total' | 'paidAmount' | 'outstandingAmount'
type NumericDebtSummaryField = keyof DebtSummary
type NumericOccupancyField =
  | 'totalRooms'
  | 'occupiedRooms'
  | 'vacantRooms'
  | 'maintenanceRooms'
  | 'inactiveRooms'
  | 'activeTenants'
  | 'occupancyRate'

type ReportsApiSummary = Omit<ReportsSummary, NumericSummaryField> & Record<NumericSummaryField, number | string | null>
type RevenueMonthApiRow = Omit<RevenueMonthRow, NumericRevenueField> & Record<NumericRevenueField, number | string | null>
type RevenueBuildingApiRow = Omit<RevenueBuildingRow, NumericRevenueField> & Record<NumericRevenueField, number | string | null>
type DebtApiRow = Omit<DebtReportRow, NumericDebtField> & Record<NumericDebtField, number | string | null>
type DebtSummaryApi = Omit<DebtSummary, NumericDebtSummaryField> & Record<NumericDebtSummaryField, number | string | null>
type OccupancyApiRow = Omit<OccupancyReportRow, NumericOccupancyField> & Record<NumericOccupancyField, number | string | null>

interface ReportsApiData {
  filters: ReportFilters
  summary: ReportsApiSummary
  revenueByMonth: RevenueMonthApiRow[]
  revenueByBuilding: RevenueBuildingApiRow[]
  debtSummary: DebtSummaryApi
  debtItems: DebtApiRow[]
  occupancyByBuilding: OccupancyApiRow[]
}

const toNumber = (value: unknown): number => {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue : 0
}

const buildReportsParams = (filters: ReportFilters, section?: ReportSection) => {
  const params = new URLSearchParams({
    month_from: filters.monthFrom,
    month_to: filters.monthTo,
  })

  if (filters.buildingId) {
    params.set('building_id', filters.buildingId)
  }

  if (filters.status) {
    params.set('status', filters.status)
  }

  if (section) {
    params.set('section', section)
  }

  return params
}

const toReportsSummary = (row: ReportsApiSummary): ReportsSummary => ({
  billed: toNumber(row.billed),
  collected: toNumber(row.collected),
  unpaid: toNumber(row.unpaid),
  invoiceCount: toNumber(row.invoiceCount),
  unpaidInvoices: toNumber(row.unpaidInvoices),
  unpaidAmount: toNumber(row.unpaidAmount),
  overdueInvoices: toNumber(row.overdueInvoices),
  overdueAmount: toNumber(row.overdueAmount),
  totalRooms: toNumber(row.totalRooms),
  occupiedRooms: toNumber(row.occupiedRooms),
  vacantRooms: toNumber(row.vacantRooms),
  activeTenants: toNumber(row.activeTenants),
  occupancyRate: toNumber(row.occupancyRate),
})

const toRevenueMonth = (row: RevenueMonthApiRow): RevenueMonthRow => ({
  month: row.month,
  invoiceCount: toNumber(row.invoiceCount),
  billed: toNumber(row.billed),
  collected: toNumber(row.collected),
  unpaid: toNumber(row.unpaid),
})

const toRevenueBuilding = (row: RevenueBuildingApiRow): RevenueBuildingRow => ({
  buildingId: row.buildingId,
  buildingName: row.buildingName,
  invoiceCount: toNumber(row.invoiceCount),
  billed: toNumber(row.billed),
  collected: toNumber(row.collected),
  unpaid: toNumber(row.unpaid),
})

const toDebtRow = (row: DebtApiRow): DebtReportRow => ({
  invoiceId: row.invoiceId,
  buildingId: row.buildingId,
  buildingName: row.buildingName,
  roomId: row.roomId,
  roomCode: row.roomCode,
  tenantName: row.tenantName,
  month: row.month,
  status: row.status,
  dueDate: row.dueDate,
  total: toNumber(row.total),
  paidAmount: toNumber(row.paidAmount),
  outstandingAmount: toNumber(row.outstandingAmount),
})

const toDebtSummary = (row: DebtSummaryApi): DebtSummary => ({
  unpaidInvoices: toNumber(row.unpaidInvoices),
  unpaidAmount: toNumber(row.unpaidAmount),
  overdueInvoices: toNumber(row.overdueInvoices),
  overdueAmount: toNumber(row.overdueAmount),
})

const toOccupancyRow = (row: OccupancyApiRow): OccupancyReportRow => ({
  buildingId: row.buildingId,
  buildingName: row.buildingName,
  totalRooms: toNumber(row.totalRooms),
  occupiedRooms: toNumber(row.occupiedRooms),
  vacantRooms: toNumber(row.vacantRooms),
  maintenanceRooms: toNumber(row.maintenanceRooms),
  inactiveRooms: toNumber(row.inactiveRooms),
  activeTenants: toNumber(row.activeTenants),
  occupancyRate: toNumber(row.occupancyRate),
})

const toReportsData = (data: ReportsApiData): ReportsData => ({
  filters: data.filters,
  summary: toReportsSummary(data.summary),
  revenueByMonth: data.revenueByMonth.map(toRevenueMonth),
  revenueByBuilding: data.revenueByBuilding.map(toRevenueBuilding),
  debtSummary: toDebtSummary(data.debtSummary),
  debtItems: data.debtItems.map(toDebtRow),
  occupancyByBuilding: data.occupancyByBuilding.map(toOccupancyRow),
})

export async function getReportsData(filters: ReportFilters): Promise<ReportsData> {
  const params = buildReportsParams(filters)
  const data = await apiRequest<ReportsApiData>(`${API_ROUTES.reports.summary}?${params.toString()}`)
  return toReportsData(data)
}

export async function exportReportsCsv(filters: ReportFilters, section: ReportSection): Promise<string> {
  const params = buildReportsParams(filters, section)
  return apiRequestText(`${API_ROUTES.reports.exportCsv}?${params.toString()}`)
}

export async function listReportBuildings(): Promise<ReportBuildingOption[]> {
  const rows = await apiRequest<Array<ReportBuildingOption & { units?: number }>>(API_ROUTES.buildings.list)
  return rows.map((row) => ({ id: row.id, name: row.name }))
}
