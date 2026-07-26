import { Alert, Button, Card, Form, Input, Result, Typography } from 'antd'
import { useState } from 'react'
import { getFormErrorMessage, getUserErrorMessage } from '../../../services/errorMessage'
import { LanguageSwitcher } from '../../../shared/components/LanguageSwitcher'
import { Localized } from '../../../shared/components/Localized'
import { AuthLayout } from '../../../shared/layout/AuthLayout'
import { requestPasswordReset } from '../authApi'
import './PasswordResetPage.css'

interface ForgotPasswordFormValues {
  email: string
}

const goToLogin = () => {
  window.history.replaceState(null, '', '/login')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [responseMessage, setResponseMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (values: ForgotPasswordFormValues) => {
    setSubmitting(true)
    setError('')
    try {
      const response = await requestPasswordReset({ email: values.email.trim() })
      setResponseMessage(response.message)
      setSubmitted(true)
    } catch (requestError) {
      setError(getUserErrorMessage(
        requestError,
        'Unable to request a password reset. Please try again.',
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

          {submitted ? (
            <Result
              status="success"
              title="Check your email"
              subTitle={responseMessage}
              extra={<Button type="primary" onClick={goToLogin}>Back to sign in</Button>}
            />
          ) : (
            <>
              <div className="password-reset-header">
                <Typography.Title level={2}>Forgot password</Typography.Title>
                <Typography.Text type="secondary">
                  Enter your account email to receive a password reset link.
                </Typography.Text>
              </div>

              {error ? <Alert type="error" message={error} showIcon className="password-reset-error" /> : null}

              <Form<ForgotPasswordFormValues>
                layout="vertical"
                requiredMark={false}
                size="large"
                onFinish={submit}
                onFinishFailed={(formError) => setError(getFormErrorMessage(formError))}
              >
                <Form.Item
                  label="Email"
                  name="email"
                  rules={[
                    { required: true, message: 'Please enter your email address.' },
                    { type: 'email', message: 'Please enter a valid email address.' },
                  ]}
                >
                  <Input autoComplete="email" placeholder="Enter your email address" allowClear />
                </Form.Item>

                <Button type="primary" htmlType="submit" loading={submitting} block>
                  Send reset link
                </Button>
                <Button type="link" onClick={goToLogin} block>
                  Back to sign in
                </Button>
              </Form>
            </>
          )}
        </Card>
      </Localized>
    </AuthLayout>
  )
}
