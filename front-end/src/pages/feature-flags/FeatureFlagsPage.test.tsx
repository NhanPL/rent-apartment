import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeatureFlagsPage } from './FeatureFlagsPage'

const mocks = vi.hoisted(() => ({ setFlag: vi.fn(), refresh: vi.fn() }))
vi.mock('../../features/feature-flags/useFeatureFlags', () => ({
  useFeatureFlags: () => ({
    flags: { CSV_IMPORTS: true, BULK_BILLING_ACTIONS: true, LIVE_DASHBOARD: true, INVOICE_BRANDING: true },
    loading: false, error: null, isEnabled: () => true, refresh: mocks.refresh, setFlag: mocks.setFlag,
  }),
}))

describe('FeatureFlagsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.setFlag.mockResolvedValue(undefined) })

  it('updates the selected manager feature', async () => {
    const user = userEvent.setup()
    render(<FeatureFlagsPage />)
    await user.click(screen.getByRole('switch', { name: 'CSV data import' }))
    await waitFor(() => expect(mocks.setFlag).toHaveBeenCalledWith('CSV_IMPORTS', false))
  })
})
