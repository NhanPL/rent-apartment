import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({ apiRequest: vi.fn() }))

vi.mock('./apiClient', () => ({ apiRequest: apiMocks.apiRequest }))

import { updateTenantIdentityDocuments } from './tenantsService'

describe('updateTenantIdentityDocuments', () => {
  beforeEach(() => {
    apiMocks.apiRequest.mockResolvedValue({ front: null, back: null })
  })

  it('sends identity image changes to the tenant-scoped endpoint', async () => {
    await updateTenantIdentityDocuments('tenant-1', { back: null })

    expect(apiMocks.apiRequest).toHaveBeenCalledWith('/tenants/tenant-1/identity-documents', {
      method: 'PUT',
      body: { back: null },
    })
  })
})
