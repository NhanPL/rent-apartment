import { useI18n } from '../../../i18n'
import { Alert, Button, Card, Form, Input, Result, Typography } from 'antd'
import { useState } from 'react'
import { applyApiFieldErrors, getFormErrorMessage, getUserErrorMessage } from '../../../services/errorMessage'
import { LanguageSwitcher } from '../../../shared/components/LanguageSwitcher'
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
  const [form] = Form.useForm<ForgotPasswordFormValues>()
  const { t } = useI18n()
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
      applyApiFieldErrors(form, requestError)
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
      <>
        <Card className="password-reset-card" variant="borderless">
          <div className="password-reset-topbar">
            <Typography.Text className="password-reset-brand">
              {t("Rent Apartment Management")}
            </Typography.Text>
            <LanguageSwitcher />
          </div>

          {submitted ? (
            <Result
              status="success"
              title={t("Check your email")}
              subTitle={responseMessage}
              extra={<Button type="primary" onClick={goToLogin}>{t("Back to sign in")}</Button>}
            />
          ) : (
            <>
              <div className="password-reset-header">
                <Typography.Title level={2}>{t("Forgot password")}</Typography.Title>
                <Typography.Text type="secondary">
                  {t("Enter your account email to receive a password reset link.")}
                </Typography.Text>
              </div>

              {error ? <Alert type="error" message={error} showIcon className="password-reset-error" /> : null}

              <Form<ForgotPasswordFormValues>
                form={form}
                layout="vertical"
                requiredMark={false}
                size="large"
                onFinish={submit}
                onFinishFailed={(formError) => setError(getFormErrorMessage(formError))}
              >
                <Form.Item
                  label={t("Email")}
                  name="email"
                  rules={[
                    { required: true, message: t("Please enter your email address.") },
                    { type: 'email', message: t("Please enter a valid email address.") },
                  ]}
                >
                  <Input autoComplete="email" placeholder={t("Enter your email address")} allowClear />
                </Form.Item>

                <Button type="primary" htmlType="submit" loading={submitting} block>
                  {t("Send reset link")}
                </Button>
                <Button type="link" onClick={goToLogin} block>
                  {t("Back to sign in")}
                </Button>
              </Form>
            </>
          )}
        </Card>
      </>
    </AuthLayout>
  )
}
