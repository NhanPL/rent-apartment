import { Alert, Card, Col, Descriptions, Input, Row, Space, Statistic, Tag, Typography } from 'antd'
import type { FormInstance } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'
import type { PaymentRequest, PaymentRequestStatus } from '../../../services/paymentsService'
import type { InvoiceSummary } from '../../../services/tenantRoomService'
import type { UploadedCloudinaryFile } from '../../../services/uploadService'
import { PaymentProofForm, type PaymentProofFormValues } from './PaymentProofForm'

interface Props {
  invoice: InvoiceSummary | null
  paymentRequest: PaymentRequest | null
  paymentRequestError: string | null
  form: FormInstance<PaymentProofFormValues>
  proofFile: UploadedCloudinaryFile | null
  proofSubmitting: boolean
  compact: boolean
  formatCurrency: (value: number) => string
  invoiceStatusColor: Record<InvoiceSummary['status'], string>
  paymentStatusColor: Record<NonNullable<InvoiceSummary['payment_status']>, string>
  requestStatusColor: Record<PaymentRequestStatus, string>
  onProofFileChange: (file: UploadedCloudinaryFile) => void
  onProofSubmit: (values: PaymentProofFormValues) => void
  onFormFailure: (error: unknown) => void
}

function VietQrImage({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <Alert showIcon type="error" message="The VietQR image could not be loaded. Please ask the manager to verify the bank code." />
  return <img src={url} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} style={{ display: 'block', maxWidth: 280, width: '100%', margin: '0 auto' }} />
}

export function CurrentInvoice(props: Props) {
  const invoice = props.invoice
  const request = props.paymentRequest
  const remaining = invoice ? Math.max(invoice.total - invoice.paid_amount, 0) : 0

  return (
    <Card title="Hoa don thang hien tai" extra={invoice ? <Tag color={props.invoiceStatusColor[invoice.status]}>{invoice.status}</Tag> : null}>
      {!invoice ? <Alert showIcon type="info" message="Thang nay chua co hoa don." /> : (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Typography.Text type="secondary">Ky hoa don: {dayjs(invoice.month).format('MM/YYYY')}</Typography.Text>
          <Row gutter={[12, 12]}>
            <Col xs={12}><Statistic title="Tien phong" value={invoice.rent_amount} formatter={(value) => props.formatCurrency(Number(value))} /></Col>
            <Col xs={12}><Statistic title="Tien dien" value={invoice.electric_amount} formatter={(value) => props.formatCurrency(Number(value))} /></Col>
            <Col xs={12}><Statistic title="Tien nuoc" value={invoice.water_amount} formatter={(value) => props.formatCurrency(Number(value))} /></Col>
            <Col xs={12}><Statistic title="Phi khac" value={invoice.other_amount} formatter={(value) => props.formatCurrency(Number(value))} /></Col>
          </Row>
          <Card size="small" style={{ background: '#f6ffed' }}><Statistic title="Tong thanh toan" value={invoice.total} valueStyle={{ color: '#389e0d' }} formatter={(value) => props.formatCurrency(Number(value))} /></Card>
          <Space wrap>
            <Typography.Text type="secondary">Han thanh toan: {invoice.due_date ? dayjs(invoice.due_date).format('DD/MM/YYYY') : '-'}</Typography.Text>
            {invoice.payment_status ? <Tag color={props.paymentStatusColor[invoice.payment_status]}>Payment: {invoice.payment_status}</Tag> : null}
            {invoice.payment_request_status ? <Tag color={props.requestStatusColor[invoice.payment_request_status]}>Request: {invoice.payment_request_status}</Tag> : null}
          </Space>
          <Typography.Text type="secondary">Ngay thanh toan: {invoice.paid_at ? dayjs(invoice.paid_at).format('DD/MM/YYYY') : '-'}</Typography.Text>
          <Typography.Text type="secondary">Da thanh toan: {props.formatCurrency(invoice.paid_amount)}</Typography.Text>
          <Typography.Text type="secondary">Remaining: {props.formatCurrency(remaining)}</Typography.Text>
          {props.paymentRequestError ? <Alert showIcon type="error" message={props.paymentRequestError} /> : !request ? (
            <Alert showIcon type="info" message="Chua co yeu cau chuyen khoan cho hoa don nay." />
          ) : (
            <Card size="small" title="Thanh toan chuyen khoan">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Descriptions bordered size="small" column={1}>
                  <Descriptions.Item label="So tien can chuyen">{props.formatCurrency(request.remaining_amount ?? request.amount)}</Descriptions.Item>
                  <Descriptions.Item label="Ngan hang">{request.bank_code ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="So tai khoan">{request.bank_account_no ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="Chu tai khoan">{request.bank_account_name ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="Noi dung chuyen khoan">{request.transfer_note ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="Han yeu cau">{request.expires_at ? dayjs(request.expires_at).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
                </Descriptions>
                {request.qr_image_url ? <VietQrImage key={request.qr_image_url} url={request.qr_image_url} alt={`VietQR payment for invoice ${dayjs(invoice.month).format('MM/YYYY')}`} /> : request.qr_content ? <Input.TextArea value={request.qr_content} autoSize readOnly /> : null}
                {(['WAITING_TRANSFER', 'REJECTED'].includes(request.status) && invoice.status !== 'PAID') ? (
                  <PaymentProofForm
                    form={props.form}
                    amount={request.remaining_amount ?? request.amount}
                    maxAmount={request.remaining_amount || undefined}
                    file={props.proofFile}
                    submitting={props.proofSubmitting}
                    compact={props.compact}
                    onFileChange={props.onProofFileChange}
                    onFinish={props.onProofSubmit}
                    onFinishFailed={props.onFormFailure}
                  />
                ) : <Alert showIcon type={request.status === 'TRANSFER_SUBMITTED' ? 'warning' : 'success'} message={request.status === 'TRANSFER_SUBMITTED' ? 'Bien lai dang cho quan ly duyet.' : 'Yeu cau thanh toan dang khong nhan bien lai moi.'} />}
              </Space>
            </Card>
          )}
        </Space>
      )}
    </Card>
  )
}
