import { LoginForm } from '../components/LoginForm'
import { AuthLayout } from '../../../shared/layout/AuthLayout'

export function LoginPage() {
  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  )
}
