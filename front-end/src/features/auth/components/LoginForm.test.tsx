import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../../i18n/I18nContext'
import { translate } from '../../../i18n'
import { setActiveLanguage } from '../../../i18n/i18n'
import { LoginForm } from './LoginForm'
import { ApiError } from '../../../services/apiClient'

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
}))

vi.mock('../useAuth', () => ({
  useAuth: () => ({
    login: authMocks.login,
  }),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActiveLanguage('en')
  })

  it('requires a password before submitting credentials', async () => {
    const user = userEvent.setup()

    render(
      <I18nProvider>
        <LoginForm />
      </I18nProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Please enter your password.')).toBeInTheDocument()
    expect(authMocks.login).not.toHaveBeenCalled()
  })

  it('opens the forgot password page', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/login')

    render(
      <I18nProvider>
        <LoginForm />
      </I18nProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(window.location.pathname).toBe('/forgot-password')
  })

  it('does not submit credentials twice while a login is pending', async () => {
    const user = userEvent.setup()
    let resolveLogin!: (value: {
      id: string
      role: 'MANAGER'
      email: string
      username: string
      fullName: string
      tenantId: null
    }) => void
    authMocks.login.mockReturnValue(new Promise((resolve) => { resolveLogin = resolve }))
    render(<I18nProvider><LoginForm /></I18nProvider>)

    await user.type(screen.getByLabelText('Password'), 'E2E secure passphrase 2026')
    await user.dblClick(screen.getByRole('button', { name: 'Sign in' }))
    expect(authMocks.login).toHaveBeenCalledTimes(1)

    resolveLogin({
      id: 'manager-1',
      role: 'MANAGER',
      email: 'manager@example.test',
      username: 'manager',
      fullName: 'Manager',
      tenantId: null,
    })
  })

  it('updates the primary form language immediately', async () => {
    const user = userEvent.setup()
    render(<I18nProvider><LoginForm /></I18nProvider>)

    await user.click(screen.getByRole('button', { name: 'Language' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Vietnamese' }))
    expect(screen.getByRole('button', { name: translate('Sign in', 'vi') })).toBeInTheDocument()
    expect(screen.getByLabelText(translate('Password', 'vi'))).toBeInTheDocument()
  })

  it('requests and submits an authenticator code when two-factor authentication is enabled', async () => {
    const user = userEvent.setup()
    authMocks.login
      .mockRejectedValueOnce(new ApiError('Enter the code from your authenticator app', 'TWO_FACTOR_REQUIRED', 401))
      .mockResolvedValueOnce({
        id: 'manager-1', role: 'MANAGER', email: 'manager@example.test', username: 'manager',
        fullName: 'Manager', tenantId: null,
      })
    render(<I18nProvider><LoginForm /></I18nProvider>)

    await user.type(screen.getByLabelText('Password'), 'E2E secure passphrase 2026')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const codeInput = await screen.findByLabelText('Authentication code')
    await user.type(codeInput, '123456')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(authMocks.login).toHaveBeenLastCalledWith({
      identifier: 'manager',
      password: 'E2E secure passphrase 2026',
      twoFactorCode: '123456',
    })
  })
})
