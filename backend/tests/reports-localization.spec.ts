import { describe, expect, it } from 'vitest';
import { getReportCsvLabels } from '../src/modules/reports/reports.service';

describe('report CSV localization', () => {
  it('provides complete English and Vietnamese export labels', () => {
    const english = getReportCsvLabels('en');
    const vietnamese = getReportCsvLabels('vi');

    expect(english.revenue).toHaveLength(vietnamese.revenue.length);
    expect(english.revenue[0]).toBe('Month');
    expect(vietnamese.revenue[0]).toBe('Tháng');
    expect(vietnamese.yes).toBe('Có');
    expect(vietnamese.reconciliationFilename).toBe('bao-cao-doi-soat');
  });
});
