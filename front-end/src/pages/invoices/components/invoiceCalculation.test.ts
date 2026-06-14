import { describe, expect, it } from 'vitest'
import { calculateInvoiceTotals } from './invoiceCalculation'

describe('calculateInvoiceTotals', () => {
  it('calculates usage, line amounts, subtotal, and total', () => {
    expect(
      calculateInvoiceTotals({
        rentAmount: 3_000_000,
        electricityPrev: 120,
        electricityCurr: 150,
        waterPrev: 45,
        waterCurr: 52,
        electricUnitPrice: 3_500,
        waterUnitPrice: 12_000,
        otherFees: 150_000,
        discount: 50_000,
      }),
    ).toEqual({
      electricUsage: 30,
      waterUsage: 7,
      electricAmount: 105_000,
      waterAmount: 84_000,
      subtotal: 3_339_000,
      totalAmount: 3_289_000,
    })
  })

  it('does not allow negative usage or a negative total', () => {
    expect(
      calculateInvoiceTotals({
        rentAmount: 100_000,
        electricityPrev: 200,
        electricityCurr: 190,
        waterPrev: 80,
        waterCurr: 75,
        electricUnitPrice: 4_000,
        waterUnitPrice: 10_000,
        otherFees: 0,
        discount: 150_000,
      }),
    ).toEqual({
      electricUsage: 0,
      waterUsage: 0,
      electricAmount: 0,
      waterAmount: 0,
      subtotal: 100_000,
      totalAmount: 0,
    })
  })
})
