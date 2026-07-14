import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoiceServiceMocks = vi.hoisted(() => ({
  deleteInvoice: vi.fn(),
  getInvoicesSummary: vi.fn(),
  listBuildings: vi.fn(),
  listContracts: vi.fn(),
  listInvoices: vi.fn(),
  listRooms: vi.fn(),
  listTenants: vi.fn(),
}))

vi.mock('../../services/invoicesService', () => ({
  addInvoiceAdjustment: vi.fn(),
  createInvoice: vi.fn(),
  deleteInvoice: invoiceServiceMocks.deleteInvoice,
  generateInvoices: vi.fn(),
  getInvoice: vi.fn(),
  getInvoicePrefill: vi.fn(),
  getInvoicesSummary: invoiceServiceMocks.getInvoicesSummary,
  issueInvoice: vi.fn(),
  listBuildings: invoiceServiceMocks.listBuildings,
  listContracts: invoiceServiceMocks.listContracts,
  listInvoices: invoiceServiceMocks.listInvoices,
  listRooms: invoiceServiceMocks.listRooms,
  listTenants: invoiceServiceMocks.listTenants,
  markInvoiceOverdue: vi.fn(),
  updateInvoice: vi.fn(),
  voidInvoice: vi.fn(),
}))

vi.mock('../../services/paymentsService', () => ({
  cancelPaymentRequest: vi.fn(),
  createPaymentRequest: vi.fn(),
  expirePaymentRequest: vi.fn(),
  getPaymentRequestByInvoice: vi.fn(),
}))

import { InvoicesPage } from './InvoicesPage'

const invoice = {
  id: '00000000-0000-4000-8000-000000000901',
  contract_id: '00000000-0000-4000-8000-000000000401',
  room_id: '00000000-0000-4000-8000-000000000301',
  building_id: '00000000-0000-4000-8000-000000000201',
  building_name: 'Sunrise Apartments',
  room_code: '101',
  tenant_id: '00000000-0000-4000-8000-000000000101',
  tenant_name: 'Tenant One',
  month: '2026-07-01',
  status: 'PAID',
  payment_status: 'SUCCEEDED',
  issued_at: '2026-07-01T00:00:00.000Z',
  due_date: '2026-07-05',
  paid_at: '2026-07-03T00:00:00.000Z',
  note: null,
  subtotal: 4_000_000,
  discount: 0,
  total: 4_000_000,
  rent_amount: 3_000_000,
  electric_unit_price: 3_500,
  water_unit_price: 15_000,
  electricity_prev: 100,
  electricity_curr: 200,
  water_prev: 20,
  water_curr: 30,
  electric_usage: 100,
  water_usage: 10,
  electric_amount: 350_000,
  water_amount: 150_000,
  other_fees: 500_000,
  paid_amount: 4_000_000,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-03T00:00:00.000Z',
}

describe('InvoicesPage invoice deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invoiceServiceMocks.listBuildings.mockResolvedValue([])
    invoiceServiceMocks.listContracts.mockResolvedValue([])
    invoiceServiceMocks.listRooms.mockResolvedValue([])
    invoiceServiceMocks.listTenants.mockResolvedValue([])
    invoiceServiceMocks.listInvoices.mockResolvedValue([invoice])
    invoiceServiceMocks.getInvoicesSummary.mockResolvedValue({
      totalInvoices: 1,
      paidInvoices: 1,
      unpaidInvoices: 0,
      totalRevenue: 4_000_000,
    })
    invoiceServiceMocks.deleteInvoice.mockResolvedValue(undefined)
  })

  it('confirms deletion for a paid invoice and reloads the table', async () => {
    const user = userEvent.setup()
    render(<InvoicesPage />)

    await user.click(await screen.findByRole('button', { name: 'Delete invoice' }))

    const dialog = screen.getByRole('dialog', { name: 'Delete this invoice?' })
    expect(within(dialog).getByText(/all related payment records/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(invoiceServiceMocks.deleteInvoice).toHaveBeenCalledWith(invoice.id))
    await waitFor(() => expect(invoiceServiceMocks.listInvoices).toHaveBeenCalledTimes(2))
  })
})
