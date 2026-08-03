import { describe, expect, it } from 'vitest';
import {
  UTF8_BOM,
  buildCsvContentDisposition,
  createCsv,
  sanitizeCsvCell,
  sanitizeCsvFilename
} from '../src/shared/utils/csv';

describe('CSV security utilities', () => {
  it.each([
    '=SUM(A1:A2)',
    '+cmd|\'/C calc\'!A0',
    '-2+3',
    '@SUM(1,1)',
    '\t=1+1',
    '\r=1+1'
  ])('neutralizes a formula payload beginning with %j', (payload) => {
    expect(sanitizeCsvCell(payload)).toBe(`'${payload}`);
  });

  it('keeps regular values intact and normalizes empty values', () => {
    expect(sanitizeCsvCell('Nguyen Van An')).toBe('Nguyen Van An');
    expect(sanitizeCsvCell(1250000)).toBe('1250000');
    expect(sanitizeCsvCell(null)).toBe('');
    expect(sanitizeCsvCell(undefined)).toBe('');
  });

  it('sanitizes headers and every data cell while preserving valid UTF-8 CSV', () => {
    const csv = createCsv(
      ['=Injected header', 'Ten nguoi thue'],
      [
        ['=1+1', 'Nguyễn "An"'],
        ['+cmd', '@evil'],
        ['-2+3', '\t=cmd'],
        ['\r=cmd', 'safe, value']
      ]
    );

    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain('"\'=Injected header"');
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"\'+cmd","\'@evil"');
    expect(csv).toContain('"\'-2+3","\'\t=cmd"');
    expect(csv).toContain('"\'\r=cmd","safe, value"');
    expect(csv).toContain('"Nguyễn ""An"""');
    expect(csv.split('\r\n')).toHaveLength(5);

    const bytes = Buffer.from(csv, 'utf8');
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString('utf8')).toContain('Nguyễn');
  });

  it('sanitizes download filenames and produces an injection-safe disposition', () => {
    const filename = sanitizeCsvFilename('../../bao\r\nX-Injected: yes".csv');
    expect(filename).toBe('bao__X-Injected_-yes_.csv');
    expect(filename).not.toMatch(/[\r\n"\\/]/);

    const disposition = buildCsvContentDisposition('báo cáo tháng 7.csv');
    expect(disposition).toContain('attachment; filename="bao-cao-thang-7.csv"');
    expect(disposition).toContain("filename*=UTF-8''b%C3%A1o-c%C3%A1o-th%C3%A1ng-7.csv");
    expect(disposition).not.toMatch(/[\r\n]/);
  });
});
