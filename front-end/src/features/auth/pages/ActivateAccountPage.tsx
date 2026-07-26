import { Alert, Button, Card, Form, Input, Result, Spin, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { getFormErrorMessage, getUserErrorMessage } from '../../../services/errorMessage'
import { LanguageSwitcher } from '../../../shared/components/LanguageSwitcher'
import { Localized } from '../../../shared/components/Localized'
import { AuthLayout } from '../../../shared/layout/AuthLayout'
import { activateAccount, validateAccountActivation } from '../authApi'
import type { ActivationTokenDetails } from '../types/auth'
import './ActivateAccountPage.css'

interface ActivationFormValues {
  newPassword: string
  confirmPassword: string
}

const goToLogin = () => {
  window.history.replaceState(null, '', '/login')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function ActivateAccountPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token')?.trim() ?? '', [])
  const [details, setDetails] = useState<ActivationTokenDetails | null>(null)
  const [validating, setValidating] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [activated, setActivated] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const validate = async () => {
      setValidating(true)
      setError('')
      try {
        if (!token) throw new Error('This activation link is invalid, expired, or has already been used.')
        const result = await validateAccountActivation(token)
        if (active) setDetails(result)
      } catch (validationError) {
        if (active) {
          setError(getUserErrorMessage(
            validationError,
            'This activation link is invalid, expired, or has already been used.',
          ))
        }
      } finally {
        if (active) setValidating(false)
      }
    }

    void validate()
    return () => {
      active = false
    }
  }, [token])

  const submit = async (values: ActivationFormValues) => {
    setSubmitting(true)
    setError('')
    try {
      await activateAccount({ token, ...values })
      setActivated(true)
    } catch (activationError) {
      setError(getUserErrorMessage(activationError, 'Unable to activate your account.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <Localized>
        <Card className="activation-card" bordered={false}>
          <div className="activation-topbar">
            <Typography.Text className="activation-brand">Rent Apartment Management</Typography.Text>
            <LanguageSwitcher />
          </div>

          {validating ? (
            <div className="activation-loading" role="status">
              <Spin size="large" />
              <Typography.Text type="secondary">Checking your activation link...</Typography.Text>
            </div>
          ) : null}

          {!validating && activated ? (
            <Result
              status="success"
              title="Account activated"
              subTitle="Your password has been set. Sign in to continue."
              extra={<Button type="primary" onClick={goToLogin}>Sign in</Button>}
            />
          ) : null}

          {!validating && !activated && !details ? (
            <Result
              status="error"
              title="Unable to activate account"
              subTitle={error}
              extra={<Button type="primary" onClick={goToLogin}>Back to sign in</Button>}
            />
          ) : null}

          {!validating && !activated && details ? (
            <>
              <div className="activation-header">
                <Typography.Title level={2}>Set your password</Typography.Title>
                <Typography.Text type="secondary">
                  Activate the account for {details.emailHint}.
                </Typography.Text>
              </div>

              {error ? <Alert type="error" message={error} showIcon className="activation-error" /> : null}

              <Form<ActivationFormValues>
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
                  Activate account
                </Button>
              </Form>
            </>
          ) : null}
        </Card>
      </Localized>
    </AuthLayout>
  )
}
