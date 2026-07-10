import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RentalRegistrationPage } from './RentalRegistrationPage'

const serviceMocks = vi.hoisted(() => ({
  addContractDocument: vi.fn(),
  getContract: vi.fn(),
  listBuildings: vi.fn(),
  listContracts: vi.fn(),
  listTenants: vi.fn(),
  listAvailableRooms: vi.fn(),
  reserveRoom: vi.fn(),
  handoverContract: vi.fn(),
  cancelRegistration: vi.fn(),
}))

vi.mock('../../services/contractsService', () => ({
  addContractDocument: serviceMocks.addContractDocument,
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

vi.mock('../../shared/components/CloudinaryUploadButton', () => ({
  CloudinaryUploadButton: ({ children, onUploaded }: {
    children: ReactNode
    onUploaded: (file: {
      file_name: string
      file_url: string
      mime_type: string
      file_size: number
      resource_type: 'raw'
      public_id: string
    }) => void
  }) => (
    <button type="button" onClick={() => onUploaded({
      file_name: 'signed-contract.pdf',
      file_url: 'https://example.com/signed-contract.pdf',
      mime_type: 'application/pdf',
      file_size: 2048,
      resource_type: 'raw',
      public_id: 'contract/signed-contract',
    })}>
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
      documents: [],
    })
    serviceMocks.addContractDocument.mockResolvedValue({ id: 'document-1' })
  })

  it('uploads and persists a document for a draft registration', async () => {
    const user = userEvent.setup()
    render(<RentalRegistrationPage />)

    await user.click(await screen.findByRole('tab', { name: /Bo sung giay to/ }))
    await user.click(await screen.findByRole('button', { name: /Bo sung giay to/ }))
    await user.click(await screen.findByRole('button', { name: 'Upload file' }))
    await user.click(screen.getByRole('button', { name: 'Luu giay to' }))

    await waitFor(() => expect(serviceMocks.addContractDocument).toHaveBeenCalledWith('contract-1', {
      doc_type: 'SIGNED_SCAN',
      file_name: 'signed-contract.pdf',
      file_url: 'https://example.com/signed-contract.pdf',
      mime_type: 'application/pdf',
      file_size: 2048,
      note: null,
    }))
  })
})
