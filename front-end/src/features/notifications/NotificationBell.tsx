import { BellOutlined, CheckOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Empty, List, Popover, Spin, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { getUserErrorMessage } from '../../services/errorMessage'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from './notificationsApi'
import type { InAppNotification } from './types'
import './NotificationBell.css'

const notificationKey = ['notifications'] as const

const stringValue = (value: unknown) => typeof value === 'string' ? value : ''

export function NotificationBell() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const notifications = useQuery({
    queryKey: notificationKey,
    queryFn: listNotifications,
    refetchInterval: 60_000,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKey })
  const readOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: refresh,
    onError: (error) => message.error(getUserErrorMessage(error, t('Unable to update notification.'))),
  })
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: refresh,
    onError: (error) => message.error(getUserErrorMessage(error, t('Unable to update notifications.'))),
  })

  const describe = (item: InAppNotification) => {
    const room = stringValue(item.payload.roomCode)
    const month = stringValue(item.payload.month)
    switch (item.template_code) {
      case 'PAYMENT_REMINDER': return t('Payment reminder for room {{room}} in {{month}}.', { room, month })
      case 'UTILITY_READING_REJECTED': return t('Utility reading rejected for room {{room}} in {{month}}.', { room, month })
      case 'INVOICE_ISSUED': return t('Invoice issued for room {{room}} in {{month}}.', { room, month })
      case 'PAYMENT_PROOF_REJECTED': return t('Payment proof rejected for room {{room}} in {{month}}.', { room, month })
      case 'PAYMENT_APPROVED': return t('Payment approved for room {{room}} in {{month}}.', { room, month })
    }
  }

  const content = (
    <div className="notification-panel">
      <div className="notification-panel__header">
        <Typography.Text strong>{t('Notifications')}</Typography.Text>
        <Button
          type="text"
          size="small"
          aria-label={t('Mark all read')}
          icon={<CheckOutlined />}
          disabled={!notifications.data?.unreadCount}
          loading={readAll.isPending}
          onClick={() => readAll.mutate()}
        >
          {t('Mark all read')}
        </Button>
      </div>
      {notifications.isLoading ? <Spin className="notification-panel__loading" /> : null}
      {notifications.isError ? (
        <Button type="link" onClick={() => notifications.refetch()}>{t('Retry')}</Button>
      ) : null}
      {!notifications.isLoading && !notifications.data?.items.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No notifications')} /> : null}
      <List
        dataSource={notifications.data?.items ?? []}
        renderItem={(item) => (
          <List.Item
            className={item.read_at ? '' : 'notification-item--unread'}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click()
            }}
            onClick={() => {
              if (!item.read_at) readOne.mutate(item.id)
              navigate('/my-room')
            }}
          >
            <List.Item.Meta
              title={describe(item)}
              description={new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}
            />
          </List.Item>
        )}
      />
    </div>
  )

  return (
    <Popover content={content} trigger="click" placement="bottomRight">
      <Badge count={notifications.data?.unreadCount ?? 0} size="small" overflowCount={99}>
        <Button type="text" aria-label={t('Notifications')} icon={<BellOutlined />} />
      </Badge>
    </Popover>
  )
}
