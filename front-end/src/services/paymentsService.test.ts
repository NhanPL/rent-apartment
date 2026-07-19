import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock('./apiClient', () => ({
  apiRequest: apiMocks.apiRequest,
}))

import { listPaymentRequests } from './paymentsService'

describe('listPaymentRequests', () => {
  beforeEach(() => {
    apiMocks.apiRequest.mockResolvedValue([])
  })

  it('serializes all payment filters as query parameters', async () => {
    await listPaymentRequests({
      month: '2026-07',
      building_id: 'building-id',
      room_id: 'room-id',
      tenant_id: 'tenant-id',
      request_status: 'TRANSFER_SUBMITTED',
      latest_proof_status: 'PENDING',
    })

    const route = String(apiMocks.apiRequest.mock.calls[0][0])
    const url = new URL(route, 'http://localhost')
    expect(url.pathname).toBe('/payments/requests')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      month: '2026-07',
      building_id: 'building-id',
      room_id: 'room-id',
      tenant_id: 'tenant-id',
      request_status: 'TRANSFER_SUBMITTED',
      latest_proof_status: 'PENDING',
    })
  })

  it('keeps the base route when no filters are selected', async () => {
    await listPaymentRequests()
    expect(apiMocks.apiRequest).toHaveBeenCalledWith('/payments/requests')
  })
})
