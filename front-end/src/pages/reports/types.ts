export type ReportInvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'OVERDUE'
export type ReportSection = 'revenue' | 'debt' | 'occupancy'

export interface ReportFilters {
  monthFrom: string
  monthTo: string
  buildingId?: string
  status?: ReportInvoiceStatus
}

export interface ReportBuildingOption {
  id: string
  name: string
}

export interface RevenueMonthRow {
  month: string
  invoiceCount: number
  billed: number
  collected: number
  unpaid: number
}

export interface RevenueBuildingRow {
  buildingId: string
  buildingName: string
  invoiceCount: number
  billed: number
  collected: number
  unpaid: number
}

export interface DebtReportRow {
  invoiceId: string
  buildingId: string
  buildingName: string
  roomId: string
  roomCode: string
  tenantName: string
  month: string
  status: Extract<ReportInvoiceStatus, 'ISSUED' | 'OVERDUE'>
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

export interface ReportsSummary {
  billed: number
  collected: number
  unpaid: number
  invoiceCount: number
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
  summary: ReportsSummary
  revenueByMonth: RevenueMonthRow[]
  revenueByBuilding: RevenueBuildingRow[]
  debtSummary: DebtSummary
  debtItems: DebtReportRow[]
  occupancyByBuilding: OccupancyReportRow[]
}
