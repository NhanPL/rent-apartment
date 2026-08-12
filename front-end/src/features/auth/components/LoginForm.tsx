import { Alert, Button, Card, Checkbox, Form, Input, Typography } from 'antd'
import { useRef, useState } from 'react'
import { useAuth } from '../useAuth'
import type { LoginFormValues } from '../types/auth'
import { applyApiFieldErrors, getFormErrorMessage, getUserErrorMessage } from '../../../services/errorMessage'
import { useI18n } from '../../../i18n'
import { LanguageSwitcher } from '../../../shared/components/LanguageSwitcher'
import { PASSWORD_MAX_LENGTH } from '../passwordPolicy'
import './LoginForm.css'

const { Title, Text } = Typography

function getHomePathByRole(role: 'MANAGER' | 'TENANT') {
  return role === 'TENANT' ? '/my-room' : '/dashboard'
}

function goToForgotPassword() {
  window.history.pushState(null, '', '/forgot-password')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function LoginForm() {
  const { t } = useI18n()
  const [form] = Form.useForm<LoginFormValues>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const submittingRef = useRef(false)
  const { login } = useAuth()

  const onFinish = async (values: LoginFormValues) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    setError('')

    try {
      const user = await login({
        identifier: values.identifier.trim(),
        password: values.password,
      })

      const targetPath = getHomePathByRole(user.role)
      window.history.replaceState(null, '', targetPath)
      window.dispatchEvent(new PopStateEvent('popstate'))
    } catch (loginError) {
      applyApiFieldErrors(form, loginError)
      setError(getUserErrorMessage(loginError, t('Unable to sign in. Please check your account details.')))
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  return (
    <>
    <Card className="login-card" variant="borderless">
      <div className="login-topbar">
        <Text className="login-eyebrow">{t("Rent Apartment Management")}</Text>
        <div className="login-language-switcher">
          <LanguageSwitcher />
        </div>
      </div>
      <div className="login-header">
        <Title level={2}>{t("Welcome back")}</Title>
        <Text type="secondary">{t("Sign in to manage buildings, tenants, and invoices.")}</Text>
      </div>

      {error ? <Alert type="error" message={error} showIcon className="login-error" /> : null}

      <Form<LoginFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={onFinish}
        onFinishFailed={(formError) => setError(getFormErrorMessage(formError))}
        initialValues={{ identifier: 'manager', password: '', rememberMe: true }}
        size="large"
      >
        <Form.Item
          label={t("Username or email")}
          name="identifier"
          rules={[{ required: true, message: t("Please enter your username or email.") }]}
        >
          <Input autoComplete="username" placeholder={t("manager@rent.vn or username")} allowClear />
        </Form.Item>

        <Form.Item
          label={t("Password")}
          name="password"
          rules={[
            { required: true, message: t("Please enter your password.") },
            {
              max: PASSWORD_MAX_LENGTH,
              message: `The password cannot exceed ${PASSWORD_MAX_LENGTH} characters.`,
            },
          ]}
        >
          <Input.Password autoComplete="current-password" placeholder={t("Enter your password")} />
        </Form.Item>

        <Form.Item name="rememberMe" valuePropName="checked">
          <Checkbox>{t("Remember me")}</Checkbox>
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={loading} block>
          {t("Sign in")}
        </Button>
        <div className="login-forgot-password">
          <Button type="link" onClick={goToForgotPassword}>
            {t("Forgot password?")}
          </Button>
        </div>
      </Form>
    </Card>
    </>
  )
}
