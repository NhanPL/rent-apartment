import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateMonthlyInvoices: vi.fn(),
  listBuildings: vi.fn(),
  listMonthlyBilling: vi.fn(),
}))

vi.mock('../../services/invoicesService', () => ({ listBuildings: mocks.listBuildings }))
vi.mock('../../services/monthlyBillingService', () => ({
  generateMonthlyInvoices: mocks.generateMonthlyInvoices,
  listMonthlyBilling: mocks.listMonthlyBilling,
}))

import { MonthlyBillingPage } from './MonthlyBillingPage'

const readyItem = {
  building_id: '00000000-0000-4000-8000-000000000201',
  building_name: 'Central Building',
  room_id: '00000000-0000-4000-8000-000000000301',
  room_code: '101',
  contract_id: '00000000-0000-4000-8000-000000000401',
  contract_code: 'C-101',
  tenant_id: '00000000-0000-4000-8000-000000000501',
  primary_tenant: 'Tenant One',
  reading_id: '00000000-0000-4000-8000-000000000601',
  reading_status: 'APPROVED',
  invoice_id: null,
  voided_invoice_id: null,
  invoice_status: null,
  invoice_total: 0,
  payment_request_id: null,
  payment_request_status: null,
  paid_amount: 0,
  outstanding_amount: 0,
  next_action: 'GENERATE_INVOICE' as const,
}

describe('MonthlyBillingPage ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listBuildings.mockResolvedValue([{ id: readyItem.building_id, name: readyItem.building_name }])
    mocks.listMonthlyBilling.mockResolvedValue({ month: '2026-08-01', items: [readyItem] })
    mocks.generateMonthlyInvoices.mockResolvedValue({ generated: [readyItem], skipped: [], total: 1 })
  })

  it('generates all ready invoices for the selected month from the billing workspace', async () => {
    render(<MonthlyBillingPage />)

    const generateButton = await screen.findByRole('button', { name: /Generate ready invoices/ })
    expect(generateButton).toHaveTextContent('(1)')
    fireEvent.click(generateButton)

    await waitFor(() => expect(mocks.generateMonthlyInvoices).toHaveBeenCalledWith(
      undefined,
      expect.stringMatching(/^\d{4}-\d{2}$/),
    ))
  })
})
