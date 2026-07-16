import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const utilityServiceMocks = vi.hoisted(() => ({
  listBuildings: vi.fn(),
  listRooms: vi.fn(),
  listUtilityRates: vi.fn(),
  listUtilityReadings: vi.fn(),
}))

vi.mock('../../services/utilitiesService', () => ({
  approveUtilityReading: vi.fn(),
  createUtilityRate: vi.fn(),
  deleteUtilityRate: vi.fn(),
  getUtilityRate: vi.fn(),
  getUtilityReading: vi.fn(),
  listBuildings: utilityServiceMocks.listBuildings,
  listRooms: utilityServiceMocks.listRooms,
  listUtilityRates: utilityServiceMocks.listUtilityRates,
  listUtilityReadings: utilityServiceMocks.listUtilityReadings,
  rejectUtilityReading: vi.fn(),
  requestUtilityReadingCorrection: vi.fn(),
  updateUtilityRate: vi.fn(),
}))

import { UtilitiesPage } from './UtilitiesPage'

const approvedReading = {
  id: '00000000-0000-4000-8000-000000000801',
  room_id: '00000000-0000-4000-8000-000000000301',
  room_code: '101',
  building_id: '00000000-0000-4000-8000-000000000201',
  building_name: 'Sunrise Apartments',
  tenant_id: '00000000-0000-4000-8000-000000000101',
  tenant_name: 'Tenant One',
  month: '2026-07-01',
  electricity_prev: 120,
  electricity_curr: 150,
  water_prev: 30,
  water_curr: 36,
  status: 'APPROVED',
  reported_by_user_id: null,
  reported_at: '2026-07-01T00:00:00.000Z',
  submitted_at: '2026-07-02T00:00:00.000Z',
  approved_at: '2026-07-03T00:00:00.000Z',
  rejected_at: null,
  rejection_reason: null,
  manager_note: null,
  note: null,
  evidence_count: 2,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-03T00:00:00.000Z',
}

describe('UtilitiesPage invoice creation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/utilities')
    utilityServiceMocks.listBuildings.mockResolvedValue([])
    utilityServiceMocks.listRooms.mockResolvedValue([])
    utilityServiceMocks.listUtilityRates.mockResolvedValue([])
    utilityServiceMocks.listUtilityReadings.mockResolvedValue([
      approvedReading,
      {
        ...approvedReading,
        id: '00000000-0000-4000-8000-000000000802',
        room_code: '102',
        status: 'SUBMITTED',
        approved_at: null,
      },
    ])
  })

  it('shows the action only for approved readings and opens the invoice form route', async () => {
    const user = userEvent.setup()
    render(<UtilitiesPage />)

    const createButtons = await screen.findAllByRole('button', { name: /create invoice/i })
    expect(createButtons).toHaveLength(1)

    await user.click(createButtons[0])

    expect(window.location.pathname).toBe('/invoices')
    expect(new URLSearchParams(window.location.search).get('utilityReadingId')).toBe(approvedReading.id)
  })
})
