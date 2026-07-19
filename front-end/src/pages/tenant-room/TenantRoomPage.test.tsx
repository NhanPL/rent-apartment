import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tenantRoomServiceMocks = vi.hoisted(() => ({
  getCurrentAndPreviousUtilityReadings: vi.fn(),
  getCurrentMonthBill: vi.fn(),
  getMyInvoiceDetail: vi.fn(),
  getMyPaymentRequestForInvoice: vi.fn(),
  getMyRoomContext: vi.fn(),
  getMyRoommates: vi.fn(),
  listMyDocuments: vi.fn(),
  listMyRecentBills: vi.fn(),
  submitMyPaymentProof: vi.fn(),
}))

const uploadedProof = {
  file_name: 'old-invoice-payment.jpg',
  file_url: 'https://res.cloudinary.com/demo/image/upload/old-invoice-payment.jpg',
  mime_type: 'image/jpeg',
  file_size: 125_000,
}

vi.mock('../../services/tenantRoomService', () => ({
  createMyDocument: vi.fn(),
  getCurrentAndPreviousUtilityReadings: tenantRoomServiceMocks.getCurrentAndPreviousUtilityReadings,
  getCurrentMonthBill: tenantRoomServiceMocks.getCurrentMonthBill,
  getMyInvoiceDetail: tenantRoomServiceMocks.getMyInvoiceDetail,
  getMyPaymentRequestForInvoice: tenantRoomServiceMocks.getMyPaymentRequestForInvoice,
  getMyRoomContext: tenantRoomServiceMocks.getMyRoomContext,
  getMyRoommates: tenantRoomServiceMocks.getMyRoommates,
  listMyDocuments: tenantRoomServiceMocks.listMyDocuments,
  listMyRecentBills: tenantRoomServiceMocks.listMyRecentBills,
  submitMyPaymentProof: tenantRoomServiceMocks.submitMyPaymentProof,
  upsertMyUtilityReading: vi.fn(),
}))

vi.mock('../../shared/components/CloudinaryUploadButton', () => ({
  CloudinaryUploadButton: ({ children, onUploaded }: {
    children: React.ReactNode
    onUploaded?: (file: typeof uploadedProof) => void
  }) => <button type="button" onClick={() => onUploaded?.(uploadedProof)}>{children}</button>,
}))

import { TenantRoomPage } from './TenantRoomPage'

const oldInvoice = {
  id: '00000000-0000-4000-8000-000000000901',
  month: '2026-06-01',
  status: 'OVERDUE',
  payment_status: null,
  payment_request_id: '00000000-0000-4000-8000-000000000951',
  payment_request_status: 'WAITING_TRANSFER',
  due_date: '2026-06-05',
  issued_at: '2026-06-01T00:00:00.000Z',
  paid_at: null,
  paid_amount: 0,
  rent_amount: 3_000_000,
  electric_amount: 350_000,
  water_amount: 150_000,
  other_amount: 500_000,
  total: 4_000_000,
}

const oldInvoiceDetail = {
  ...oldInvoice,
  subtotal: oldInvoice.total,
  discount: 0,
  note: null,
  items: [],
  payments: [],
}

const paymentRequest = {
  id: oldInvoice.payment_request_id,
  invoice_id: oldInvoice.id,
  status: 'WAITING_TRANSFER',
  amount: oldInvoice.total,
  currency: 'VND',
  qr_content: null,
  qr_image_url: null,
  bank_code: '970436',
  bank_account_no: '1234567890',
  bank_account_name: 'RentMate Manager',
  transfer_note: 'INV 00000000',
  expires_at: null,
  sent_at: '2026-06-01T00:00:00.000Z',
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  paid_amount: 0,
  remaining_amount: oldInvoice.total,
  proofs: [],
  payments: [],
  payment: null,
}

describe('TenantRoomPage historical invoice payments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tenantRoomServiceMocks.getMyRoomContext.mockResolvedValue({
      tenant: { id: 'tenant-1', user_id: 'user-1', full_name: 'Tenant One', gender: null, phone: '0900000000', status: 'ACTIVE' },
      room: { id: 'room-1', building_id: 'building-1', code: '101', floor: 1, area_m2: 25, status: 'ACTIVE', base_rent: 3_000_000, max_occupants: 2, note: null },
      building: { id: 'building-1', manager_user_id: 'manager-1', code: 'SUN', name: 'Sunrise Apartments' },
      contract: { id: 'contract-1', room_id: 'room-1', status: 'ACTIVE', start_date: '2026-01-01', move_in_date: '2026-01-01', rent_price: 3_000_000 },
    })
    tenantRoomServiceMocks.getMyRoommates.mockResolvedValue([])
    tenantRoomServiceMocks.getCurrentMonthBill.mockResolvedValue(null)
    tenantRoomServiceMocks.listMyDocuments.mockResolvedValue([])
    tenantRoomServiceMocks.listMyRecentBills.mockResolvedValue([oldInvoice])
    tenantRoomServiceMocks.getCurrentAndPreviousUtilityReadings.mockResolvedValue({
      month: '2026-07-01',
      current_reading: null,
      previous_reading: null,
      electricity_prev_value: null,
      electricity_curr_value: null,
      electricity_usage: null,
      water_prev_value: null,
      water_curr_value: null,
      water_usage: null,
    })
    tenantRoomServiceMocks.getMyInvoiceDetail.mockResolvedValue(oldInvoiceDetail)
    tenantRoomServiceMocks.getMyPaymentRequestForInvoice
      .mockResolvedValueOnce(paymentRequest)
      .mockResolvedValueOnce({ ...paymentRequest, status: 'TRANSFER_SUBMITTED' })
    tenantRoomServiceMocks.submitMyPaymentProof.mockResolvedValue({ id: 'proof-1', status: 'PENDING' })
  })

  it('lets the tenant submit payment proof for an unpaid previous invoice', async () => {
    const user = userEvent.setup()
    render(<TenantRoomPage />)

    await user.click(await screen.findByRole('button', { name: 'View invoice 06/2026' }))
    expect(await screen.findByRole('button', { name: 'Submit payment proof' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Upload image' }))
    await user.click(screen.getByRole('button', { name: 'Submit payment proof' }))

    await waitFor(() => {
      expect(tenantRoomServiceMocks.submitMyPaymentProof).toHaveBeenCalledWith(paymentRequest.id, {
        ...uploadedProof,
        transfer_amount: oldInvoice.total,
        payer_note: null,
      })
    })
    expect(await screen.findByText('Payment proof is waiting for manager review.')).toBeInTheDocument()
  }, 10_000)
})
