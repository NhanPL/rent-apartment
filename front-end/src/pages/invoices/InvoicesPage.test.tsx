import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoiceServiceMocks = vi.hoisted(() => ({
  deleteInvoice: vi.fn(),
  getEffectiveUtilityRate: vi.fn(),
  getInvoice: vi.fn(),
  getInvoicePrefill: vi.fn(),
  getInvoicesSummary: vi.fn(),
  listBuildings: vi.fn(),
  listContracts: vi.fn(),
  listInvoices: vi.fn(),
  listRooms: vi.fn(),
  listTenants: vi.fn(),
  issueInvoice: vi.fn(),
}))

const utilityServiceMocks = vi.hoisted(() => ({
  getUtilityReading: vi.fn(),
}))

const paymentServiceMocks = vi.hoisted(() => ({
  approvePaymentProof: vi.fn(),
  getPaymentRequestByInvoice: vi.fn(),
}))

vi.mock('../../services/invoicesService', () => ({
  addInvoiceAdjustment: vi.fn(),
  createInvoice: vi.fn(),
  deleteInvoice: invoiceServiceMocks.deleteInvoice,
  generateInvoices: vi.fn(),
  getInvoice: invoiceServiceMocks.getInvoice,
  getEffectiveUtilityRate: invoiceServiceMocks.getEffectiveUtilityRate,
  getInvoicePrefill: invoiceServiceMocks.getInvoicePrefill,
  getInvoicesSummary: invoiceServiceMocks.getInvoicesSummary,
  issueInvoice: invoiceServiceMocks.issueInvoice,
  listBuildings: invoiceServiceMocks.listBuildings,
  listContracts: invoiceServiceMocks.listContracts,
  listInvoices: invoiceServiceMocks.listInvoices,
  listRooms: invoiceServiceMocks.listRooms,
  listTenants: invoiceServiceMocks.listTenants,
  markInvoiceOverdue: vi.fn(),
  updateInvoice: vi.fn(),
  voidInvoice: vi.fn(),
}))

vi.mock('../../services/utilitiesService', () => ({
  getUtilityReading: utilityServiceMocks.getUtilityReading,
}))

vi.mock('../../services/paymentsService', () => ({
  approvePaymentProof: paymentServiceMocks.approvePaymentProof,
  cancelPaymentRequest: vi.fn(),
  createPaymentRequest: vi.fn(),
  expirePaymentRequest: vi.fn(),
  getPaymentRequestByInvoice: paymentServiceMocks.getPaymentRequestByInvoice,
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
    window.history.replaceState(null, '', '/invoices')
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
    paymentServiceMocks.getPaymentRequestByInvoice.mockResolvedValue(null)
    invoiceServiceMocks.getEffectiveUtilityRate.mockResolvedValue({
      electricity_unit_price: 3_500,
      water_unit_price: 15_000,
    })
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

  it('opens a prefilled invoice form from an approved utility reading', async () => {
    const utilityReadingId = '00000000-0000-4000-8000-000000000801'
    invoiceServiceMocks.listBuildings.mockResolvedValue([
      { id: invoice.building_id, name: invoice.building_name },
    ])
    invoiceServiceMocks.listRooms.mockResolvedValue([
      { id: invoice.room_id, building_id: invoice.building_id, code: invoice.room_code, base_rent: 3_000_000 },
    ])
    invoiceServiceMocks.listContracts.mockResolvedValue([
      {
        id: invoice.contract_id,
        room_id: invoice.room_id,
        status: 'ACTIVE',
        rent_price: 3_000_000,
        billing_day: 5,
        tenant_id: invoice.tenant_id,
        tenant_name: invoice.tenant_name,
      },
    ])
    utilityServiceMocks.getUtilityReading.mockResolvedValue({
      id: utilityReadingId,
      room_id: invoice.room_id,
      month: invoice.month,
      status: 'APPROVED',
      electricity_prev: 120,
      electricity_curr: 150,
      water_prev: 30,
      water_curr: 36,
    })
    invoiceServiceMocks.getInvoicePrefill.mockResolvedValue({
      building_id: invoice.building_id,
      contract_id: invoice.contract_id,
      tenant_id: invoice.tenant_id,
      tenant_name: invoice.tenant_name,
      issued_at: '2026-07-15',
      due_date: '2026-07-05',
      rent_amount: 3_000_000,
      other_fees: 250_000,
      electricity_prev: 150,
      water_prev: 36,
      electric_unit_price: 3_500,
      water_unit_price: 15_000,
    })
    window.history.replaceState(null, '', `/invoices?utilityReadingId=${utilityReadingId}`)

    render(<InvoicesPage />)

    expect(await screen.findByText('Create invoice from utility reading')).toBeInTheDocument()
    await waitFor(() => {
      expect(invoiceServiceMocks.getInvoicePrefill).toHaveBeenCalledWith(invoice.room_id, invoice.month)
    })

    expect(screen.getByLabelText('Previous electric reading')).toHaveValue('120')
    expect(screen.getByLabelText('Current electric reading')).toHaveValue('150')
    expect(screen.getByLabelText('Previous water reading')).toHaveValue('30')
    expect(screen.getByLabelText('Current water reading')).toHaveValue('36')
    expect(screen.getByLabelText('Billing month')).toHaveValue('2026-07-01')
    expect(screen.getByLabelText('Current electric reading')).toBeDisabled()
    expect(window.location.search).toBe('')
  })

  it('collects bank details and shows the generated VietQR after issuing', async () => {
    const user = userEvent.setup()
    const draftInvoice = {
      ...invoice,
      status: 'DRAFT',
      payment_status: null,
      issued_at: null,
      paid_at: null,
      paid_amount: 0,
      items: [],
      adjustments: [],
    }
    const issuedInvoice = { ...draftInvoice, status: 'ISSUED', issued_at: '2026-07-15T00:00:00.000Z' }
    const paymentRequest = {
      id: '00000000-0000-4000-8000-000000000951',
      invoice_id: invoice.id,
      status: 'WAITING_TRANSFER',
      amount: invoice.total,
      currency: 'VND',
      qr_content: '{}',
      qr_image_url: 'https://img.vietqr.io/image/970436-1234567890-compact2.png?amount=4000000',
      bank_code: '970436',
      bank_account_no: '1234567890',
      bank_account_name: 'RentMate Manager',
      transfer_note: `INV ${invoice.id.slice(0, 8)}`,
      expires_at: null,
      sent_at: '2026-07-15T00:00:00.000Z',
      created_at: '2026-07-15T00:00:00.000Z',
      updated_at: '2026-07-15T00:00:00.000Z',
      paid_amount: 0,
      remaining_amount: invoice.total,
      proofs: [],
    }
    invoiceServiceMocks.getInvoice.mockResolvedValue(draftInvoice)
    invoiceServiceMocks.issueInvoice.mockResolvedValue(issuedInvoice)
    paymentServiceMocks.getPaymentRequestByInvoice
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(paymentRequest)

    render(<InvoicesPage />)

    await user.click(await screen.findByRole('button', { name: 'View invoice' }))
    await user.click(await screen.findByRole('button', { name: /issue and create qr/i }))

    const dialogTitle = await screen.findByText('Issue invoice and create VietQR')
    const dialog = dialogTitle.closest('.ant-modal') as HTMLElement
    await user.type(within(dialog).getByLabelText('Bank code or BIN'), '970436')
    await user.type(within(dialog).getByLabelText('Bank account number'), '1234567890')
    await user.type(within(dialog).getByLabelText('Bank account name'), 'RentMate Manager')
    await user.click(within(dialog).getByRole('button', { name: 'Issue invoice' }))

    await waitFor(() => expect(invoiceServiceMocks.issueInvoice).toHaveBeenCalledWith(invoice.id, {
      bank_code: '970436',
      bank_account_no: '1234567890',
      bank_account_name: 'RentMate Manager',
      transfer_note: `INV ${invoice.id.slice(0, 8)}`,
    }))
    expect(await screen.findByAltText('VietQR bank transfer')).toHaveAttribute('src', paymentRequest.qr_image_url)
  })

  it('confirms a pending tenant payment proof and completes the invoice', async () => {
    const user = userEvent.setup()
    const issuedInvoice = {
      ...invoice,
      status: 'ISSUED',
      payment_status: null,
      paid_at: null,
      paid_amount: 0,
      items: [],
      adjustments: [],
    }
    const pendingProof = {
      id: '00000000-0000-4000-8000-000000000961',
      payment_request_id: '00000000-0000-4000-8000-000000000951',
      status: 'PENDING',
      file_name: 'payment-proof.jpg',
      file_url: 'https://res.cloudinary.com/demo/image/upload/payment-proof.jpg',
      mime_type: 'image/jpeg',
      file_size: 120_000,
      submitted_at: '2026-07-15T01:00:00.000Z',
      transfer_amount: invoice.total,
      transfer_time: null,
      payer_note: null,
      approved_at: null,
      rejected_at: null,
      rejection_reason: null,
    }
    const paymentRequest = {
      id: pendingProof.payment_request_id,
      invoice_id: invoice.id,
      status: 'TRANSFER_SUBMITTED',
      amount: invoice.total,
      currency: 'VND',
      qr_content: '{}',
      qr_image_url: null,
      bank_code: '970436',
      bank_account_no: '1234567890',
      bank_account_name: 'RentMate Manager',
      transfer_note: `INV ${invoice.id.slice(0, 8)}`,
      expires_at: null,
      sent_at: '2026-07-15T00:00:00.000Z',
      created_at: '2026-07-15T00:00:00.000Z',
      updated_at: '2026-07-15T01:00:00.000Z',
      paid_amount: 0,
      remaining_amount: invoice.total,
      proofs: [pendingProof],
    }
    invoiceServiceMocks.getInvoice
      .mockResolvedValueOnce(issuedInvoice)
      .mockResolvedValueOnce({ ...issuedInvoice, status: 'PAID', payment_status: 'SUCCEEDED', paid_amount: invoice.total })
    paymentServiceMocks.getPaymentRequestByInvoice
      .mockResolvedValueOnce(paymentRequest)
      .mockResolvedValueOnce({
        ...paymentRequest,
        status: 'VERIFIED',
        paid_amount: invoice.total,
        remaining_amount: 0,
        proofs: [{ ...pendingProof, status: 'APPROVED' }],
      })
    paymentServiceMocks.approvePaymentProof.mockResolvedValue({
      invoice_status: 'PAID',
      paid_amount: invoice.total,
      remaining_amount: 0,
    })

    render(<InvoicesPage />)

    await user.click(await screen.findByRole('button', { name: 'View invoice' }))
    await user.click(await screen.findByRole('button', { name: /confirm and complete invoice/i }))

    const dialogTitle = await screen.findByText('Confirm invoice payment?')
    const dialog = dialogTitle.closest('.ant-modal') as HTMLElement
    expect(within(dialog).getByText(/07\/2026 invoice/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Confirm payment' }))

    await waitFor(() => expect(paymentServiceMocks.approvePaymentProof).toHaveBeenCalledWith(pendingProof.id))
    await waitFor(() => expect(invoiceServiceMocks.getInvoice).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /confirm and complete invoice/i })).not.toBeInTheDocument()
    })
  }, 10_000)
})
