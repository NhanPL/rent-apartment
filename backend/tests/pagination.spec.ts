import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../src/db', () => ({
  query: dbMocks.query,
  withTransaction: vi.fn()
}));

import { getInvoiceSummary, listInvoices } from '../src/modules/invoices/invoices.service';
import { listPaymentRequests } from '../src/modules/payments/payments.service';
import { loadReportDetailRows, loadReportSummaryRows } from '../src/modules/reports/reports.repository';
import { listUtilityReadings } from '../src/modules/utility-readings/utility-readings.service';
import {
  MAX_PAGE_SIZE,
  createPaginationQuerySchema
} from '../src/shared/utils/pagination';

const managerScope = { userId: 'manager-id', role: 'MANAGER' as const };

const mockPageQueries = (total = 42) => {
  dbMocks.query
    .mockResolvedValueOnce({ rows: [{ total }] })
    .mockResolvedValueOnce({ rows: [] });
};

describe('pagination contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies defaults, caps pageSize, and rejects unknown sort fields', () => {
    const schema = createPaginationQuerySchema(['month', 'createdAt'], 'month');

    expect(schema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      sortBy: 'month',
      sortOrder: 'desc'
    });
    expect(schema.safeParse({ pageSize: MAX_PAGE_SIZE + 1 }).success).toBe(false);
    expect(schema.safeParse({ sortBy: 'month; DROP TABLE invoice' }).success).toBe(false);
  });

  it('paginates and sorts invoices in SQL', async () => {
    mockPageQueries(57);
    const response = await listInvoices(managerScope, {
      page: 3,
      pageSize: 25,
      sortBy: 'total',
      sortOrder: 'asc',
      month: '2026-07',
      invoiceStatus: 'ISSUED'
    });

    const [itemSql, itemParams] = dbMocks.query.mock.calls[1] as [string, unknown[]];
    expect(itemSql.replace(/\s+/g, ' ')).toContain('ORDER BY i.total ASC NULLS LAST');
    expect(itemSql).toContain('LIMIT $4 OFFSET $5');
    expect(itemParams).toEqual(['manager-id', '2026-07-01', 'ISSUED', 25, 50]);
    expect(response).toEqual({ total: 57, page: 3, pageSize: 25, items: [] });
  });

  it('loads invoice summary with one aggregate query instead of fetching every page', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [{ total_invoices: 120, paid_invoices: 80, unpaid_invoices: 35, total_revenue: '450000000' }]
    });

    const response = await getInvoiceSummary(managerScope, '2026-07');

    const [sql, params] = dbMocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql.replace(/\s+/g, ' ')).toContain("COUNT(*) FILTER (WHERE i.status='PAID')");
    expect(params).toEqual(['manager-id', '2026-07-01']);
    expect(response).toEqual({
      totalInvoices: 120,
      paidInvoices: 80,
      unpaidInvoices: 35,
      totalRevenue: 450000000
    });
  });

  it('paginates payment request filters without duplicating tenant scope joins', async () => {
    mockPageQueries(12);
    const response = await listPaymentRequests(managerScope, {
      page: 2,
      pageSize: 10,
      sortBy: 'latestProofSubmittedAt',
      sortOrder: 'desc',
      requestStatus: 'TRANSFER_SUBMITTED'
    });

    const [itemSql, itemParams] = dbMocks.query.mock.calls[1] as [string, unknown[]];
    expect(itemSql.replace(/\s+/g, ' ')).toContain('ORDER BY latest_proof.submitted_at DESC NULLS LAST');
    expect(itemSql).toContain('LIMIT $3 OFFSET $4');
    expect(itemParams).toEqual(['manager-id', 'TRANSFER_SUBMITTED', 10, 10]);
    expect(response.total).toBe(12);
  });

  it('paginates utility readings with bounded offsets', async () => {
    mockPageQueries(101);
    const response = await listUtilityReadings(managerScope, {
      page: 2,
      pageSize: 100,
      sortBy: 'submittedAt',
      sortOrder: 'desc',
      status: 'SUBMITTED'
    });

    const [itemSql, itemParams] = dbMocks.query.mock.calls[1] as [string, unknown[]];
    expect(itemSql.replace(/\s+/g, ' ')).toContain('ORDER BY ur.submitted_at DESC NULLS LAST');
    expect(itemParams).toEqual(['manager-id', 'SUBMITTED', 100, 100]);
    expect(response).toMatchObject({ total: 101, page: 2, pageSize: 100 });
  });

  it('returns a standard page for report detail sections', async () => {
    mockPageQueries(7);
    const response = await loadReportDetailRows(
      'manager-id',
      { monthFrom: '2026-01', monthTo: '2026-07' },
      'occupancy',
      { page: 1, pageSize: 20, sortBy: 'occupancyRate', sortOrder: 'desc' }
    );

    const [itemSql, itemParams] = dbMocks.query.mock.calls[1] as [string, unknown[]];
    expect(itemSql).toContain('LIMIT $2 OFFSET $3');
    expect(itemParams).toEqual(['manager-id', 20, 0]);
    expect(response).toEqual({ total: 7, page: 1, pageSize: 20, items: [] });
  });

  it('computes report summary with aggregate queries instead of loading detail rows', async () => {
    dbMocks.query.mockResolvedValue({ rows: [] });

    const response = await loadReportSummaryRows('manager-id', {
      monthFrom: '2026-01',
      monthTo: '2026-07'
    });

    const queries = dbMocks.query.mock.calls.map(([sql]) => String(sql).replace(/\s+/g, ' '));
    expect(queries).toHaveLength(3);
    expect(queries.some((sql) => sql.includes('AS unpaid_invoices'))).toBe(true);
    expect(queries.some((sql) => sql.includes('AS occupied_rooms'))).toBe(true);
    expect(response).toMatchObject({
      revenueByMonth: [],
      debtSummary: { unpaidInvoices: 0, unpaidAmount: 0 },
      occupancySummary: { totalRooms: 0, occupiedRooms: 0 }
    });
  });
});
