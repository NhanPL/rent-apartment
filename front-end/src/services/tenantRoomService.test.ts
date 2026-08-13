import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({ apiRequest: vi.fn() }))

vi.mock('./apiClient', () => ({ apiRequest: apiMocks.apiRequest }))

import { getCurrentAndPreviousUtilityReadings } from './tenantRoomService'

const roomId = '00000000-0000-4000-8000-000000000101'

const reading = (overrides: Record<string, unknown>) => ({
  id: '00000000-0000-4000-8000-000000000801',
  room_id: roomId,
  month: '2026-08-01',
  electricity_prev: '100',
  electricity_curr: '151',
  water_prev: '20',
  water_curr: '36',
  electricity_meter_reset: false,
  water_meter_reset: false,
  meter_reset_note: null,
  status: 'REJECTED',
  reported_by_user_id: null,
  reported_at: null,
  submitted_at: '2026-08-13T10:00:00.000Z',
  approved_at: null,
  rejected_at: '2026-08-13T10:05:00.000Z',
  rejection_reason: 'Please retake both meter photos',
  evidence_count: '2',
  note: null,
  ...overrides,
})

describe('getCurrentAndPreviousUtilityReadings', () => {
  beforeEach(() => {
    apiMocks.apiRequest.mockReset()
  })

  it('hydrates rejected and previous readings from the paginated API response', async () => {
    apiMocks.apiRequest.mockResolvedValue({
      total: 2,
      page: 1,
      pageSize: 100,
      items: [
        reading({}),
        reading({
          id: '00000000-0000-4000-8000-000000000800',
          month: '2026-07-01',
          electricity_prev: '90',
          electricity_curr: '100',
          water_prev: '18',
          water_curr: '20',
          status: 'APPROVED',
          rejection_reason: null,
        }),
      ],
    })

    const snapshot = await getCurrentAndPreviousUtilityReadings(roomId, '2026-08-01')

    expect(apiMocks.apiRequest).toHaveBeenCalledWith(
      `/utility-readings?room_id=${roomId}&page=1&pageSize=100&sortBy=month&sortOrder=desc`,
    )
    expect(snapshot.current_reading).toMatchObject({
      status: 'REJECTED',
      rejection_reason: 'Please retake both meter photos',
      electricity_curr: 151,
      water_curr: 36,
      evidence_count: 2,
    })
    expect(snapshot.previous_reading).toMatchObject({ electricity_curr: 100, water_curr: 20 })
  })
})
