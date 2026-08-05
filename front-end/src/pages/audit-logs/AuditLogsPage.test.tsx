import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auditServiceMocks = vi.hoisted(() => ({ listAuditLogs: vi.fn() }))

vi.mock('../../services/auditLogsService', () => ({
  listAuditLogs: auditServiceMocks.listAuditLogs,
}))

import { AuditLogsPage } from './AuditLogsPage'

const auditEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  actor_user_id: '00000000-0000-4000-8000-000000000002',
  actor_role: 'MANAGER',
  actor_name: 'Manager One',
  manager_user_id: '00000000-0000-4000-8000-000000000002',
  action: 'INVOICE_VOIDED',
  entity_type: 'INVOICE',
  entity_id: '00000000-0000-4000-8000-000000000003',
  request_id: 'request-1234',
  client_ip_hash: 'hashed-ip',
  user_agent: 'Test browser',
  metadata: { reason: 'Incorrect amount' },
  before_snapshot: { status: 'ISSUED' },
  after_snapshot: { status: 'VOID' },
  created_at: '2026-08-05T12:00:00.000Z',
}

describe('AuditLogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auditServiceMocks.listAuditLogs.mockResolvedValue({
      items: [auditEvent],
      pagination: { page: 1, pageSize: 25, total: 1 },
    })
  })

  it('loads scoped events and opens immutable event details', async () => {
    const user = userEvent.setup()
    render(<AuditLogsPage />)

    expect(await screen.findByText('Manager One')).toBeInTheDocument()
    expect(screen.getByText('INVOICE_VOIDED')).toBeInTheDocument()
    expect(auditServiceMocks.listAuditLogs).toHaveBeenCalledWith({ page: 1, pageSize: 25 })

    await user.click(screen.getByRole('button', { name: 'View audit detail' }))

    expect(await screen.findByText('Audit detail')).toBeInTheDocument()
    expect(screen.getByText('Test browser')).toBeInTheDocument()
    expect(screen.getByText(/Incorrect amount/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/ISSUED/)).toBeInTheDocument())
  })
})
