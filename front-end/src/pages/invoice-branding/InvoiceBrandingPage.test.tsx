import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InvoiceBrandingPage } from './InvoiceBrandingPage'

const mocks = vi.hoisted(() => ({ getInvoiceBranding: vi.fn(), updateInvoiceBranding: vi.fn() }))
vi.mock('../../services/invoiceBrandingService', async () => ({ ...mocks }))

const branding = {
  display_name: 'RentMate Residence', business_address: '1 Main Street', tax_code: 'TAX-1',
  logo_url: 'https://example.com/logo.png', accent_color: '#1677FF', invoice_title: 'Monthly Invoice',
  default_note: 'Thank you.'
}

describe('InvoiceBrandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getInvoiceBranding.mockResolvedValue(branding)
    mocks.updateInvoiceBranding.mockResolvedValue(branding)
  })

  it('loads, previews, and saves manager branding', async () => {
    const user = userEvent.setup()
    render(<InvoiceBrandingPage />)
    expect(await screen.findAllByText('RentMate Residence')).not.toHaveLength(0)
    await user.clear(screen.getByLabelText('Display name'))
    await user.type(screen.getByLabelText('Display name'), 'Updated Residence')
    await user.click(screen.getByRole('button', { name: /Save branding/ }))
    await waitFor(() => expect(mocks.updateInvoiceBranding).toHaveBeenCalledWith(expect.objectContaining({
      display_name: 'Updated Residence'
    })))
  })
})
