import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import reportsRoutes from '../src/modules/reports/reports.routes';
import { getReportDetails, getReportsCsv } from '../src/modules/reports/reports.service';
import { errorHandler } from '../src/shared/middleware/error-handler';
import { UTF8_BOM } from '../src/shared/utils/csv';

vi.mock('../src/modules/reports/reports.service', () => ({
  getReportDetails: vi.fn(),
  getReportsCsv: vi.fn(),
  getReportsSummary: vi.fn()
}));

const mockedGetReportsCsv = vi.mocked(getReportsCsv);
const mockedGetReportDetails = vi.mocked(getReportDetails);

describe('reports CSV export route', () => {
  const app = express();
  app.use((req, _res, next) => {
    req.auth = { userId: '00000000-0000-4000-8000-000000000001', role: 'MANAGER' };
    next();
  });
  app.use('/reports', reportsRoutes);
  app.use(errorHandler);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetReportDetails.mockResolvedValue({ total: 0, page: 1, pageSize: 20, items: [] });
    mockedGetReportsCsv.mockResolvedValue({
      filename: 'báo cáo\r\nX-Injected: yes.csv',
      content: `${UTF8_BOM}"Tên","Số tiền"\r\n"Nguyễn An","1000"`
    });
  });

  it('validates and forwards standardized report detail pagination', async () => {
    await request(app)
      .get('/reports/details?section=debt&page=2&pageSize=50&sortBy=outstandingAmount&sortOrder=asc')
      .expect(200)
      .expect({ total: 0, page: 1, pageSize: 20, items: [] });

    expect(mockedGetReportDetails).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      expect.objectContaining({ buildingId: undefined, status: undefined }),
      'debt',
      { page: 2, pageSize: 50, sortBy: 'outstandingAmount', sortOrder: 'asc' }
    );
  });

  it('rejects oversized pages and section-incompatible sort fields', async () => {
    await request(app)
      .get('/reports/details?section=debt&pageSize=101')
      .expect(400);
    await request(app)
      .get('/reports/details?section=occupancy&sortBy=dueDate')
      .expect(400);
    expect(mockedGetReportDetails).not.toHaveBeenCalled();
  });

  it('forwards reconciliation dimensions and validates its sort fields', async () => {
    const roomId = '00000000-0000-4000-8000-000000000301';
    const tenantId = '00000000-0000-4000-8000-000000000101';
    await request(app)
      .get(`/reports/details?section=reconciliation&room_id=${roomId}&tenant_id=${tenantId}&sortBy=paymentDate`)
      .expect(200);

    expect(mockedGetReportDetails).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      expect.objectContaining({ roomId, tenantId }),
      'reconciliation',
      expect.objectContaining({ sortBy: 'paymentDate' })
    );
  });

  it('returns UTF-8 CSV with safe download and caching headers', async () => {
    const response = await request(app)
      .get('/reports/export.csv?section=revenue')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toContain('attachment; filename=');
    expect(response.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(response.headers['content-disposition']).not.toMatch(/[\r\n]/);
    expect(response.headers['x-injected']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('private, no-store, max-age=0');
    expect(response.headers['x-content-type-options']).toBe('nosniff');

    const body = response.body as Buffer;
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(body.toString('utf8')).toContain('Nguyễn An');
  });
});
