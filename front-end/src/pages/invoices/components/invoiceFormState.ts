import { Form } from 'antd'
import { useMemo } from 'react'
import type { FormInstance } from 'antd/es/form'
import type { InvoiceStatus } from '../types'

export interface InvoiceFormValues {
  building_id?: string
  contract_id?: string
  room_id?: string
  month: string
  status: InvoiceStatus
  issued_at?: string
  due_date?: string
  rent_amount: number
  electricity_prev: number
  electricity_curr: number
  water_prev: number
  water_curr: number
  electric_unit_price: number
  water_unit_price: number
  other_fees: number
  discount: number
  note?: string
}

const today = () => new Date().toISOString().slice(0, 10)

export function getInvoiceFormDefaultValues(): InvoiceFormValues {
  return {
    month: today(),
    status: 'DRAFT',
    issued_at: today(),
    rent_amount: 0,
    electricity_prev: 0,
    electricity_curr: 0,
    water_prev: 0,
    water_curr: 0,
    electric_unit_price: 0,
    water_unit_price: 0,
    other_fees: 0,
    discount: 0,
  }
}

export const invoiceFormDefaultValues: InvoiceFormValues = getInvoiceFormDefaultValues()

export function useInvoiceDerivedValues(form: FormInstance<InvoiceFormValues>) {
  const rentAmount = Form.useWatch('rent_amount', form) ?? 0
  const electricityPrev = Form.useWatch('electricity_prev', form) ?? 0
  const electricityCurr = Form.useWatch('electricity_curr', form) ?? 0
  const waterPrev = Form.useWatch('water_prev', form) ?? 0
  const waterCurr = Form.useWatch('water_curr', form) ?? 0
  const electricUnitPrice = Form.useWatch('electric_unit_price', form) ?? 0
  const waterUnitPrice = Form.useWatch('water_unit_price', form) ?? 0
  const otherFees = Form.useWatch('other_fees', form) ?? 0
  const discount = Form.useWatch('discount', form) ?? 0

  const electricUsage = useMemo(() => Math.max(0, electricityCurr - electricityPrev), [electricityCurr, electricityPrev])
  const waterUsage = useMemo(() => Math.max(0, waterCurr - waterPrev), [waterCurr, waterPrev])
  const electricAmount = useMemo(() => electricUsage * electricUnitPrice, [electricUsage, electricUnitPrice])
  const waterAmount = useMemo(() => waterUsage * waterUnitPrice, [waterUsage, waterUnitPrice])
  const subtotal = useMemo(() => rentAmount + electricAmount + waterAmount + otherFees, [rentAmount, electricAmount, waterAmount, otherFees])
  const totalAmount = useMemo(() => Math.max(0, subtotal - discount), [subtotal, discount])

  return { electricUsage, waterUsage, electricAmount, waterAmount, subtotal, totalAmount }
}
