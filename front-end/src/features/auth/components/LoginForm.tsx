import { Alert, Button, Card, Checkbox, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { useAuth } from '../useAuth'
import type { LoginFormValues } from '../types/auth'
import './LoginForm.css'

const { Title, Text } = Typography

function getHomePathByRole(role: 'MANAGER' | 'TENANT') {
  return role === 'TENANT' ? '/my-room' : '/dashboard'
}

export function LoginForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const { login } = useAuth()

  const onFinish = async (values: LoginFormValues) => {
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
    } catch {
      setError('Invalid username/email or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="login-card" bordered={false}>
      <div className="login-header">
        <Text className="login-eyebrow">Rent Apartment Management</Text>
        <Title level={2}>Welcome back</Title>
        <Text type="secondary">Sign in to manage buildings, tenants, and invoices.</Text>
      </div>

      {error ? <Alert type="error" message={error} showIcon className="login-error" /> : null}

      <Form<LoginFormValues>
        layout="vertical"
        requiredMark={false}
        onFinish={onFinish}
        initialValues={{ identifier: '', password: '', rememberMe: true }}
        size="large"
      >
        <Form.Item
          label="Username or email"
          name="identifier"
          rules={[{ required: true, message: 'Please enter your username or email.' }]}
        >
          <Input autoComplete="username" placeholder="manager@rent.vn or username" allowClear />
        </Form.Item>

        <Form.Item
          label="Password"
          name="password"
          rules={[{ required: true, message: 'Please enter your password.' }]}
        >
          <Input.Password autoComplete="current-password" placeholder="Enter your password" />
        </Form.Item>

        <Form.Item name="rememberMe" valuePropName="checked">
          <Checkbox>Remember me</Checkbox>
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={loading} block>
          Sign in
        </Button>
      </Form>
    </Card>
  )
}
