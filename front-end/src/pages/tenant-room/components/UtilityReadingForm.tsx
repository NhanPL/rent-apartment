import { Alert, Button, Card, Checkbox, Col, Form, Input, InputNumber, Row, Space, Statistic, Typography } from 'antd'
import type { FormInstance } from 'antd'
import dayjs from 'dayjs'
import { CloudinaryUploadButton } from '../../../shared/components/CloudinaryUploadButton'
import type { UtilityReadingSnapshot } from '../../../services/tenantRoomService'
import type { TenantUtilityReadingFormValues } from '../utilityReadingForm'

interface Props {
  form: FormInstance<TenantUtilityReadingFormValues>
  snapshot: UtilityReadingSnapshot | null
  electricityUsage: number | null
  waterUsage: number | null
  electricityMeterReset: boolean
  waterMeterReset: boolean
  electricityEvidence: File | null
  waterEvidence: File | null
  locked: boolean
  submitting: boolean
  compact: boolean
  onElectricityEvidenceChange: (file: File | null) => void
  onWaterEvidenceChange: (file: File | null) => void
  onFinish: (values: TenantUtilityReadingFormValues) => void
  onFinishFailed: (error: unknown) => void
}

const meterValidator = (previousField: 'electricity_prev' | 'water_prev', resetField: 'electricity_meter_reset' | 'water_meter_reset', label: string) =>
  ({ getFieldValue }: { getFieldValue: (field: string) => unknown }) => ({
    validator(_: unknown, value: number | null) {
      const previous = getFieldValue(previousField) as number | null
      const reset = Boolean(getFieldValue(resetField))
      if (value == null || previous == null || value >= previous || reset) return Promise.resolve()
      return Promise.reject(new Error(`${label} must be greater than or equal to the previous reading.`))
    },
  })

function EvidenceField({ label, file, disabled, onChange }: { label: string; file: File | null; disabled: boolean; onChange: (file: File | null) => void }) {
  return (
    <Form.Item label={`${label} evidence`} required>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <CloudinaryUploadButton accept="image/jpeg,image/png,image/webp" context="UTILITY_EVIDENCE" deferred disabled={disabled} onSelected={onChange}>
          Select {label.toLowerCase()} image
        </CloudinaryUploadButton>
        <Typography.Text type={file ? undefined : 'secondary'} ellipsis title={file?.name}>{file?.name ?? 'No image selected'}</Typography.Text>
        {file ? <Button size="small" danger disabled={disabled} onClick={() => onChange(null)}>Remove</Button> : null}
      </Space>
    </Form.Item>
  )
}

export function UtilityReadingForm(props: Props) {
  return (
    <Card title="Enter monthly electricity and water readings">
      <Form<TenantUtilityReadingFormValues>
        form={props.form}
        layout="vertical"
        onFinish={props.onFinish}
        onFinishFailed={props.onFinishFailed}
        initialValues={{
          month: dayjs().format('YYYY-MM'),
          electricity_prev: null,
          electricity_curr: null,
          water_prev: null,
          water_curr: null,
          electricity_meter_reset: false,
          water_meter_reset: false,
          meter_reset_note: '',
          note: '',
        }}
      >
        <Row gutter={[16, 8]}><Col xs={24} md={8}><Form.Item name="month" label="Reading month" rules={[{ required: true, message: 'Please select a month.' }]}><Input type="month" /></Form.Item></Col></Row>
        <Row gutter={[16, 8]}>
          <Col xs={24} md={12}><Form.Item name="electricity_prev" label="Previous electricity reading"><InputNumber style={{ width: '100%' }} disabled precision={0} /></Form.Item></Col>
          <Col xs={24} md={12}>
            <Form.Item name="electricity_curr" label="Current electricity reading" dependencies={['electricity_prev', 'electricity_meter_reset']} rules={[
              { required: true, type: 'number', message: 'Please enter the current electricity reading.' },
              { type: 'number', min: 0, message: 'The reading must be at least 0.' },
              meterValidator('electricity_prev', 'electricity_meter_reset', 'The electricity reading'),
            ]}><InputNumber style={{ width: '100%' }} precision={0} min={0} /></Form.Item>
            <Form.Item name="electricity_meter_reset" valuePropName="checked"><Checkbox disabled={props.locked || props.submitting}>Electric meter was reset or replaced</Checkbox></Form.Item>
          </Col>
          <Col xs={24} md={12}><Form.Item name="water_prev" label="Previous water reading"><InputNumber style={{ width: '100%' }} disabled precision={0} /></Form.Item></Col>
          <Col xs={24} md={12}>
            <Form.Item name="water_curr" label="Current water reading" dependencies={['water_prev', 'water_meter_reset']} rules={[
              { required: true, type: 'number', message: 'Please enter the current water reading.' },
              { type: 'number', min: 0, message: 'The reading must be at least 0.' },
              meterValidator('water_prev', 'water_meter_reset', 'The water reading'),
            ]}><InputNumber style={{ width: '100%' }} precision={0} min={0} /></Form.Item>
            <Form.Item name="water_meter_reset" valuePropName="checked"><Checkbox disabled={props.locked || props.submitting}>Water meter was reset or replaced</Checkbox></Form.Item>
          </Col>
        </Row>
        <Row gutter={[16, 8]}>
          <Col xs={24} md={12}><Card size="small"><Statistic title="Electricity usage (kWh)" value={props.electricityUsage ?? '-'} /></Card></Col>
          <Col xs={24} md={12}><Card size="small"><Statistic title="Water usage (m3)" value={props.waterUsage ?? '-'} /></Card></Col>
        </Row>
        {props.electricityMeterReset || props.waterMeterReset ? (
          <Form.Item name="meter_reset_note" label="Meter reset reason" rules={[{ required: true, whitespace: true, message: 'Please explain why the meter was reset or replaced.' }]}>
            <Input.TextArea rows={2} maxLength={500} showCount disabled={props.locked || props.submitting} />
          </Form.Item>
        ) : null}
        <Form.Item name="note" label="Notes" style={{ marginTop: 16 }}><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>
        <Row gutter={[16, 8]}>
          <Col xs={24} md={12}><EvidenceField label="Electricity" file={props.electricityEvidence} disabled={props.locked || props.submitting} onChange={props.onElectricityEvidenceChange} /></Col>
          <Col xs={24} md={12}><EvidenceField label="Water" file={props.waterEvidence} disabled={props.locked || props.submitting} onChange={props.onWaterEvidenceChange} /></Col>
        </Row>
        {props.locked ? <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="This month has already been submitted. It can only be updated after the manager rejects it for correction." /> : null}
        {props.snapshot?.current_reading?.reported_at ? (
          <Alert type="success" showIcon style={{ marginBottom: 16 }} message={`Last submitted: ${dayjs(props.snapshot.current_reading.reported_at).format('HH:mm DD/MM/YYYY')}`} />
        ) : <Alert type="info" showIcon style={{ marginBottom: 16 }} message="No readings have been submitted for this month." />}
        <Button htmlType="submit" type="primary" loading={props.submitting} disabled={props.locked || props.submitting} block={props.compact}>Save monthly readings</Button>
      </Form>
    </Card>
  )
}
