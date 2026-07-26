import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../../i18n/I18nContext'
import { LoginForm } from './LoginForm'

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
}))

vi.mock('../useAuth', () => ({
  useAuth: () => ({
    login: authMocks.login,
  }),
}))

describe('LoginForm', () => {
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
})
