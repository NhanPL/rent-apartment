import type { HandoverPayload, ReservePayload } from '../../services/rentalRegistrationService'

export interface ReserveFormValues {
  building_id?: string
  room_id?: string
  tenant_mode: 'existing' | 'new'
  tenant_id?: string
  full_name?: string
  phone?: string
  identity_number?: string
  email?: string
  permanent_address?: string
  privacy_consent?: boolean
  start_date?: string
  end_date?: string
  rent_price?: number
  deposit_amount?: number
  billing_day?: number
  note?: string
}

export interface HandoverFormValues {
  move_in_date?: string
  electricity_curr?: number
  water_curr?: number
  persons_count?: number
  vehicles_count?: number
  note?: string
}

const nullableText = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

export function toReservePayload(values: ReserveFormValues): ReservePayload {
  if (!values.room_id || !values.start_date || values.rent_price == null || values.deposit_amount == null || !values.billing_day) {
    throw new Error('Please complete all required reservation fields.')
  }
  const payload: ReservePayload = {
    room_id: values.room_id,
    start_date: values.start_date,
    end_date: values.end_date ?? null,
    rent_price: values.rent_price,
    deposit_amount: values.deposit_amount,
    billing_day: values.billing_day,
    note: nullableText(values.note),
  }
  if (values.tenant_mode === 'new') {
    if (!values.full_name || !values.phone || !values.identity_number || !values.privacy_consent) {
      throw new Error('Please complete all required new tenant fields and privacy consent.')
    }
    payload.tenant = {
      full_name: values.full_name.trim(),
      phone: values.phone.trim(),
      identity_number: values.identity_number.trim(),
      email: nullableText(values.email),
      permanent_address: nullableText(values.permanent_address),
      privacy_consent: true,
    }
  } else if (values.tenant_id) {
    payload.tenant_id = values.tenant_id
  } else {
    throw new Error('Please select a tenant.')
  }
  return payload
}

export function toHandoverPayload(values: HandoverFormValues): HandoverPayload {
  if (!values.move_in_date || values.electricity_curr == null || values.water_curr == null || values.persons_count == null || values.vehicles_count == null) {
    throw new Error('Please complete all required handover fields.')
  }
  return {
    move_in_date: values.move_in_date,
    electricity_curr: values.electricity_curr,
    water_curr: values.water_curr,
    persons_count: values.persons_count,
    vehicles_count: values.vehicles_count,
    note: nullableText(values.note),
  }
}

export { nullableText }
