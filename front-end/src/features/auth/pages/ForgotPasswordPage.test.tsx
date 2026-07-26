import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../services/apiClient'

const passwordResetMocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
}))

vi.mock('../authApi', () => ({
  requestPasswordReset: passwordResetMocks.requestPasswordReset,
}))

import { ForgotPasswordPage } from './ForgotPasswordPage'

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    passwordResetMocks.requestPasswordReset.mockReset()
    passwordResetMocks.requestPasswordReset.mockResolvedValue({
      message: 'If an active account exists for this email, password reset instructions will be sent shortly.',
    })
  })

  it('submits an email and displays the generic response', async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText('Email'), 'tenant@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    await waitFor(() => {
      expect(passwordResetMocks.requestPasswordReset).toHaveBeenCalledWith({
        email: 'tenant@example.com',
      })
    })
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(screen.getByText(
      'If an active account exists for this email, password reset instructions will be sent shortly.',
    )).toBeInTheDocument()
  })

  it('keeps a meaningful API error visible', async () => {
    const user = userEvent.setup()
    passwordResetMocks.requestPasswordReset.mockRejectedValue(
      new ApiError('Service temporarily unavailable', 'SERVICE_UNAVAILABLE', 503),
    )
    render(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText('Email'), 'tenant@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The system is temporarily unavailable. Please try again later.',
    )
  })
})
