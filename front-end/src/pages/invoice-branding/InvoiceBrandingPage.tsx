import { Alert, Button, Card, Col, Form, Input, Row, Skeleton, Space, Typography, message } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { getUserErrorMessage } from '../../services/errorMessage'
import {
  getInvoiceBranding,
  updateInvoiceBranding,
  type InvoiceBranding,
} from '../../services/invoiceBrandingService'
import { InvoiceBrandingHeader } from '../../shared/components/InvoiceBrandingHeader'
import './InvoiceBrandingPage.css'

export function InvoiceBrandingPage() {
  const { t } = useI18n()
  const [form] = Form.useForm<InvoiceBranding>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const branding = Form.useWatch([], form) as InvoiceBranding | undefined

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      form.setFieldsValue(await getInvoiceBranding())
    } catch (loadError) {
      setError(getUserErrorMessage(loadError, t('Unable to load invoice branding.')))
    } finally {
      setLoading(false)
    }
  }, [form, t])

  useEffect(() => { void load() }, [load])

  const save = async (values: InvoiceBranding) => {
    setSaving(true)
    try {
      form.setFieldsValue(await updateInvoiceBranding(values))
      message.success(t('Invoice branding saved.'))
    } catch (saveError) {
      message.error(getUserErrorMessage(saveError, t('Unable to save invoice branding.')))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />

  return (
    <Space direction="vertical" size={16} className="invoice-branding-page">
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('Invoice Branding')}</Typography.Title>
        <Typography.Text type="secondary">{t('Customize the identity shown on invoices issued to your tenants.')}</Typography.Text>
      </div>
      {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => void load()}>{t('Retry')}</Button>} /> : null}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title={t('Brand settings')}>
            <Form form={form} layout="vertical" onFinish={save} requiredMark="optional">
              <Row gutter={12}>
                <Col xs={24} md={12}><Form.Item name="display_name" label={t('Display name')} rules={[{ required: true }, { max: 120 }]}><Input /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="invoice_title" label={t('Invoice title')} rules={[{ required: true }, { max: 100 }]}><Input /></Form.Item></Col>
              </Row>
              <Form.Item name="business_address" label={t('Business address')} rules={[{ max: 500 }]}><Input.TextArea rows={2} /></Form.Item>
              <Row gutter={12}>
                <Col xs={24} md={12}><Form.Item name="tax_code" label={t('Tax code')} rules={[{ max: 50 }]}><Input /></Form.Item></Col>
                <Col xs={24} md={12}><Form.Item name="accent_color" label={t('Accent color')} rules={[{ required: true }, { pattern: /^#[0-9A-Fa-f]{6}$/ }]}><Input type="color" className="branding-color-input" /></Form.Item></Col>
              </Row>
              <Form.Item name="logo_url" label={t('Logo URL')} rules={[{ type: 'url' }, { pattern: /^https:\/\//, message: t('Logo URL must use HTTPS.') }]}><Input placeholder="https://..." /></Form.Item>
              <Form.Item name="default_note" label={t('Default invoice note')} rules={[{ max: 1000 }]}><Input.TextArea rows={3} /></Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>{t('Save branding')}</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={t('Preview')} className="branding-preview">
            <InvoiceBrandingHeader branding={branding} />
            <Typography.Text type="secondary">{branding?.default_note || t('No default invoice note.')}</Typography.Text>
          </Card>
        </Col>
      </Row>
    </Space>
  )
}
