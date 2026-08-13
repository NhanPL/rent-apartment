import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('../src/db', () => dbMocks);

import { getInvoiceBranding, updateInvoiceBranding } from '../src/modules/invoice-branding/invoice-branding.service';

const branding = {
  display_name: 'RentMate Residence', business_address: '1 Main Street', tax_code: 'TAX-1',
  logo_url: 'https://example.com/logo.png', accent_color: '#12AB34', invoice_title: 'Rent Invoice',
  default_note: 'Thank you.'
};

describe('invoice branding service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.withTransaction.mockImplementation(async (callback) => callback({ query: vi.fn() }));
  });

  it('uses the manager profile when no branding has been configured', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ display_name: 'Manager One' }] });
    await expect(getInvoiceBranding('manager-1')).resolves.toMatchObject({
      display_name: 'Manager One', accent_color: '#1677FF', invoice_title: 'Monthly Invoice'
    });
  });

  it('upserts normalized branding and writes an audit log', async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...branding, accent_color: '#12AB34' }] })
      .mockResolvedValueOnce({ rows: [] });
    dbMocks.withTransaction.mockImplementationOnce(async (callback) => callback({ query: clientQuery }));

    await expect(updateInvoiceBranding('manager-1', { ...branding, accent_color: '#12ab34' })).resolves.toEqual(branding);
    expect(clientQuery.mock.calls[1][1][5]).toBe('#12AB34');
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO audit_log'))).toBe(true);
  });
});
