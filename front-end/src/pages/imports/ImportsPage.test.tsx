import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportsPage } from './ImportsPage'

const importMocks = vi.hoisted(() => ({ previewImport: vi.fn(), commitImport: vi.fn() }))
vi.mock('../../services/importsService', () => importMocks)

describe('ImportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    importMocks.previewImport.mockResolvedValue({
      entity: 'BUILDING', valid: true, total: 1,
      rows: [{ code: 'BLD-A', name: 'Alpha', address: '1 Main Street', note: '' }], errors: [],
    })
    importMocks.commitImport.mockResolvedValue({ entity: 'BUILDING', imported: 1, ids: ['building-1'], failed: [] })
  })

  it('parses, previews, and commits a valid CSV file', async () => {
    const user = userEvent.setup()
    const { container } = render(<ImportsPage />)
    const file = new File(['code,name,address,note\nBLD-A,Alpha,1 Main Street,'], 'buildings.csv', { type: 'text/csv' })
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    await user.upload(fileInput, file)
    expect(await screen.findByText('buildings.csv')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() => expect(importMocks.previewImport).toHaveBeenCalledWith('BUILDING', [{
      code: 'BLD-A', name: 'Alpha', address: '1 Main Street', note: '',
    }]))
    expect(await screen.findByText('All rows are valid and ready to import.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Import valid rows' }))
    await waitFor(() => expect(importMocks.commitImport).toHaveBeenCalledOnce())
  })
})
