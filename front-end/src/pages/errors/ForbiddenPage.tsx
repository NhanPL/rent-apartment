import { Button, Result } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'

export function ForbiddenPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  return <Result status="403" title="403" subTitle="You do not have permission to open this page." extra={<Button type="primary" onClick={() => navigate(user?.role === 'TENANT' ? '/my-room' : '/dashboard')}>Back to home</Button>} />
}
