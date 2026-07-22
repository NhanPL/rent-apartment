import type { TenantFormPayload, TenantIdentityDocument, TenantIdentityDocumentFilePayload, TenantStatus } from './types'

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
  identity_front?: TenantIdentityDocument | TenantIdentityDocumentFilePayload | File | null
  identity_back?: TenantIdentityDocument | TenantIdentityDocumentFilePayload | File | null
}

export const defaultTenantFormValues: TenantFormValues = {
  full_name: '',
  phone: '',
  identity_number: '',
  status: 'ACTIVE',
  identity_front: null,
  identity_back: null,
}

export function mapTenantFormValuesToPayload(values: TenantFormValues): TenantFormPayload {
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
  }
}
