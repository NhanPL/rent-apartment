import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RentalRegistrationPage } from './RentalRegistrationPage'

const serviceMocks = vi.hoisted(() => ({
  addContractDocument: vi.fn(),
  deleteContractDocument: vi.fn(),
  getContract: vi.fn(),
  listBuildings: vi.fn(),
  listContracts: vi.fn(),
  listTenants: vi.fn(),
  listAvailableRooms: vi.fn(),
  reserveRoom: vi.fn(),
  handoverContract: vi.fn(),
  cancelRegistration: vi.fn(),
  uploadFileToCloudinary: vi.fn(),
}))

vi.mock('../../services/contractsService', () => ({
  addContractDocument: serviceMocks.addContractDocument,
  deleteContractDocument: serviceMocks.deleteContractDocument,
  getContract: serviceMocks.getContract,
  listBuildings: serviceMocks.listBuildings,
  listContracts: serviceMocks.listContracts,
  listTenants: serviceMocks.listTenants,
}))

vi.mock('../../services/rentalRegistrationService', () => ({
  listAvailableRooms: serviceMocks.listAvailableRooms,
  reserveRoom: serviceMocks.reserveRoom,
  handoverContract: serviceMocks.handoverContract,
  cancelRegistration: serviceMocks.cancelRegistration,
}))

vi.mock('../../services/uploadService', () => ({
  uploadFileToCloudinary: serviceMocks.uploadFileToCloudinary,
}))

vi.mock('../../shared/components/CloudinaryUploadButton', () => ({
  CloudinaryUploadButton: ({ children, onSelected }: {
    children: ReactNode
    onSelected: (file: File) => void
  }) => (
    <button type="button" onClick={() => {
      onSelected(new File(['contract-1'], 'signed-contract.pdf', { type: 'application/pdf', lastModified: 1 }))
      onSelected(new File(['contract-2'], 'identity.pdf', { type: 'application/pdf', lastModified: 2 }))
    }}>
      {children}
    </button>
  ),
}))

const draftContract = {
  id: 'contract-1',
  room_id: 'room-1',
  room_code: '101',
  building_id: 'building-1',
  building_name: 'Building A',
  contract_code: 'CONTRACT-001',
  status: 'DRAFT' as const,
  business_stage: 'RESERVED' as const,
  start_date: '2026-08-01',
  end_date: null,
  move_in_date: null,
  move_out_date: null,
  rent_price: 1000000,
  deposit_amount: 1000000,
  billing_day: 5,
  note: null,
  tenant_id: 'tenant-1',
  tenant_name: 'Tenant One',
  tenant_names: 'Tenant One',
  active_tenants_count: 1,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
}

describe('RentalRegistrationPage', () => {
  beforeEach(() => {
    serviceMocks.listBuildings.mockResolvedValue([])
    serviceMocks.listAvailableRooms.mockResolvedValue([])
    serviceMocks.listTenants.mockResolvedValue([])
    serviceMocks.listContracts.mockResolvedValue({ items: [draftContract], page: 1, pageSize: 100, total: 1 })
    serviceMocks.getContract.mockResolvedValue({
      ...draftContract,
      max_occupants: 2,
      tenants: [],
      documents: [{
        id: 'document-existing',
        contract_id: 'contract-1',
        doc_type: 'SIGNED_SCAN',
        file_name: 'existing.pdf',
        file_url: 'https://example.com/existing.pdf',
        mime_type: 'application/pdf',
        file_size: 1024,
        uploaded_by_user_id: 'manager-1',
        uploaded_at: '2026-07-01T00:00:00.000Z',
        note: null,
        created_at: '2026-07-01T00:00:00.000Z',
      }],
    })
    serviceMocks.addContractDocument.mockResolvedValue({ id: 'document-1' })
    serviceMocks.deleteContractDocument.mockResolvedValue(undefined)
    serviceMocks.uploadFileToCloudinary.mockImplementation(async (file: File) => ({
      file_name: file.name,
      file_url: `https://example.com/${file.name}`,
      mime_type: 'application/pdf',
      file_size: file.size,
      resource_type: 'raw',
      public_id: `contract/${file.name}`,
    }))
  })

  it('uploads only when the document form is submitted', async () => {
    const user = userEvent.setup()
    render(<RentalRegistrationPage />)

    await user.click(await screen.findByRole('tab', { name: /Bo sung giay to/ }))
    await user.click(await screen.findByRole('button', { name: /Bo sung giay to/ }))
    expect(await screen.findByText('existing.pdf')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Xoa existing.pdf' }))
    await waitFor(() => expect(screen.queryByText('existing.pdf')).toBeNull())
    expect(serviceMocks.deleteContractDocument).not.toHaveBeenCalled()

    await user.click(await screen.findByRole('button', { name: 'Chon nhieu file' }))

    expect(serviceMocks.uploadFileToCloudinary).not.toHaveBeenCalled()
    expect(serviceMocks.addContractDocument).not.toHaveBeenCalled()
    expect(serviceMocks.deleteContractDocument).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Luu giay to' }))

    await waitFor(() => expect(serviceMocks.deleteContractDocument).toHaveBeenCalledWith('contract-1', 'document-existing'))
    await waitFor(() => expect(serviceMocks.uploadFileToCloudinary).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(serviceMocks.addContractDocument).toHaveBeenCalledTimes(2))
    expect(serviceMocks.addContractDocument).toHaveBeenNthCalledWith(1, 'contract-1', expect.objectContaining({
      doc_type: 'SIGNED_SCAN',
      file_name: 'signed-contract.pdf',
      file_url: 'https://example.com/signed-contract.pdf',
    }))
    expect(serviceMocks.addContractDocument).toHaveBeenNthCalledWith(2, 'contract-1', expect.objectContaining({
      doc_type: 'SIGNED_SCAN',
      file_name: 'identity.pdf',
      file_url: 'https://example.com/identity.pdf',
    }))
  }, 20_000)
})
