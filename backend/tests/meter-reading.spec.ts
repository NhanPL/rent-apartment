import { describe, expect, it } from 'vitest';
import { calculateMeterUsage } from '../src/modules/invoices/invoices.core';

describe('meter reading usage', () => {
  it('uses the difference for a normal meter progression', () => {
    expect(calculateMeterUsage(120, 150, false)).toBe(30);
  });

  it('uses the new meter value after an approved reset', () => {
    expect(calculateMeterUsage(120, 5, true)).toBe(5);
  });

  it('never returns negative usage', () => {
    expect(calculateMeterUsage(120, 5, false)).toBe(0);
  });
});
