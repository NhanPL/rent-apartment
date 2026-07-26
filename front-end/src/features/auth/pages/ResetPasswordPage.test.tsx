import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../services/apiClient'

const passwordResetMocks = vi.hoisted(() => ({
  confirmPasswordReset: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('../authApi', () => ({
  confirmPasswordReset: passwordResetMocks.confirmPasswordReset,
}))

vi.mock('../useAuth', () => ({
  useAuth: () => ({
    logout: passwordResetMocks.logout,
  }),
}))

import { ResetPasswordPage } from './ResetPasswordPage'

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/reset-password?token=valid-password-reset-token-that-is-long-enough')
    passwordResetMocks.confirmPasswordReset.mockReset()
    passwordResetMocks.confirmPasswordReset.mockResolvedValue({ success: true })
    passwordResetMocks.logout.mockReset()
    passwordResetMocks.logout.mockResolvedValue(undefined)
  })

  it('sets a new password and signs out the current local session', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordPage />)

    await user.type(screen.getByLabelText('New password'), 'secure-password-123')
    await user.type(screen.getByLabelText('Confirm new password'), 'secure-password-123')
    await user.click(screen.getByRole('button', { name: 'Reset password' }))

    await waitFor(() => {
      expect(passwordResetMocks.confirmPasswordReset).toHaveBeenCalledWith({
        token: 'valid-password-reset-token-that-is-long-enough',
        newPassword: 'secure-password-123',
        confirmPassword: 'secure-password-123',
      })
    })
    expect(passwordResetMocks.logout).toHaveBeenCalledOnce()
    expect(await screen.findByText('Password reset successfully')).toBeInTheDocument()
  })

  it('displays an invalid token error returned by the API', async () => {
    const user = userEvent.setup()
    passwordResetMocks.confirmPasswordReset.mockRejectedValue(
      new ApiError(
        'Internal server error',
        'PASSWORD_RESET_TOKEN_INVALID',
        400,
      ),
    )
    render(<ResetPasswordPage />)

    await user.type(screen.getByLabelText('New password'), 'secure-password-123')
    await user.type(screen.getByLabelText('Confirm new password'), 'secure-password-123')
    await user.click(screen.getByRole('button', { name: 'Reset password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This password reset link is invalid, expired, or has already been used.',
    )
    expect(passwordResetMocks.logout).not.toHaveBeenCalled()
  })

  it('does not display the form when the URL has no token', () => {
    window.history.replaceState(null, '', '/reset-password')
    render(<ResetPasswordPage />)

    expect(screen.getByText('Unable to reset password')).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })
})
