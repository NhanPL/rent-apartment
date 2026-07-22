import { describe, expect, it } from 'vitest'
import { mapTenantFormValuesToPayload, type TenantFormValues } from './tenantFormPayload'

const baseTenantValues: TenantFormValues = {
  full_name: 'Nguyen Van A',
  phone: '0900000000',
  identity_number: '123456789012',
  status: 'ACTIVE',
}

describe('mapTenantFormValuesToPayload', () => {
  it('maps tenant fields and normalizes empty optional values to null', () => {
    const payload = mapTenantFormValuesToPayload({
      ...baseTenantValues,
      email: 'tenant@example.com',
      note: '',
    })

    expect(payload).toEqual({
      tenant: {
        full_name: 'Nguyen Van A',
        phone: '0900000000',
        identity_number: '123456789012',
        status: 'ACTIVE',
        dob: null,
        gender: null,
        identity_issued_date: null,
        identity_issued_place: null,
        email: 'tenant@example.com',
        permanent_address: null,
        note: '',
      },
    })
  })

  it('keeps identity image values out of the profile payload', () => {
    const image = new File(['front'], 'front.jpg', { type: 'image/jpeg' })
    const payload = mapTenantFormValuesToPayload({
      ...baseTenantValues,
      identity_front: image,
    })

    expect(payload).not.toHaveProperty('identity_front')
    expect(payload.tenant).not.toHaveProperty('identity_front')
  })
})
