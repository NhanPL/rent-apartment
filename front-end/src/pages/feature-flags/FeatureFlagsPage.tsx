import { Alert, Button, Card, List, Skeleton, Space, Switch, Typography, message } from 'antd'
import { useState } from 'react'
import { useI18n } from '../../i18n'
import { getUserErrorMessage } from '../../services/errorMessage'
import { useFeatureFlags } from '../../features/feature-flags/useFeatureFlags'
import { FEATURE_KEYS, type FeatureKey } from '../../features/feature-flags/featureFlagsApi'

const labels: Record<FeatureKey, { title: string; description: string }> = {
  CSV_IMPORTS: { title: 'CSV data import', description: 'Allow validated building, room, and tenant imports.' },
  BULK_BILLING_ACTIONS: { title: 'Bulk billing actions', description: 'Allow bulk invoice issue and payment proof review.' },
  LIVE_DASHBOARD: { title: 'Live dashboard updates', description: 'Refresh operational dashboard data automatically.' },
  INVOICE_BRANDING: { title: 'Invoice branding', description: 'Allow custom manager branding on issued invoices.' },
}

export function FeatureFlagsPage() {
  const { t } = useI18n()
  const { flags, loading, error, refresh, setFlag } = useFeatureFlags()
  const [savingKey, setSavingKey] = useState<FeatureKey | null>(null)

  const changeFlag = async (key: FeatureKey, enabled: boolean) => {
    setSavingKey(key)
    try {
      await setFlag(key, enabled)
      message.success(t('Feature flag updated.'))
    } catch (updateError) {
      message.error(getUserErrorMessage(updateError, t('Unable to update feature flag.')))
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('Feature Flags')}</Typography.Title>
        <Typography.Text type="secondary">{t('Release optional capabilities independently for your portfolio.')}</Typography.Text>
      </div>
      {error ? <Alert showIcon type="error" message={error} action={<Button onClick={() => void refresh()}>{t('Retry')}</Button>} /> : null}
      <Card>
        {loading ? <Skeleton active paragraph={{ rows: 4 }} /> : (
          <List dataSource={[...FEATURE_KEYS]} renderItem={(key: FeatureKey) => (
            <List.Item actions={[
              <Switch
                key={key}
                aria-label={t(labels[key].title)}
                checked={flags[key]}
                loading={savingKey === key}
                disabled={savingKey !== null}
                onChange={(checked) => void changeFlag(key, checked)}
              />,
            ]}>
              <List.Item.Meta title={t(labels[key].title)} description={t(labels[key].description)} />
            </List.Item>
          )} />
        )}
      </Card>
    </Space>
  )
}
