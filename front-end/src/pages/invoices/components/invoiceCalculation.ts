export interface InvoiceCalculationInput {
  rentAmount: number
  electricityPrev: number
  electricityCurr: number
  waterPrev: number
  waterCurr: number
  electricUnitPrice: number
  waterUnitPrice: number
  otherFees: number
  discount: number
}

export interface InvoiceCalculationResult {
  electricUsage: number
  waterUsage: number
  electricAmount: number
  waterAmount: number
  subtotal: number
  totalAmount: number
}

export function calculateInvoiceTotals(input: InvoiceCalculationInput): InvoiceCalculationResult {
  const electricUsage = Math.max(0, input.electricityCurr - input.electricityPrev)
  const waterUsage = Math.max(0, input.waterCurr - input.waterPrev)
  const electricAmount = electricUsage * input.electricUnitPrice
  const waterAmount = waterUsage * input.waterUnitPrice
  const subtotal = input.rentAmount + electricAmount + waterAmount + input.otherFees
  const totalAmount = Math.max(0, subtotal - input.discount)

  return { electricUsage, waterUsage, electricAmount, waterAmount, subtotal, totalAmount }
}
