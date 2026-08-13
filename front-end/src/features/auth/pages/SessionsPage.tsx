import { DeleteOutlined, LaptopOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Divider, Empty, Form, Input, List, Modal, QRCode, Space, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../../i18n'
import { getUserErrorMessage } from '../../../services/errorMessage'
import { beginTwoFactorSetup, disableTwoFactor, enableTwoFactor, getTwoFactorStatus, listSessions, revokeSession } from '../authApi'
import type { AuthSession, TwoFactorSetup } from '../types/auth'
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
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<AuthSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [twoFactorLoading, setTwoFactorLoading] = useState(user?.role === 'MANAGER')
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null)
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [savingTwoFactor, setSavingTwoFactor] = useState(false)
  const [setupForm] = Form.useForm<{ code: string }>()
  const [disableForm] = Form.useForm<{ currentPassword: string; code: string }>()

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

  useEffect(() => {
    if (user?.role !== 'MANAGER') return
    void getTwoFactorStatus()
      .then((status) => setTwoFactorEnabled(status.enabled))
      .catch((statusError) => setTwoFactorError(getUserErrorMessage(statusError, 'Unable to load two-factor authentication settings.')))
      .finally(() => setTwoFactorLoading(false))
  }, [user?.role])

  const signOutAfterSecurityChange = async (successMessage: string) => {
    message.success(t(successMessage))
    await logout()
    navigate('/login', { replace: true })
  }

  const startTwoFactorSetup = async () => {
    setTwoFactorLoading(true)
    setTwoFactorError(null)
    try {
      setSetup(await beginTwoFactorSetup())
      setupForm.resetFields()
      setSetupOpen(true)
    } catch (setupError) {
      setTwoFactorError(getUserErrorMessage(setupError, t('Unable to start two-factor authentication setup.')))
    } finally {
      setTwoFactorLoading(false)
    }
  }

  const confirmTwoFactorSetup = async ({ code }: { code: string }) => {
    setSavingTwoFactor(true)
    try {
      await enableTwoFactor(code)
      setSetupOpen(false)
      await signOutAfterSecurityChange('Two-factor authentication is enabled. Sign in again with your authentication code.')
    } catch (enableError) {
      message.error(getUserErrorMessage(enableError, t('Unable to enable two-factor authentication.')))
    } finally {
      setSavingTwoFactor(false)
    }
  }

  const confirmDisableTwoFactor = async (values: { currentPassword: string; code: string }) => {
    setSavingTwoFactor(true)
    try {
      await disableTwoFactor(values)
      setDisableOpen(false)
      await signOutAfterSecurityChange('Two-factor authentication is disabled. Sign in again to continue.')
    } catch (disableError) {
      message.error(getUserErrorMessage(disableError, t('Unable to disable two-factor authentication.')))
    } finally {
      setSavingTwoFactor(false)
    }
  }

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
      {user?.role === 'MANAGER' ? (
        <section aria-labelledby="two-factor-heading">
          <Divider />
          <div className="sessions-security-heading">
            <div>
              <Typography.Title id="two-factor-heading" level={4}>{t('Two-factor authentication')}</Typography.Title>
              <Typography.Text type="secondary">{t('Require an authenticator code when signing in as a manager.')}</Typography.Text>
            </div>
            <Tag color={twoFactorEnabled ? 'green' : 'default'}>{t(twoFactorEnabled ? 'Enabled' : 'Disabled')}</Tag>
          </div>
          {twoFactorError ? <Alert type="error" showIcon message={twoFactorError} className="sessions-security-error" /> : null}
          <Button
            danger={twoFactorEnabled}
            type={twoFactorEnabled ? 'default' : 'primary'}
            loading={twoFactorLoading}
            onClick={() => twoFactorEnabled ? setDisableOpen(true) : void startTwoFactorSetup()}
          >{t(twoFactorEnabled ? 'Disable two-factor authentication' : 'Enable two-factor authentication')}</Button>
        </section>
      ) : null}
      <Modal
        open={setupOpen}
        title={t('Set up two-factor authentication')}
        okText={t('Verify and enable')}
        confirmLoading={savingTwoFactor}
        onOk={() => setupForm.submit()}
        onCancel={() => setSetupOpen(false)}
        destroyOnHidden
      >
        {setup ? (
          <Space direction="vertical" size={16} className="two-factor-setup">
            <Typography.Text>{t('Scan this QR code with your authenticator app, then enter the six-digit code.')}</Typography.Text>
            <QRCode value={setup.otpauthUri} size={200} />
            <Typography.Text copyable={{ text: setup.secret }} code>{setup.secret}</Typography.Text>
            <Form form={setupForm} layout="vertical" onFinish={confirmTwoFactorSetup} requiredMark={false} className="two-factor-form">
              <Form.Item name="code" label={t('Authentication code')} rules={[
                { required: true, message: t('Enter the six-digit code from your authenticator app.') },
                { pattern: /^\d{6}$/, message: t('The authentication code must contain six digits.') },
              ]}>
                <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" />
              </Form.Item>
            </Form>
          </Space>
        ) : null}
      </Modal>
      <Modal
        open={disableOpen}
        title={t('Disable two-factor authentication')}
        okText={t('Disable')}
        okButtonProps={{ danger: true }}
        confirmLoading={savingTwoFactor}
        onOk={() => disableForm.submit()}
        onCancel={() => setDisableOpen(false)}
        destroyOnHidden
      >
        <Form form={disableForm} layout="vertical" onFinish={confirmDisableTwoFactor} requiredMark={false}>
          <Form.Item name="currentPassword" label={t('Current password')} rules={[{ required: true, message: t('Please enter your current password.') }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="code" label={t('Authentication code')} rules={[
            { required: true, message: t('Enter the six-digit code from your authenticator app.') },
            { pattern: /^\d{6}$/, message: t('The authentication code must contain six digits.') },
          ]}>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
