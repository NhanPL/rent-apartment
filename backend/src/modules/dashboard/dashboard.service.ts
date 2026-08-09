import { AppError } from '../../shared/errors/app-error';
import { loadDashboardRows } from './dashboard.repository';
import { toDatabaseNumber, type DatabaseNumeric } from '../../shared/types/database';

export interface DashboardFilters {
  month?: string;
  buildingId?: string;
}

const roomStatusColors = {
  occupied: '#1677ff',
  vacant: '#52c41a',
  maintenance: '#faad14',
  inactive: '#bfbfbf'
};

const toNumber = (value: DatabaseNumeric | null | undefined): number => toDatabaseNumber(value);

const normalizeMonth = (value?: string): string => {
  if (!value) {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value);
  if (!match) {
    throw new AppError(400, 'month must use YYYY-MM or YYYY-MM-DD format', 'VALIDATION_ERROR');
  }
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new AppError(400, 'month must be between 01 and 12', 'VALIDATION_ERROR');
  }
  return `${match[1]}-${match[2]}-01`;
};

export const getDashboardSummary = async (managerId: string, filters: DashboardFilters) => {
  const data = await loadDashboardRows(managerId, {
    month: normalizeMonth(filters.month),
    buildingId: filters.buildingId
  });
  const totalRooms = data.portfolioStats.total_rooms;
  const occupiedRooms = data.portfolioStats.occupied_rooms;

  return {
    summary: {
      totalBuildings: data.portfolioStats.total_buildings,
      totalRooms,
      occupiedRooms,
      vacantRooms: data.portfolioStats.vacant_rooms,
      totalTenants: data.totalTenants,
      overdueInvoices: data.invoiceBalances.overdue_invoices,
      overdueAmount: toNumber(data.invoiceBalances.overdue_amount),
      unpaidInvoices: data.invoiceBalances.unpaid_invoices,
      unpaidAmount: toNumber(data.invoiceBalances.unpaid_amount),
      monthlyRevenue: data.monthlyRevenue,
      occupancyRate: totalRooms === 0 ? 0 : Math.round((occupiedRooms / totalRooms) * 100)
    },
    roomStatusChart: [
      { label: 'Occupied', value: occupiedRooms, color: roomStatusColors.occupied },
      { label: 'Vacant', value: data.portfolioStats.vacant_rooms, color: roomStatusColors.vacant },
      { label: 'Maintenance', value: data.portfolioStats.maintenance_rooms, color: roomStatusColors.maintenance },
      { label: 'Inactive', value: data.portfolioStats.inactive_rooms, color: roomStatusColors.inactive }
    ],
    monthlyRevenueChart: data.monthlyRevenueChart.map((item) => ({
      month: item.month,
      billed: toNumber(item.billed),
      collected: toNumber(item.collected),
      unpaid: toNumber(item.unpaid)
    })),
    buildingDistributionChart: data.buildingDistribution.map((item) => ({
      buildingId: item.building_id,
      buildingName: item.building_name,
      totalRooms: item.total_rooms,
      occupiedRooms: item.occupied_rooms
    })),
    recentTenants: data.recentTenants.map((tenant) => ({
      id: tenant.id,
      tenantName: tenant.full_name,
      roomCode: tenant.room_code ?? '-',
      buildingName: tenant.building_name ?? '-',
      contractCode: tenant.contract_code ?? '-',
      createdAt: tenant.created_at,
      status: tenant.status
    })),
    recentUnpaidInvoices: data.recentUnpaidInvoices.map((invoice) => ({
      id: invoice.id,
      roomCode: invoice.room_code,
      buildingName: invoice.building_name,
      month: invoice.month,
      status: invoice.status,
      total: toNumber(invoice.total)
    }))
  };
};
