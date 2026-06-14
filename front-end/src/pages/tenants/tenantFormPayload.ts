import type { ContractStatus, TenantFormPayload, TenantStatus } from './types'

export interface TenantFormValues {
  full_name: string
  dob?: string
  gender?: string
  identity_number: string
  identity_issued_date?: string
  identity_issued_place?: string
  email?: string
  phone: string
  permanent_address?: string
  status: TenantStatus
  note?: string
  rental: {
    building_id?: string
    room_id?: string
    contract_status?: ContractStatus
    start_date?: string
    end_date?: string
    move_in_date?: string
    move_out_date?: string
    rent_price?: number
    deposit_amount?: number
    billing_day?: number
    contract_note?: string
  }
}

export const defaultTenantFormValues: TenantFormValues = {
  full_name: '',
  phone: '',
  identity_number: '',
  status: 'ACTIVE',
  rental: {
    contract_status: 'DRAFT',
    billing_day: 1,
  },
}

export const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : undefined
}

const toNumberOrNull = (value: unknown): number | null => toNumberOrUndefined(value) ?? null

export function mapTenantFormValuesToPayload(values: TenantFormValues): TenantFormPayload {
  const hasRental =
    Boolean(values.rental.room_id) ||
    Boolean(values.rental.start_date) ||
    values.rental.rent_price !== undefined ||
    values.rental.deposit_amount !== undefined

  return {
    tenant: {
      full_name: values.full_name,
      phone: values.phone,
      identity_number: values.identity_number,
      status: values.status,
      dob: values.dob ?? null,
      gender: values.gender ?? null,
      identity_issued_date: values.identity_issued_date ?? null,
      identity_issued_place: values.identity_issued_place ?? null,
      email: values.email ?? null,
      permanent_address: values.permanent_address ?? null,
      note: values.note ?? null,
    },
    contract: hasRental
      ? {
          building_id: values.rental.building_id ?? null,
          room_id: values.rental.room_id ?? null,
          status: values.rental.contract_status ?? 'DRAFT',
          start_date: values.rental.start_date ?? null,
          end_date: values.rental.end_date ?? null,
          move_in_date: values.rental.move_in_date ?? null,
          move_out_date: values.rental.move_out_date ?? null,
          rent_price: toNumberOrNull(values.rental.rent_price),
          deposit_amount: toNumberOrNull(values.rental.deposit_amount),
          billing_day: values.rental.billing_day ?? null,
          note: values.rental.contract_note ?? null,
        }
      : null,
  }
}
