import { Space, Typography } from 'antd'
import type { InvoiceBranding } from '../../services/invoiceBrandingService'
import { useI18n } from '../../i18n'

interface Props {
  branding: InvoiceBranding | null | undefined
  fallbackTitle?: string
}

export function InvoiceBrandingHeader({ branding, fallbackTitle = 'Monthly Invoice' }: Props) {
  const { t } = useI18n()
  if (!branding) return null
  return (
    <div className="invoice-branding-header" style={{ borderLeft: `4px solid ${branding.accent_color}` }}>
      <Space align="start" size={12}>
        {branding.logo_url ? <img className="invoice-branding-logo" src={branding.logo_url} alt="" /> : null}
        <Space direction="vertical" size={1}>
          <Typography.Title level={4} style={{ margin: 0 }}>{branding.invoice_title || fallbackTitle}</Typography.Title>
          <Typography.Text strong>{branding.display_name}</Typography.Text>
          {branding.business_address ? <Typography.Text type="secondary">{branding.business_address}</Typography.Text> : null}
          {branding.tax_code ? <Typography.Text type="secondary">{t('Tax code')}: {branding.tax_code}</Typography.Text> : null}
          {branding.default_note ? <Typography.Text type="secondary">{branding.default_note}</Typography.Text> : null}
        </Space>
      </Space>
    </div>
  )
}
