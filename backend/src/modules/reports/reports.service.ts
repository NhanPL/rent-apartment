import { createCsv, sanitizeCsvFilename } from '../../shared/utils/csv';
import { loadReportRows, type ReportsFilters } from './reports.repository';

export type { ReportsFilters } from './reports.repository';

export type ReportSection = 'revenue' | 'debt' | 'occupancy';

export const getReportsData = async (managerId: string, filters: ReportsFilters) => {
  const data = await loadReportRows(managerId, filters);
  const revenueSummary = data.revenueByMonth.reduce(
    (acc, item) => ({
      billed: acc.billed + item.billed,
      collected: acc.collected + item.collected,
      grossPayments: acc.grossPayments + item.grossPayments,
      reversals: acc.reversals + item.reversals,
      unpaid: acc.unpaid + item.unpaid,
      invoiceCount: acc.invoiceCount + item.invoiceCount
    }),
    { billed: 0, collected: 0, grossPayments: 0, reversals: 0, unpaid: 0, invoiceCount: 0 }
  );
  const debtSummary = data.debtItems.reduce(
    (acc, item) => ({
      unpaidInvoices: acc.unpaidInvoices + 1,
      unpaidAmount: acc.unpaidAmount + item.outstandingAmount,
      overdueInvoices: acc.overdueInvoices + (item.isOverdue ? 1 : 0),
      overdueAmount: acc.overdueAmount + (item.isOverdue ? item.outstandingAmount : 0)
    }),
    { unpaidInvoices: 0, unpaidAmount: 0, overdueInvoices: 0, overdueAmount: 0 }
  );
  const occupancyTotals = data.occupancyByBuilding.reduce(
    (acc, item) => ({
      totalRooms: acc.totalRooms + item.totalRooms,
      occupiedRooms: acc.occupiedRooms + item.occupiedRooms,
      vacantRooms: acc.vacantRooms + item.vacantRooms,
      activeTenants: acc.activeTenants + item.activeTenants
    }),
    { totalRooms: 0, occupiedRooms: 0, vacantRooms: 0, activeTenants: 0 }
  );

  return {
    ...data,
    summary: {
      ...revenueSummary,
      ...debtSummary,
      ...occupancyTotals,
      occupancyRate: occupancyTotals.totalRooms === 0
        ? 0
        : Math.round((occupancyTotals.occupiedRooms / occupancyTotals.totalRooms) * 100)
    },
    debtSummary
  };
};

export const getReportsCsv = async (
  managerId: string,
  filters: ReportsFilters,
  section: ReportSection
) => {
  const data = await getReportsData(managerId, filters);
  if (section === 'revenue') {
    return {
      filename: sanitizeCsvFilename(`reports-revenue-${data.filters.monthFrom.slice(0, 7)}-${data.filters.monthTo.slice(0, 7)}.csv`),
      content: createCsv(
        ['Month', 'Invoice count', 'Billed', 'Gross payments', 'Reversals', 'Net payments', 'Unpaid'],
        data.revenueByMonth.map((item) => [
          item.month, item.invoiceCount, item.billed, item.grossPayments,
          item.reversals, item.collected, item.unpaid
        ])
      )
    };
  }
  if (section === 'debt') {
    return {
      filename: sanitizeCsvFilename(`reports-debt-${data.filters.monthFrom.slice(0, 7)}-${data.filters.monthTo.slice(0, 7)}.csv`),
      content: createCsv(
        ['Building', 'Room', 'Tenant', 'Month', 'Status', 'Overdue', 'Due date', 'Total', 'Paid', 'Outstanding'],
        data.debtItems.map((item) => [
          item.buildingName, item.roomCode, item.tenantName, item.month.slice(0, 7), item.status,
          item.isOverdue ? 'Yes' : 'No', item.dueDate ?? '', item.total, item.paidAmount, item.outstandingAmount
        ])
      )
    };
  }
  return {
    filename: sanitizeCsvFilename(`reports-occupancy-${data.filters.monthTo.slice(0, 7)}.csv`),
    content: createCsv(
      ['Building', 'Total rooms', 'Occupied', 'Vacant', 'Maintenance', 'Inactive', 'Active tenants', 'Occupancy rate'],
      data.occupancyByBuilding.map((item) => [
        item.buildingName, item.totalRooms, item.occupiedRooms, item.vacantRooms,
        item.maintenanceRooms, item.inactiveRooms, item.activeTenants, `${item.occupancyRate}%`
      ])
    )
  };
};
