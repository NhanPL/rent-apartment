import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const activationMocks = vi.hoisted(() => ({
  activateAccount: vi.fn(),
  validateAccountActivation: vi.fn(),
}))

vi.mock('../authApi', () => activationMocks)

import { ActivateAccountPage } from './ActivateAccountPage'

describe('ActivateAccountPage', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/activate-account?token=valid-activation-token-that-is-long-enough')
    activationMocks.validateAccountActivation.mockResolvedValue({
      valid: true,
      emailHint: 'te****@example.com',
      expiresAt: '2026-07-28T00:00:00.000Z',
    })
    activationMocks.activateAccount.mockResolvedValue({ success: true })
  })

  it('validates the link and activates the account after matching passwords are entered', async () => {
    const user = userEvent.setup()
    render(<ActivateAccountPage />)

    expect(await screen.findByText('Set your password')).toBeInTheDocument()
    expect(activationMocks.validateAccountActivation).toHaveBeenCalledWith(
      'valid-activation-token-that-is-long-enough',
    )

    await user.type(screen.getByLabelText('New password'), 'secure-password-123')
    await user.type(screen.getByLabelText('Confirm new password'), 'secure-password-123')
    await user.click(screen.getByRole('button', { name: 'Activate account' }))

    await waitFor(() => {
      expect(activationMocks.activateAccount).toHaveBeenCalledWith({
        token: 'valid-activation-token-that-is-long-enough',
        newPassword: 'secure-password-123',
        confirmPassword: 'secure-password-123',
      })
    })
    expect(await screen.findByText('Account activated')).toBeInTheDocument()
  })

  it('shows a useful error when the activation link is invalid', async () => {
    activationMocks.validateAccountActivation.mockRejectedValue(
      new Error('This activation link is invalid, expired, or has already been used.'),
    )

    render(<ActivateAccountPage />)

    expect(await screen.findByText('Unable to activate account')).toBeInTheDocument()
    expect(screen.getByText('This activation link is invalid, expired, or has already been used.')).toBeInTheDocument()
  })

  it('blocks passwords shorter than the shared minimum length', async () => {
    const user = userEvent.setup()
    render(<ActivateAccountPage />)

    expect(await screen.findByText('Set your password')).toBeInTheDocument()
    await user.type(screen.getByLabelText('New password'), 'too-short')
    await user.type(screen.getByLabelText('Confirm new password'), 'too-short')
    await user.click(screen.getByRole('button', { name: 'Activate account' }))

    expect(
      await screen.findAllByText('The new password must contain at least 12 characters.'),
    ).not.toHaveLength(0)
    expect(activationMocks.activateAccount).not.toHaveBeenCalled()
  })
})
