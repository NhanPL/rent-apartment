import { describe, expect, it } from 'vitest';
import { maskIdentityNumber } from '../src/modules/tenants/tenant-privacy.service';

describe('tenant privacy helpers', () => {
  it('masks all but the final four identity characters', () => {
    expect(maskIdentityNumber('012345678901')).toBe('********8901');
    expect(maskIdentityNumber('ABCD')).toBe('****');
  });

  it('does not manufacture a value for missing identity data', () => {
    expect(maskIdentityNumber(null)).toBeNull();
    expect(maskIdentityNumber(undefined)).toBeNull();
  });
});
