import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tenantMocks = vi.hoisted(() => ({
  createTenant: vi.fn(),
  deleteTenant: vi.fn(),
  exportTenantData: vi.fn(),
  getTenant: vi.fn(),
  listTenants: vi.fn(),
  resendTenantActivation: vi.fn(),
  updateTenant: vi.fn(),
  updateTenantAccountStatus: vi.fn(),
  updateTenantIdentityDocuments: vi.fn(),
}))
const uploadMocks = vi.hoisted(() => ({ uploadFileToCloudinary: vi.fn() }))

vi.mock('../../services/tenantsService', () => tenantMocks)
vi.mock('../../services/uploadService', () => ({ uploadFileToCloudinary: uploadMocks.uploadFileToCloudinary }))

import { TenantsPage } from './TenantsPage'
import { ApiError } from '../../services/apiClient'

const tenant = {
  id: 'tenant-1',
  user_id: 'user-1',
  full_name: 'Tenant One',
  dob: null,
  gender: null,
  identity_number: '012345678901',
  identity_issued_date: null,
  identity_issued_place: null,
  email: 'tenant@example.com',
  phone: '0900000000',
  permanent_address: null,
  status: 'ACTIVE',
  account_status: 'ACTIVE',
  note: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  current_room: null,
}

const existingFront = {
  id: 'document-front',
  tenant_id: 'tenant-1',
  doc_type: 'IDENTITY_FRONT',
  file_name: 'existing-front.jpg',
  file_url: 'https://res.cloudinary.com/demo/image/upload/tenant-documents/existing-front.jpg',
  mime_type: 'image/jpeg',
  file_size: 100,
  uploaded_at: '2026-07-01T00:00:00.000Z',
}

describe('TenantsPage profile form', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tenantMocks.listTenants.mockResolvedValue({ items: [tenant], page: 1, pageSize: 8, total: 1 })
    tenantMocks.createTenant.mockResolvedValue({
      message: 'Tenant created successfully',
      tenantId: 'tenant-new',
      userId: 'user-new',
      emailSent: true,
    })
    tenantMocks.updateTenantIdentityDocuments.mockResolvedValue({ front: null, back: null })
    tenantMocks.getTenant.mockResolvedValue({
      ...tenant,
      current_contract: null,
      identity_documents: { front: existingFront, back: null },
      privacy_policy_version: '2026-08-06',
      privacy_consent_granted: true,
      privacy_consent_recorded_at: '2026-07-01T00:00:00.000Z',
    })
    tenantMocks.updateTenant.mockResolvedValue(tenant)
    tenantMocks.updateTenantAccountStatus.mockResolvedValue({ accountStatus: 'DISABLED' })
    tenantMocks.deleteTenant.mockResolvedValue({
      message: 'Tenant data was anonymized successfully.',
      status: 'ANONYMIZED',
      eligibleAt: '2026-07-01T00:00:00.000Z',
    })
    tenantMocks.exportTenantData.mockResolvedValue({ tenant: { id: 'tenant-1' } })
    tenantMocks.resendTenantActivation.mockResolvedValue({
      message: 'Activation invitation sent successfully',
      emailSent: true,
      expiresAt: '2026-07-28T00:00:00.000Z',
    })
    uploadMocks.uploadFileToCloudinary.mockResolvedValue({
      file_name: 'front.jpg',
      file_url: 'https://res.cloudinary.com/demo/image/upload/tenant-documents/front.jpg',
      mime_type: 'image/jpeg',
      file_size: 5,
      resource_type: 'image',
      public_id: 'tenant-documents/front',
    })
  })

  it('keeps rental fields out of the page and uploads a selected ID image only after Save', async () => {
    const user = userEvent.setup()
    render(<TenantsPage />)

    expect(await screen.findByText('Tenant One')).toBeInTheDocument()
    expect(screen.queryByText('Current Building / Room')).not.toBeInTheDocument()
    expect(screen.queryByText('Export Contract')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Add Tenant/ }))
    await user.type(await screen.findByLabelText('Full name'), 'New Tenant')
    await user.type(screen.getByLabelText('Phone'), '0911111111')
    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Citizen ID number'), '123456789012')
    await user.click(screen.getByRole('checkbox', { name: /agreed to the privacy policy/i }))

    expect(screen.getByText('Citizen ID - Front')).toBeInTheDocument()
    expect(screen.getByText('Citizen ID - Back')).toBeInTheDocument()
    const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]')
    expect(fileInputs).toHaveLength(2)
    await user.upload(fileInputs[0], new File(['front'], 'front.jpg', { type: 'image/jpeg' }))
    expect(uploadMocks.uploadFileToCloudinary).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(tenantMocks.createTenant).toHaveBeenCalled())
    expect(tenantMocks.createTenant.mock.calls[0][0]).not.toHaveProperty('contract')
    expect(uploadMocks.uploadFileToCloudinary).toHaveBeenCalledWith(expect.any(File), 'TENANT_DOCUMENT')
    expect(tenantMocks.updateTenantIdentityDocuments).toHaveBeenCalledWith('tenant-new', {
      front: expect.objectContaining({
        file_name: 'front.jpg',
        mime_type: 'image/jpeg',
        resource_type: 'image',
      }),
    })
  })

  it('removes an existing identity image only when the edited tenant is saved', async () => {
    const user = userEvent.setup()
    render(<TenantsPage />)

    expect(await screen.findByText('Tenant One')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit Tenant One' }))
    expect(await screen.findByAltText('existing-front.jpg')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(tenantMocks.updateTenantIdentityDocuments).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(tenantMocks.updateTenantIdentityDocuments).toHaveBeenCalledWith('tenant-1', { front: null })
    })
    expect(uploadMocks.uploadFileToCloudinary).not.toHaveBeenCalled()
  })

  it('lets the manager resend activation for a pending tenant account', async () => {
    const user = userEvent.setup()
    tenantMocks.listTenants.mockResolvedValue({
      items: [{ ...tenant, account_status: 'PENDING_ACTIVATION' }],
      page: 1,
      pageSize: 8,
      total: 1,
    })

    render(<TenantsPage />)

    await user.click(await screen.findByRole('button', {
      name: 'Resend activation invitation to Tenant One',
    }))

    await waitFor(() => {
      expect(tenantMocks.resendTenantActivation).toHaveBeenCalledWith('tenant-1')
    })
  })

  it('confirms account deactivation without deleting the tenant profile', async () => {
    const user = userEvent.setup()
    render(<TenantsPage />)

    await user.click(await screen.findByRole('button', { name: 'Deactivate account for Tenant One' }))
    expect(screen.getByText(/profile, contracts, invoices, and payments will be retained/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Deactivate account' }))

    await waitFor(() => {
      expect(tenantMocks.updateTenantAccountStatus).toHaveBeenCalledWith('tenant-1', 'DISABLED')
    })
    expect(tenantMocks.deleteTenant).not.toHaveBeenCalled()
  })

  it('keeps a meaningful update error visible in the tenant drawer', async () => {
    const user = userEvent.setup()
    tenantMocks.updateTenant.mockRejectedValueOnce(
      new ApiError('Internal server error', 'TENANT_UPDATE_FAILED', 500),
    )

    render(<TenantsPage />)

    await user.click(await screen.findByRole('button', { name: 'Edit Tenant One' }))
    await screen.findByDisplayValue('tenant@example.com')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const updateAlerts = await screen.findAllByRole('alert')
    expect(updateAlerts.some((alert) => (
      alert.textContent?.includes('Unable to update tenant information. Please try again.')
    ))).toBe(true)
    expect(screen.getByRole('dialog', { name: 'Edit Tenant' })).toBeInTheDocument()
  })

  it('shows form validation errors without calling the tenant API', async () => {
    const user = userEvent.setup()
    render(<TenantsPage />)

    await user.click(await screen.findByRole('button', { name: /Add Tenant/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const validationAlerts = await screen.findAllByRole('alert')
    expect(validationAlerts.some((alert) => (
      alert.textContent?.includes('Please enter the tenant name.')
    ))).toBe(true)
    expect(tenantMocks.createTenant).not.toHaveBeenCalled()
  })

  it('keeps a Cloudinary deletion error visible in the confirmation dialog', async () => {
    const user = userEvent.setup()
    tenantMocks.deleteTenant.mockRejectedValueOnce(
      new ApiError('Unable to delete file from Cloudinary', 'CLOUDINARY_DELETE_FAILED', 502),
    )

    render(<TenantsPage />)

    await user.click(await screen.findByRole('button', { name: 'Delete Tenant One' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    const deleteAlerts = await screen.findAllByRole('alert')
    expect(deleteAlerts.some((alert) => (
      alert.textContent?.includes('The file could not be removed from Cloudinary. No data was deleted.')
    ))).toBe(true)
    expect(screen.getByText(/Login access and Citizen ID images will be removed/)).toBeInTheDocument()
  })
})
