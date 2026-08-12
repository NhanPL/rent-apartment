import { API_ROUTES } from './apiRoutes'
import { apiRequest, apiRequestText } from './apiClient'
import type {
  DebtReportRow,
  DebtSummary,
  OccupancyReportRow,
  ReportBuildingOption,
  ReportRoomOption,
  ReportTenantOption,
  ReportFilters,
  ReportDetailItem,
  ReportDetailParams,
  ReportSection,
  ReportsData,
  ReportsSummary,
  RevenueBuildingRow,
  RevenueMonthRow,
  ReconciliationReportRow,
} from '../pages/reports/types'
import { appendPaginationParams, type PaginatedResponse } from './pagination'
import { listRooms, listTenants } from './invoicesService'

type NumericSummaryField = keyof ReportsSummary
type NumericRevenueField = 'invoiceCount' | 'billed' | 'grossPayments' | 'reversals' | 'collected' | 'unpaid' | 'voidInvoiceCount' | 'voidAmount'
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
type ReconciliationApiRow = Omit<ReconciliationReportRow, 'amount' | 'signedAmount'> & {
  amount: number | string
  signedAmount: number | string
}

interface ReportsApiData {
  filters: ReportFilters
  definitions: ReportsData['definitions']
  summary: ReportsApiSummary
  revenueByMonth: RevenueMonthApiRow[]
  debtSummary: DebtSummaryApi
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

  if (filters.roomId) params.set('room_id', filters.roomId)
  if (filters.tenantId) params.set('tenant_id', filters.tenantId)

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
  grossPayments: toNumber(row.grossPayments),
  reversals: toNumber(row.reversals),
  unpaid: toNumber(row.unpaid),
  invoiceCount: toNumber(row.invoiceCount),
  voidInvoiceCount: toNumber(row.voidInvoiceCount),
  voidAmount: toNumber(row.voidAmount),
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
  grossPayments: toNumber(row.grossPayments),
  reversals: toNumber(row.reversals),
  unpaid: toNumber(row.unpaid),
  voidInvoiceCount: toNumber(row.voidInvoiceCount),
  voidAmount: toNumber(row.voidAmount),
})

const toRevenueBuilding = (row: RevenueBuildingApiRow): RevenueBuildingRow => ({
  buildingId: row.buildingId,
  buildingName: row.buildingName,
  invoiceCount: toNumber(row.invoiceCount),
  billed: toNumber(row.billed),
  collected: toNumber(row.collected),
  grossPayments: toNumber(row.grossPayments),
  reversals: toNumber(row.reversals),
  unpaid: toNumber(row.unpaid),
  voidInvoiceCount: toNumber(row.voidInvoiceCount),
  voidAmount: toNumber(row.voidAmount),
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
  isOverdue: row.isOverdue,
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

const toReconciliationRow = (row: ReconciliationApiRow): ReconciliationReportRow => ({
  ...row,
  amount: toNumber(row.amount),
  signedAmount: toNumber(row.signedAmount),
})

const toReportsData = (data: ReportsApiData): ReportsData => ({
  filters: data.filters,
  definitions: data.definitions,
  summary: toReportsSummary(data.summary),
  revenueByMonth: data.revenueByMonth.map(toRevenueMonth),
  revenueByBuilding: [],
  debtSummary: toDebtSummary(data.debtSummary),
  debtItems: [],
  occupancyByBuilding: [],
})

export async function getReportsData(filters: ReportFilters): Promise<ReportsData> {
  const params = buildReportsParams(filters)
  const data = await apiRequest<ReportsApiData>(`${API_ROUTES.reports.summary}?${params.toString()}`)
  return toReportsData(data)
}

export async function getReportDetails(
  filters: ReportFilters,
  section: ReportSection,
  pagination: ReportDetailParams,
): Promise<PaginatedResponse<ReportDetailItem>> {
  const params = buildReportsParams(filters, section)
  appendPaginationParams(params, pagination)
  const response = await apiRequest<PaginatedResponse<RevenueBuildingApiRow | DebtApiRow | OccupancyApiRow | ReconciliationApiRow>>(
    `${API_ROUTES.reports.details}?${params.toString()}`,
  )
  const items = section === 'revenue'
    ? (response.items as RevenueBuildingApiRow[]).map(toRevenueBuilding)
    : section === 'debt'
      ? (response.items as DebtApiRow[]).map(toDebtRow)
      : section === 'occupancy'
        ? (response.items as OccupancyApiRow[]).map(toOccupancyRow)
        : (response.items as ReconciliationApiRow[]).map(toReconciliationRow)
  return { ...response, items }
}

export async function exportReportsCsv(filters: ReportFilters, section: ReportSection, locale: 'en' | 'vi'): Promise<string> {
  const params = buildReportsParams(filters, section)
  params.set('locale', locale)
  return apiRequestText(`${API_ROUTES.reports.exportCsv}?${params.toString()}`)
}

export async function listReportBuildings(): Promise<ReportBuildingOption[]> {
  const rows = await apiRequest<Array<ReportBuildingOption & { units?: number }>>(API_ROUTES.buildings.list)
  return rows.map((row) => ({ id: row.id, name: row.name }))
}

export async function listReportRooms(): Promise<ReportRoomOption[]> {
  return (await listRooms()).map((room) => ({ id: room.id, buildingId: room.building_id, code: room.code }))
}

export async function listReportTenants(): Promise<ReportTenantOption[]> {
  return (await listTenants()).map((tenant) => ({ id: tenant.id, fullName: tenant.full_name }))
}
