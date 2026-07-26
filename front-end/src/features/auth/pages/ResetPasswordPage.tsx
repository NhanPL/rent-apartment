import { Alert, Button, Card, Form, Input, Result, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { getFormErrorMessage, getUserErrorMessage } from '../../../services/errorMessage'
import { LanguageSwitcher } from '../../../shared/components/LanguageSwitcher'
import { Localized } from '../../../shared/components/Localized'
import { AuthLayout } from '../../../shared/layout/AuthLayout'
import { confirmPasswordReset } from '../authApi'
import { useAuth } from '../useAuth'
import './PasswordResetPage.css'

interface ResetPasswordFormValues {
  newPassword: string
  confirmPassword: string
}

const goToLogin = () => {
  window.history.replaceState(null, '', '/login')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function ResetPasswordPage() {
  const { logout } = useAuth()
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token')?.trim() ?? '', [])
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState('')

  const submit = async (values: ResetPasswordFormValues) => {
    setSubmitting(true)
    setError('')
    try {
      await confirmPasswordReset({ token, ...values })
      await logout()
      setCompleted(true)
    } catch (resetError) {
      setError(getUserErrorMessage(
        resetError,
        'Unable to reset your password. Please request a new link and try again.',
      ))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <Localized>
        <Card className="password-reset-card" variant="borderless">
          <div className="password-reset-topbar">
            <Typography.Text className="password-reset-brand">
              Rent Apartment Management
            </Typography.Text>
            <LanguageSwitcher />
          </div>

          {completed ? (
            <Result
              status="success"
              title="Password reset successfully"
              subTitle="Your password has been changed and all existing sessions have been signed out."
              extra={<Button type="primary" onClick={goToLogin}>Sign in</Button>}
            />
          ) : !token ? (
            <Result
              status="error"
              title="Unable to reset password"
              subTitle="This password reset link is invalid, expired, or has already been used."
              extra={<Button type="primary" onClick={goToLogin}>Back to sign in</Button>}
            />
          ) : (
            <>
              <div className="password-reset-header">
                <Typography.Title level={2}>Reset password</Typography.Title>
                <Typography.Text type="secondary">
                  Create a new password for your account.
                </Typography.Text>
              </div>

              {error ? <Alert type="error" message={error} showIcon className="password-reset-error" /> : null}

              <Form<ResetPasswordFormValues>
                layout="vertical"
                requiredMark={false}
                size="large"
                onFinish={submit}
                onFinishFailed={(formError) => setError(getFormErrorMessage(formError))}
              >
                <Form.Item
                  label="New password"
                  name="newPassword"
                  rules={[
                    { required: true, message: 'Please enter a new password.' },
                    { min: 8, message: 'The new password must contain at least 8 characters.' },
                    { max: 72, message: 'The new password cannot exceed 72 characters.' },
                  ]}
                >
                  <Input.Password autoComplete="new-password" placeholder="Enter your new password" />
                </Form.Item>

                <Form.Item
                  label="Confirm new password"
                  name="confirmPassword"
                  dependencies={['newPassword']}
                  rules={[
                    { required: true, message: 'Please confirm your new password.' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('newPassword') === value) return Promise.resolve()
                        return Promise.reject(new Error('The password confirmation does not match.'))
                      },
                    }),
                  ]}
                >
                  <Input.Password autoComplete="new-password" placeholder="Confirm your new password" />
                </Form.Item>

                <Button type="primary" htmlType="submit" loading={submitting} block>
                  Reset password
                </Button>
              </Form>
            </>
          )}
        </Card>
      </Localized>
    </AuthLayout>
  )
}
