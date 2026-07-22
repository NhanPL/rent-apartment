import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const paymentServiceMocks = vi.hoisted(() => ({
  getPaymentRequest: vi.fn(),
  listPaymentRequests: vi.fn(),
}))

vi.mock('../../services/paymentsService', () => ({
  approvePaymentProof: vi.fn(),
  getPaymentRequest: paymentServiceMocks.getPaymentRequest,
  listPaymentRequests: paymentServiceMocks.listPaymentRequests,
  rejectPaymentProof: vi.fn(),
}))

import { PaymentsPage } from './PaymentsPage'

const paymentRequest = {
  id: '00000000-0000-4000-8000-000000000951',
  invoice_id: '00000000-0000-4000-8000-000000000901',
  status: 'WAITING_TRANSFER',
  amount: 4_000_000,
  currency: 'VND',
  qr_content: null,
  qr_image_url: null,
  bank_code: '970436',
  bank_account_no: '1234567890',
  bank_account_name: 'RentMate Manager',
  transfer_note: 'INV 00000000',
  expires_at: null,
  sent_at: '2026-07-01T00:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  month: '2026-07-01',
  building_id: '00000000-0000-4000-8000-000000000201',
  building_name: 'Sunrise Apartments',
  room_id: '00000000-0000-4000-8000-000000000301',
  room_code: '101',
  tenant_id: '00000000-0000-4000-8000-000000000101',
  tenant_name: 'Tenant One',
  paid_amount: 0,
  remaining_amount: 4_000_000,
  latest_proof_status: 'PENDING',
  latest_proof_submitted_at: '2026-07-02T00:00:00.000Z',
}

describe('PaymentsPage filters', () => {
  beforeEach(() => {
    paymentServiceMocks.listPaymentRequests.mockResolvedValue([paymentRequest])
  })

  it('renders every filter and reloads data for the selected request status', async () => {
    const user = userEvent.setup()
    render(<PaymentsPage />)

    expect(await screen.findByText('Tenant One')).toBeInTheDocument()
    expect(screen.getByLabelText('Month filter')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Building filter' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Room filter' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tenant filter' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Request status filter' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Latest proof filter' })).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Request status filter' }))
    const statusOption = (await screen.findAllByText('WAITING_TRANSFER'))
      .find((element) => element.classList.contains('ant-select-item-option-content'))
    expect(statusOption).toBeDefined()
    await user.click(statusOption!)

    await waitFor(() => {
      expect(paymentServiceMocks.listPaymentRequests).toHaveBeenCalledWith({
        request_status: 'WAITING_TRANSFER',
      })
    })
  })
})
