import type {
  ContractStatus,
  DashboardData,
  InvoiceStatus,
  PaymentStatus,
  RoomStatus,
  TenantStatus,
} from '../pages/dashboard/types'

interface BuildingRow {
  id: string
  name: string
}

interface RoomRow {
  id: string
  building_id: string
  code: string
  status: RoomStatus
}

interface ContractRow {
  id: string
  room_id: string
  contract_code: string
  status: ContractStatus
}

interface TenantRow {
  id: string
  full_name: string
  created_at: string
  status: TenantStatus
}

interface ContractTenantRow {
  contract_id: string
  tenant_id: string
  left_at: string | null
}

interface InvoiceRow {
  id: string
  contract_id: string
  room_id: string
  month: string
  status: InvoiceStatus
  total: number
}

interface PaymentRow {
  id: string
  invoice_id: string
  status: PaymentStatus
  amount: number
  paid_at: string | null
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const buildings: BuildingRow[] = [
  { id: 'b-1', name: 'Sunrise Riverside' },
  { id: 'b-2', name: 'Lotus Garden' },
  { id: 'b-3', name: 'Riverside Park' },
]

const rooms: RoomRow[] = [
  { id: 'r-101', building_id: 'b-1', code: 'A-101', status: 'ACTIVE' },
  { id: 'r-102', building_id: 'b-1', code: 'A-102', status: 'ACTIVE' },
  { id: 'r-103', building_id: 'b-1', code: 'A-103', status: 'MAINTENANCE' },
  { id: 'r-201', building_id: 'b-2', code: 'B-201', status: 'ACTIVE' },
  { id: 'r-202', building_id: 'b-2', code: 'B-202', status: 'ACTIVE' },
  { id: 'r-203', building_id: 'b-2', code: 'B-203', status: 'INACTIVE' },
  { id: 'r-301', building_id: 'b-3', code: 'C-301', status: 'ACTIVE' },
  { id: 'r-302', building_id: 'b-3', code: 'C-302', status: 'ACTIVE' },
]

const contracts: ContractRow[] = [
  { id: 'c-1', room_id: 'r-101', contract_code: 'HD-001', status: 'ACTIVE' },
  { id: 'c-2', room_id: 'r-102', contract_code: 'HD-002', status: 'ACTIVE' },
  { id: 'c-3', room_id: 'r-201', contract_code: 'HD-003', status: 'ACTIVE' },
  { id: 'c-4', room_id: 'r-301', contract_code: 'HD-004', status: 'ACTIVE' },
  { id: 'c-5', room_id: 'r-202', contract_code: 'HD-005', status: 'ENDED' },
]

const contractTenants: ContractTenantRow[] = [
  { contract_id: 'c-1', tenant_id: 't-1', left_at: null },
  { contract_id: 'c-2', tenant_id: 't-2', left_at: null },
  { contract_id: 'c-3', tenant_id: 't-3', left_at: null },
  { contract_id: 'c-4', tenant_id: 't-4', left_at: null },
  { contract_id: 'c-5', tenant_id: 't-5', left_at: '2025-02-12' },
]

const tenants: TenantRow[] = [
  { id: 't-1', full_name: 'Nguyen Minh Anh', status: 'ACTIVE', created_at: '2025-03-08T08:00:00.000Z' },
  { id: 't-2', full_name: 'Tran Gia Bao', status: 'ACTIVE', created_at: '2025-03-06T04:00:00.000Z' },
  { id: 't-3', full_name: 'Le Thanh Binh', status: 'ACTIVE', created_at: '2025-03-04T06:30:00.000Z' },
  { id: 't-4', full_name: 'Pham Quynh Nhu', status: 'ACTIVE', created_at: '2025-03-02T09:45:00.000Z' },
  { id: 't-5', full_name: 'Hoang Duy Khanh', status: 'MOVED_OUT', created_at: '2025-02-10T03:10:00.000Z' },
]

const invoices: InvoiceRow[] = [
  { id: 'inv-10', contract_id: 'c-1', room_id: 'r-101', month: '2024-10-01', status: 'PAID', total: 5400000 },
  { id: 'inv-11', contract_id: 'c-2', room_id: 'r-102', month: '2024-11-01', status: 'PAID', total: 5500000 },
  { id: 'inv-12', contract_id: 'c-3', room_id: 'r-201', month: '2024-12-01', status: 'PAID', total: 6100000 },
  { id: 'inv-01', contract_id: 'c-1', room_id: 'r-101', month: '2025-01-01', status: 'PAID', total: 5600000 },
  { id: 'inv-02', contract_id: 'c-2', room_id: 'r-102', month: '2025-01-01', status: 'PAID', total: 5600000 },
  { id: 'inv-03', contract_id: 'c-3', room_id: 'r-201', month: '2025-01-01', status: 'PAID', total: 6200000 },
  { id: 'inv-04', contract_id: 'c-4', room_id: 'r-301', month: '2025-01-01', status: 'PAID', total: 7000000 },
  { id: 'inv-05', contract_id: 'c-1', room_id: 'r-101', month: '2025-02-01', status: 'PAID', total: 5600000 },
  { id: 'inv-06', contract_id: 'c-2', room_id: 'r-102', month: '2025-02-01', status: 'ISSUED', total: 5600000 },
  { id: 'inv-07', contract_id: 'c-3', room_id: 'r-201', month: '2025-02-01', status: 'OVERDUE', total: 6200000 },
  { id: 'inv-08', contract_id: 'c-4', room_id: 'r-301', month: '2025-02-01', status: 'PAID', total: 7000000 },
  { id: 'inv-09', contract_id: 'c-1', room_id: 'r-101', month: '2025-03-01', status: 'ISSUED', total: 5600000 },
]

const payments: PaymentRow[] = [
  { id: 'pay-1', invoice_id: 'inv-01', status: 'SUCCEEDED', amount: 5600000, paid_at: '2025-01-03T09:00:00.000Z' },
  { id: 'pay-2', invoice_id: 'inv-02', status: 'SUCCEEDED', amount: 5600000, paid_at: '2025-01-05T10:00:00.000Z' },
  { id: 'pay-3', invoice_id: 'inv-03', status: 'SUCCEEDED', amount: 6200000, paid_at: '2025-01-06T11:00:00.000Z' },
  { id: 'pay-4', invoice_id: 'inv-04', status: 'SUCCEEDED', amount: 7000000, paid_at: '2025-01-10T12:00:00.000Z' },
  { id: 'pay-5', invoice_id: 'inv-05', status: 'SUCCEEDED', amount: 5600000, paid_at: '2025-02-04T09:30:00.000Z' },
  { id: 'pay-6', invoice_id: 'inv-08', status: 'SUCCEEDED', amount: 7000000, paid_at: '2025-02-07T08:20:00.000Z' },
  { id: 'pay-7', invoice_id: 'inv-09', status: 'PENDING', amount: 5600000, paid_at: null },
]

const currencyFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' })

function monthKey(value: string) {
  return value.slice(0, 7)
}

export async function getDashboardData(): Promise<DashboardData> {
  await wait(360)

  const activeContractByRoom = new Map(
    contracts.filter((contract) => contract.status === 'ACTIVE').map((contract) => [contract.room_id, contract]),
  )

  const totalRooms = rooms.length
  const occupiedRooms = activeContractByRoom.size
  const vacantRooms = rooms.filter((room) => room.status === 'ACTIVE' && !activeContractByRoom.has(room.id)).length

  const nowMonth = '2025-03'
  const monthlyRevenue = payments
    .filter((payment) => payment.status === 'SUCCEEDED' && payment.paid_at?.startsWith(nowMonth))
    .reduce((sum, payment) => sum + payment.amount, 0)

  const statusCounts = {
    occupied: occupiedRooms,
    vacant: vacantRooms,
    maintenance: rooms.filter((room) => room.status === 'MAINTENANCE').length,
    inactive: rooms.filter((room) => room.status === 'INACTIVE').length,
  }

  const months = Array.from(new Set(invoices.map((invoice) => monthKey(invoice.month)))).sort()

  const monthlyRevenueChart = months.map((month) => {
    const monthlyInvoices = invoices.filter((invoice) => monthKey(invoice.month) === month)
    const billed = monthlyInvoices.reduce((sum, invoice) => sum + invoice.total, 0)
    const collected = monthlyInvoices
      .filter((invoice) => invoice.status === 'PAID')
      .reduce((sum, invoice) => sum + invoice.total, 0)
    const unpaid = monthlyInvoices
      .filter((invoice) => invoice.status === 'ISSUED' || invoice.status === 'OVERDUE')
      .reduce((sum, invoice) => sum + invoice.total, 0)

    return {
      month: `${monthFormatter.format(new Date(`${month}-01`))} ${month.slice(2, 4)}`,
      billed,
      collected,
      unpaid,
    }
  })

  const buildingDistributionChart = buildings
    .map((building) => {
      const roomsInBuilding = rooms.filter((room) => room.building_id === building.id)
      const occupiedInBuilding = roomsInBuilding.filter((room) => activeContractByRoom.has(room.id)).length

      return {
        buildingId: building.id,
        buildingName: building.name,
        totalRooms: roomsInBuilding.length,
        occupiedRooms: occupiedInBuilding,
      }
    })
    .sort((left, right) => right.totalRooms - left.totalRooms)

  const recentTenants = [...tenants]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 5)
    .map((tenant) => {
      const activeContractTenant = contractTenants.find((item) => item.tenant_id === tenant.id && item.left_at === null)
      const contract = contracts.find((item) => item.id === activeContractTenant?.contract_id)
      const room = rooms.find((item) => item.id === contract?.room_id)
      const building = buildings.find((item) => item.id === room?.building_id)

      return {
        id: tenant.id,
        tenantName: tenant.full_name,
        roomCode: room?.code ?? '-',
        buildingName: building?.name ?? '-',
        contractCode: contract?.contract_code ?? '-',
        createdAt: tenant.created_at,
        status: tenant.status,
      }
    })

  const recentUnpaidInvoices = invoices
    .filter((invoice) => invoice.status === 'ISSUED' || invoice.status === 'OVERDUE')
    .sort((left, right) => new Date(right.month).getTime() - new Date(left.month).getTime())
    .slice(0, 5)
    .map((invoice) => {
      const room = rooms.find((item) => item.id === invoice.room_id)
      const building = buildings.find((item) => item.id === room?.building_id)

      return {
        id: invoice.id,
        roomCode: room?.code ?? '-',
        buildingName: building?.name ?? '-',
        month: invoice.month,
        status: invoice.status,
        total: invoice.total,
      }
    })

  return {
    summary: {
      totalBuildings: buildings.length,
      totalRooms,
      occupiedRooms,
      vacantRooms,
      totalTenants: tenants.length,
      overdueInvoices: invoices.filter((invoice) => invoice.status === 'OVERDUE').length,
      monthlyRevenue,
      occupancyRate: totalRooms === 0 ? 0 : Math.round((occupiedRooms / totalRooms) * 100),
    },
    roomStatusChart: [
      { label: 'Occupied', value: statusCounts.occupied, color: '#1677ff' },
      { label: 'Vacant', value: statusCounts.vacant, color: '#52c41a' },
      { label: 'Maintenance', value: statusCounts.maintenance, color: '#faad14' },
      { label: 'Inactive', value: statusCounts.inactive, color: '#bfbfbf' },
    ],
    monthlyRevenueChart,
    buildingDistributionChart,
    recentTenants,
    recentUnpaidInvoices,
  }
}

export const dashboardFormatters = {
  currency: (value: number) => currencyFormatter.format(value),
}
