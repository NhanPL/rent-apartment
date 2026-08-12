import { DeleteOutlined, LaptopOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, List, Modal, Space, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../../i18n'
import { getUserErrorMessage } from '../../../services/errorMessage'
import { listSessions, revokeSession } from '../authApi'
import type { AuthSession } from '../types/auth'
import { useAuth } from '../useAuth'
import './SessionsPage.css'

const describeDevice = (userAgent: string | null): string => {
  if (!userAgent) return 'Unknown device'
  const browser = userAgent.includes('Edg/') ? 'Microsoft Edge'
    : userAgent.includes('Chrome/') ? 'Google Chrome'
      : userAgent.includes('Firefox/') ? 'Mozilla Firefox'
        : userAgent.includes('Safari/') ? 'Safari'
          : 'Browser'
  const platform = userAgent.includes('Windows') ? 'Windows'
    : userAgent.includes('Android') ? 'Android'
      : userAgent.includes('iPhone') || userAgent.includes('iPad') ? 'iOS'
        : userAgent.includes('Mac OS') ? 'macOS'
          : userAgent.includes('Linux') ? 'Linux'
            : 'Unknown platform'
  return `${browser} on ${platform}`
}

export function SessionsPage() {
  const { t } = useI18n()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<AuthSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems((await listSessions()).items)
    } catch (loadError) {
      setError(getUserErrorMessage(loadError, 'Unable to load active sessions.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const confirmRevoke = (session: AuthSession) => {
    Modal.confirm({
      title: t(session.current ? 'Sign out this device?' : 'Sign out this device remotely?'),
      content: t('This session will immediately lose access to your account.'),
      okText: t('Sign out device'),
      okButtonProps: { danger: true },
      cancelText: t('Cancel'),
      onOk: async () => {
        setRevokingId(session.id)
        try {
          const result = await revokeSession(session.id)
          message.success(t('The device has been signed out.'))
          if (result.revokedCurrent) {
            await logout()
            navigate('/login', { replace: true })
            return
          }
          await load()
        } catch (revokeError) {
          message.error(getUserErrorMessage(revokeError, t('Unable to sign out this device.')))
          throw revokeError
        } finally {
          setRevokingId(null)
        }
      },
    })
  }

  return (
    <Space direction="vertical" size={16} className="sessions-page">
      <div className="sessions-header">
        <div>
          <Typography.Title level={3}>{t('Sessions & Devices')}</Typography.Title>
          <Typography.Text type="secondary">{t('Review devices currently signed in to your account.')}</Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>{t('Refresh')}</Button>
      </div>
      {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => void load()}>{t('Retry')}</Button>} /> : null}
      <List
        loading={loading}
        dataSource={items}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No active sessions found')} /> }}
        renderItem={(session) => (
          <List.Item
            className="session-row"
            actions={[
              <Button
                key="revoke"
                danger
                icon={<DeleteOutlined />}
                aria-label={t('Sign out')}
                loading={revokingId === session.id}
                onClick={() => confirmRevoke(session)}
              >{t('Sign out')}</Button>,
            ]}
          >
            <List.Item.Meta
              avatar={<span className="session-device-icon"><LaptopOutlined /></span>}
              title={<Space wrap><span>{describeDevice(session.userAgent)}</span>{session.current ? <Tag color="green">{t('Current device')}</Tag> : null}</Space>}
              description={(
                <Space direction="vertical" size={2}>
                  <span>{t('Last active')}: {dayjs(session.lastUsedAt).format('DD/MM/YYYY HH:mm')}</span>
                  <span>{t('Signed in')}: {dayjs(session.createdAt).format('DD/MM/YYYY HH:mm')}</span>
                </Space>
              )}
            />
          </List.Item>
        )}
      />
    </Space>
  )
}
