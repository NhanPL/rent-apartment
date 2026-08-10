export type ReportInvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID'
export type ReportSection = 'revenue' | 'debt' | 'occupancy' | 'reconciliation'

export interface ReportFilters {
  monthFrom: string
  monthTo: string
  buildingId?: string
  roomId?: string
  tenantId?: string
  status?: ReportInvoiceStatus
}

export type ReportDetailSortBy =
  | 'building'
  | 'month'
  | 'invoiceCount'
  | 'billed'
  | 'collected'
  | 'unpaid'
  | 'dueDate'
  | 'outstandingAmount'
  | 'totalRooms'
  | 'occupiedRooms'
  | 'vacantRooms'
  | 'activeTenants'
  | 'occupancyRate'
  | 'paymentDate'
  | 'entryType'
  | 'amount'

export interface ReportDetailParams {
  page?: number
  pageSize?: number
  sortBy?: ReportDetailSortBy
  sortOrder?: 'asc' | 'desc'
}

export type ReportDetailItem = RevenueBuildingRow | DebtReportRow | OccupancyReportRow | ReconciliationReportRow

export interface ReportBuildingOption {
  id: string
  name: string
}

export interface ReportRoomOption {
  id: string
  buildingId: string
  code: string
}

export interface ReportTenantOption {
  id: string
  fullName: string
}

export interface RevenueMonthRow {
  month: string
  invoiceCount: number
  billed: number
  collected: number
  grossPayments: number
  reversals: number
  unpaid: number
  voidInvoiceCount: number
  voidAmount: number
}

export interface RevenueBuildingRow {
  buildingId: string
  buildingName: string
  invoiceCount: number
  billed: number
  collected: number
  grossPayments: number
  reversals: number
  unpaid: number
  voidInvoiceCount: number
  voidAmount: number
}

export interface DebtReportRow {
  invoiceId: string
  buildingId: string
  buildingName: string
  roomId: string
  roomCode: string
  tenantName: string
  month: string
  status: Extract<ReportInvoiceStatus, 'ISSUED' | 'PARTIALLY_PAID'>
  isOverdue: boolean
  dueDate: string | null
  total: number
  paidAmount: number
  outstandingAmount: number
}

export interface DebtSummary {
  unpaidInvoices: number
  unpaidAmount: number
  overdueInvoices: number
  overdueAmount: number
}

export interface OccupancyReportRow {
  buildingId: string
  buildingName: string
  totalRooms: number
  occupiedRooms: number
  vacantRooms: number
  maintenanceRooms: number
  inactiveRooms: number
  activeTenants: number
  occupancyRate: number
}

export interface ReconciliationReportRow {
  paymentId: string
  invoiceId: string
  originalPaymentId: string | null
  buildingName: string
  roomCode: string
  tenantName: string
  month: string
  invoiceStatus: ReportInvoiceStatus
  entryType: 'PAYMENT' | 'REVERSAL'
  amount: number
  signedAmount: number
  paidAt: string
  referenceCode: string | null
  reversalReason: string | null
}

export interface ReportDefinitions {
  currency: 'VND'
  timezone: 'UTC'
  billed: string
  collected: string
  outstanding: string
  overdue: string
  void: string
}

export interface ReportsSummary {
  billed: number
  collected: number
  grossPayments: number
  reversals: number
  unpaid: number
  invoiceCount: number
  voidInvoiceCount: number
  voidAmount: number
  unpaidInvoices: number
  unpaidAmount: number
  overdueInvoices: number
  overdueAmount: number
  totalRooms: number
  occupiedRooms: number
  vacantRooms: number
  activeTenants: number
  occupancyRate: number
}

export interface ReportsData {
  filters: ReportFilters
  definitions: ReportDefinitions
  summary: ReportsSummary
  revenueByMonth: RevenueMonthRow[]
  revenueByBuilding: RevenueBuildingRow[]
  debtSummary: DebtSummary
  debtItems: DebtReportRow[]
  occupancyByBuilding: OccupancyReportRow[]
}
