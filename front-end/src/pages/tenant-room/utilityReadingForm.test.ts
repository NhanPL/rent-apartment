import { describe, expect, it } from 'vitest'
import {
  calculateReadingUsage,
  isTenantUtilityReadingLocked,
  validateTenantUtilityReading,
  type TenantUtilityReadingFormValues,
} from './utilityReadingForm'

const baseValues: TenantUtilityReadingFormValues = {
  month: '2026-06',
  electricity_prev: 100,
  electricity_curr: 125,
  water_prev: 20,
  water_curr: 27,
  note: '  checked by tenant  ',
}

describe('tenant utility reading validation', () => {
  it('locks approved and invoiced readings', () => {
    expect(isTenantUtilityReadingLocked('APPROVED')).toBe(true)
    expect(isTenantUtilityReadingLocked('INVOICED')).toBe(true)
    expect(isTenantUtilityReadingLocked('SUBMITTED')).toBe(false)
    expect(isTenantUtilityReadingLocked(null)).toBe(false)
  })

  it('builds the submit payload for valid readings', () => {
    expect(validateTenantUtilityReading(baseValues, false)).toEqual({
      ok: true,
      formMonth: '2026-06',
      payload: {
        month: '2026-06-01',
        electricity_curr: 125,
        water_curr: 27,
        note: 'checked by tenant',
      },
    })
  })

  it('rejects locked readings before building a payload', () => {
    expect(validateTenantUtilityReading(baseValues, true)).toEqual({
      ok: false,
      reason: 'locked',
    })
  })

  it('requires both current readings', () => {
    expect(validateTenantUtilityReading({ ...baseValues, water_curr: null }, false)).toEqual({
      ok: false,
      reason: 'missing-current-readings',
    })
  })

  it('calculates usage from previous and current readings', () => {
    expect(calculateReadingUsage(100, 140)).toBe(40)
    expect(calculateReadingUsage(100, 90)).toBe(0)
    expect(calculateReadingUsage(null, 90)).toBeNull()
  })
})
