import { describe, expect, it } from 'vitest'
import { mapTenantFormValuesToPayload, type TenantFormValues } from './tenantFormPayload'

const baseTenantValues: TenantFormValues = {
  full_name: 'Nguyen Van A',
  phone: '0900000000',
  identity_number: '123456789012',
  status: 'ACTIVE',
  rental: {},
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
      contract: null,
    })
  })

  it('includes a contract payload when rental details are present', () => {
    const payload = mapTenantFormValuesToPayload({
      ...baseTenantValues,
      rental: {
        building_id: 'building-1',
        room_id: 'room-1',
        contract_status: 'ACTIVE',
        start_date: '2026-06-01',
        move_in_date: '2026-06-02',
        rent_price: 3_500_000,
        deposit_amount: 7_000_000,
        billing_day: 5,
        contract_note: 'Two-month deposit',
      },
    })

    expect(payload.contract).toEqual({
      building_id: 'building-1',
      room_id: 'room-1',
      status: 'ACTIVE',
      start_date: '2026-06-01',
      end_date: null,
      move_in_date: '2026-06-02',
      move_out_date: null,
      rent_price: 3_500_000,
      deposit_amount: 7_000_000,
      billing_day: 5,
      note: 'Two-month deposit',
    })
  })
})
