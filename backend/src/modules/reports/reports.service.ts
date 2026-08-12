import { createCsv, sanitizeCsvFilename } from '../../shared/utils/csv';
import {
  loadReportDetailRows,
  loadReportRows,
  loadReportSummaryRows,
  type ReportDetailPagination,
  type ReportsFilters
} from './reports.repository';

export type { ReportsFilters } from './reports.repository';

export type ReportSection = 'revenue' | 'debt' | 'occupancy' | 'reconciliation';
export type ReportLocale = 'en' | 'vi';

const csvLabels = {
  en: {
    yes: 'Yes', no: 'No', revenueFilename: 'reports-revenue', debtFilename: 'reports-debt',
    reconciliationFilename: 'reports-reconciliation', occupancyFilename: 'reports-occupancy',
    revenue: ['Month', 'Invoice count', 'Billed (VND)', 'Gross payments (VND)', 'Reversals (VND)', 'Net payments (VND)', 'Unpaid (VND)', 'Void invoices', 'Void amount (VND)'],
    debt: ['Building', 'Room', 'Tenant', 'Month', 'Status', 'Overdue', 'Due date', 'Total (VND)', 'Paid (VND)', 'Outstanding (VND)'],
    reconciliation: ['Payment ID', 'Invoice ID', 'Original payment ID', 'Building', 'Room', 'Tenant', 'Invoice month', 'Invoice status', 'Entry type', 'Amount (VND)', 'Net amount (VND)', 'Paid at UTC', 'Reference', 'Reversal reason'],
    occupancy: ['Building', 'Total rooms', 'Occupied', 'Vacant', 'Maintenance', 'Inactive', 'Active tenants', 'Occupancy rate']
  },
  vi: {
    yes: 'Có', no: 'Không', revenueFilename: 'bao-cao-doanh-thu', debtFilename: 'bao-cao-cong-no',
    reconciliationFilename: 'bao-cao-doi-soat', occupancyFilename: 'bao-cao-cong-suat',
    revenue: ['Tháng', 'Số hóa đơn', 'Đã lập hóa đơn (VND)', 'Thanh toán gộp (VND)', 'Hoàn trả (VND)', 'Thanh toán ròng (VND)', 'Chưa thanh toán (VND)', 'Hóa đơn đã hủy', 'Giá trị đã hủy (VND)'],
    debt: ['Tòa nhà', 'Phòng', 'Người thuê', 'Tháng', 'Trạng thái', 'Quá hạn', 'Hạn thanh toán', 'Tổng tiền (VND)', 'Đã thanh toán (VND)', 'Còn lại (VND)'],
    reconciliation: ['Mã thanh toán', 'Mã hóa đơn', 'Mã thanh toán gốc', 'Tòa nhà', 'Phòng', 'Người thuê', 'Tháng hóa đơn', 'Trạng thái hóa đơn', 'Loại bút toán', 'Số tiền (VND)', 'Số tiền ròng (VND)', 'Thời gian thanh toán UTC', 'Mã tham chiếu', 'Lý do hoàn trả'],
    occupancy: ['Tòa nhà', 'Tổng số phòng', 'Đang thuê', 'Còn trống', 'Bảo trì', 'Ngừng hoạt động', 'Người thuê đang ở', 'Tỷ lệ lấp đầy']
  }
} as const;

export const getReportCsvLabels = (locale: ReportLocale) => csvLabels[locale];

const reportDefinitions = {
  currency: 'VND',
  timezone: 'UTC',
  billed: 'Total of ISSUED, PARTIALLY_PAID, and PAID invoices in the selected invoice months; DRAFT and VOID are excluded.',
  collected: 'Successful payment entries minus successful reversal entries allocated to the related invoice month.',
  outstanding: 'Issued invoice total minus net successful payments, never below zero.',
  overdue: 'Outstanding issued invoice with a due date before the current UTC date.',
  void: 'Voided invoices are shown separately and excluded from billed and outstanding totals.'
} as const;

export const getReportDetails = (
  managerId: string,
  filters: ReportsFilters,
  section: ReportSection,
  pagination: ReportDetailPagination
) => loadReportDetailRows(managerId, filters, section, pagination);

export const getReportsData = async (managerId: string, filters: ReportsFilters) => {
  const data = await loadReportRows(managerId, filters);
  const revenueSummary = data.revenueByMonth.reduce(
    (acc, item) => ({
      billed: acc.billed + item.billed,
      collected: acc.collected + item.collected,
      grossPayments: acc.grossPayments + item.grossPayments,
      reversals: acc.reversals + item.reversals,
      unpaid: acc.unpaid + item.unpaid,
      invoiceCount: acc.invoiceCount + item.invoiceCount,
      voidInvoiceCount: acc.voidInvoiceCount + item.voidInvoiceCount,
      voidAmount: acc.voidAmount + item.voidAmount
    }),
    { billed: 0, collected: 0, grossPayments: 0, reversals: 0, unpaid: 0, invoiceCount: 0, voidInvoiceCount: 0, voidAmount: 0 }
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
    definitions: reportDefinitions,
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

export const getReportsSummary = async (managerId: string, filters: ReportsFilters) => {
  const data = await loadReportSummaryRows(managerId, filters);
  const revenueSummary = data.revenueByMonth.reduce(
    (acc, item) => ({
      billed: acc.billed + item.billed,
      collected: acc.collected + item.collected,
      grossPayments: acc.grossPayments + item.grossPayments,
      reversals: acc.reversals + item.reversals,
      unpaid: acc.unpaid + item.unpaid,
      invoiceCount: acc.invoiceCount + item.invoiceCount,
      voidInvoiceCount: acc.voidInvoiceCount + item.voidInvoiceCount,
      voidAmount: acc.voidAmount + item.voidAmount
    }),
    { billed: 0, collected: 0, grossPayments: 0, reversals: 0, unpaid: 0, invoiceCount: 0, voidInvoiceCount: 0, voidAmount: 0 }
  );
  const occupancyRate = data.occupancySummary.totalRooms === 0
    ? 0
    : Math.round((data.occupancySummary.occupiedRooms / data.occupancySummary.totalRooms) * 100);
  return {
    filters: data.filters,
    definitions: reportDefinitions,
    summary: {
      ...revenueSummary,
      ...data.debtSummary,
      ...data.occupancySummary,
      occupancyRate
    },
    debtSummary: data.debtSummary,
    revenueByMonth: data.revenueByMonth
  };
};

export const getReportsCsv = async (
  managerId: string,
  filters: ReportsFilters,
  section: ReportSection,
  locale: ReportLocale = 'en'
) => {
  const data = await getReportsData(managerId, filters);
  const labels = getReportCsvLabels(locale);
  if (section === 'revenue') {
    return {
      filename: sanitizeCsvFilename(`${labels.revenueFilename}-${data.filters.monthFrom.slice(0, 7)}-${data.filters.monthTo.slice(0, 7)}.csv`),
      content: createCsv(
        [...labels.revenue],
        data.revenueByMonth.map((item) => [
          item.month, item.invoiceCount, item.billed, item.grossPayments,
          item.reversals, item.collected, item.unpaid, item.voidInvoiceCount, item.voidAmount
        ])
      )
    };
  }
  if (section === 'debt') {
    return {
      filename: sanitizeCsvFilename(`${labels.debtFilename}-${data.filters.monthFrom.slice(0, 7)}-${data.filters.monthTo.slice(0, 7)}.csv`),
      content: createCsv(
        [...labels.debt],
        data.debtItems.map((item) => [
          item.buildingName, item.roomCode, item.tenantName, item.month.slice(0, 7), item.status,
          item.isOverdue ? labels.yes : labels.no, item.dueDate ?? '', item.total, item.paidAmount, item.outstandingAmount
        ])
      )
    };
  }
  if (section === 'reconciliation') {
    return {
      filename: sanitizeCsvFilename(`${labels.reconciliationFilename}-${data.filters.monthFrom.slice(0, 7)}-${data.filters.monthTo.slice(0, 7)}.csv`),
      content: createCsv(
        [...labels.reconciliation],
        data.reconciliationItems.map((item) => [
          item.paymentId, item.invoiceId, item.originalPaymentId ?? '', item.buildingName,
          item.roomCode, item.tenantName, item.month.slice(0, 7), item.invoiceStatus,
          item.entryType, item.amount, item.signedAmount, item.paidAt, item.referenceCode ?? '',
          item.reversalReason ?? ''
        ])
      )
    };
  }
  return {
    filename: sanitizeCsvFilename(`${labels.occupancyFilename}-${data.filters.monthTo.slice(0, 7)}.csv`),
    content: createCsv(
      [...labels.occupancy],
      data.occupancyByBuilding.map((item) => [
        item.buildingName, item.totalRooms, item.occupiedRooms, item.vacantRooms,
        item.maintenanceRooms, item.inactiveRooms, item.activeTenants, `${item.occupancyRate}%`
      ])
    )
  };
};
