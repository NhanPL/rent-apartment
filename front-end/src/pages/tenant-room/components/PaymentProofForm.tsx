import { Button, Form, Input, InputNumber, Space, Typography } from 'antd'
import type { FormInstance } from 'antd'
import type { UploadedCloudinaryFile } from '../../../services/uploadService'
import { CloudinaryUploadButton } from '../../../shared/components/CloudinaryUploadButton'

export interface PaymentProofFormValues {
  transfer_amount?: number
  payer_note?: string
}

interface Props {
  form: FormInstance<PaymentProofFormValues>
  amount: number
  maxAmount?: number
  file: UploadedCloudinaryFile | null
  submitting: boolean
  compact: boolean
  onFileChange: (file: UploadedCloudinaryFile) => void
  onFinish: (values: PaymentProofFormValues) => void
  onFinishFailed: (error: unknown) => void
}

export function PaymentProofForm(props: Props) {
  return (
    <Form<PaymentProofFormValues> form={props.form} layout="vertical" onFinish={props.onFinish} onFinishFailed={props.onFinishFailed}>
      <Form.Item name="transfer_amount" label="Transferred amount" initialValue={props.amount} rules={[{ required: true, message: 'Please enter the transferred amount.' }]}>
        <InputNumber min={1} max={props.maxAmount} precision={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="Receipt image" required>
        <Space wrap>
          <CloudinaryUploadButton accept="image/jpeg,image/png,image/webp" context="PAYMENT_PROOF" onUploaded={props.onFileChange}>Upload image</CloudinaryUploadButton>
          {props.file ? <Typography.Link href={props.file.file_url} target="_blank" rel="noreferrer">{props.file.file_name}</Typography.Link> : <Typography.Text type="secondary">No image uploaded</Typography.Text>}
        </Space>
      </Form.Item>
      <Form.Item name="payer_note" label="Note"><Input.TextArea rows={2} /></Form.Item>
      <Button htmlType="submit" type="primary" loading={props.submitting} disabled={props.submitting} block={props.compact}>Submit payment proof</Button>
    </Form>
  )
}
