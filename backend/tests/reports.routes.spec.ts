import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import reportsRoutes from '../src/modules/reports/reports.routes';
import { getReportsCsv } from '../src/modules/reports/reports.service';
import { errorHandler } from '../src/shared/middleware/error-handler';
import { UTF8_BOM } from '../src/shared/utils/csv';

vi.mock('../src/modules/reports/reports.service', () => ({
  getReportsCsv: vi.fn(),
  getReportsData: vi.fn()
}));

const mockedGetReportsCsv = vi.mocked(getReportsCsv);

describe('reports CSV export route', () => {
  const app = express();
  app.use((req, _res, next) => {
    req.auth = { userId: '00000000-0000-4000-8000-000000000001', role: 'MANAGER' };
    next();
  });
  app.use('/reports', reportsRoutes);
  app.use(errorHandler);

  beforeEach(() => {
    mockedGetReportsCsv.mockResolvedValue({
      filename: 'báo cáo\r\nX-Injected: yes.csv',
      content: `${UTF8_BOM}"Tên","Số tiền"\r\n"Nguyễn An","1000"`
    });
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
