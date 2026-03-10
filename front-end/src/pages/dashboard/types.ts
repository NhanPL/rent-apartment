export type RoomStatus = 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE'
export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
export type TenantStatus = 'ACTIVE' | 'MOVED_OUT' | 'BLACKLIST'
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'OVERDUE'
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELLED'

export interface DashboardSummary {
  totalBuildings: number
  totalRooms: number
  occupiedRooms: number
  vacantRooms: number
  totalTenants: number
  overdueInvoices: number
  monthlyRevenue: number
  occupancyRate: number
}

export interface DashboardRoomStatusPoint {
  label: string
  value: number
  color: string
}

export interface DashboardMonthlyRevenuePoint {
  month: string
  billed: number
  collected: number
  unpaid: number
}

export interface DashboardBuildingDistributionPoint {
  buildingId: string
  buildingName: string
  totalRooms: number
  occupiedRooms: number
}

export interface DashboardRecentActivityItem {
  id: string
  tenantName: string
  roomCode: string
  buildingName: string
  contractCode: string
  createdAt: string
  status: TenantStatus
}

export interface DashboardUnpaidInvoiceItem {
  id: string
  roomCode: string
  buildingName: string
  month: string
  status: Extract<InvoiceStatus, 'ISSUED' | 'OVERDUE'>
  total: number
}

export interface DashboardData {
  summary: DashboardSummary
  roomStatusChart: DashboardRoomStatusPoint[]
  monthlyRevenueChart: DashboardMonthlyRevenuePoint[]
  buildingDistributionChart: DashboardBuildingDistributionPoint[]
  recentTenants: DashboardRecentActivityItem[]
  recentUnpaidInvoices: DashboardUnpaidInvoiceItem[]
}
