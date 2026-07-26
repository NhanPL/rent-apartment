import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from 'antd'
import { ApiError } from '../services/apiClient'
import { AppLayout } from './AppLayout'

describe('AppLayout password change', () => {
  it('collects the current and confirmed new password', async () => {
    const user = userEvent.setup()
    const onChangePassword = vi.fn().mockResolvedValue(undefined)

    render(
      <AppLayout
        pathname="/dashboard"
        onNavigate={vi.fn()}
        items={[]}
        pageTitle="Dashboard"
        content={<div>Dashboard content</div>}
        currentUserName="Manager One"
        onLogout={vi.fn()}
        onChangePassword={onChangePassword}
        onRevokeAllSessions={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /manager one/i }))
    await user.click(await screen.findByText('Change password'))

    const dialog = screen.getByRole('dialog', { name: 'Change password' })
    await user.type(within(dialog).getByLabelText('Current password'), 'current-password')
    await user.type(within(dialog).getByLabelText('New password'), 'new-password')
    await user.type(within(dialog).getByLabelText('Confirm new password'), 'new-password')
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }))

    await waitFor(() => {
      expect(onChangePassword).toHaveBeenCalledWith({
        currentPassword: 'current-password',
        newPassword: 'new-password',
        confirmPassword: 'new-password',
      })
    })
  })

  it('keeps the modal open and displays a meaningful API error', async () => {
    const user = userEvent.setup()
    const onChangePassword = vi.fn().mockRejectedValue(
      new ApiError('Current password is incorrect', 'CURRENT_PASSWORD_INCORRECT', 400),
    )

    render(
      <AppLayout
        pathname="/dashboard"
        onNavigate={vi.fn()}
        items={[]}
        pageTitle="Dashboard"
        content={<div>Dashboard content</div>}
        currentUserName="Manager One"
        onLogout={vi.fn()}
        onChangePassword={onChangePassword}
        onRevokeAllSessions={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /manager one/i }))
    await user.click(await screen.findByText('Change password'))

    const dialog = screen.getByRole('dialog', { name: 'Change password' })
    await user.type(within(dialog).getByLabelText('Current password'), 'wrong-password')
    await user.type(within(dialog).getByLabelText('New password'), 'new-password')
    await user.type(within(dialog).getByLabelText('Confirm new password'), 'new-password')
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }))

    expect(await within(dialog).findByText('Password change failed')).toBeInTheDocument()
    expect(within(dialog).getByText('The current password is incorrect.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Change password' })).toBeInTheDocument()
  })

  it('confirms before signing out every device', async () => {
    const user = userEvent.setup()
    const onRevokeAllSessions = vi.fn().mockResolvedValue(undefined)
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockReturnValue(undefined as never)

    render(
      <AppLayout
        pathname="/dashboard"
        onNavigate={vi.fn()}
        items={[]}
        pageTitle="Dashboard"
        content={<div>Dashboard content</div>}
        currentUserName="Manager One"
        onLogout={vi.fn()}
        onChangePassword={vi.fn()}
        onRevokeAllSessions={onRevokeAllSessions}
      />,
    )

    await user.click(screen.getByRole('button', { name: /manager one/i }))
    await user.click(await screen.findByText('Sign out all devices'))
    expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Sign out all devices?',
      content: 'Every device signed in to this account will need to sign in again.',
    }))
    const confirmOptions = confirmSpy.mock.calls[0][0]
    await confirmOptions.onOk?.()

    await waitFor(() => expect(onRevokeAllSessions).toHaveBeenCalledOnce())
  })
})
