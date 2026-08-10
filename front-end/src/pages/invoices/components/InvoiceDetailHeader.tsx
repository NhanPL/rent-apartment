import { CheckOutlined, DeleteOutlined, PlusOutlined, QrcodeOutlined, StopOutlined } from '@ant-design/icons'
import { Button, Space, Typography } from 'antd'
import dayjs from 'dayjs'
import type { InvoiceDetail } from '../types'

interface Props {
  invoice: InvoiceDetail
  hasPendingProof: boolean
  pendingProofCompletesInvoice: boolean
  replacementLoading: boolean
  onConfirmPayment: () => void
  onIssue: () => void
  onAdjustment: () => void
  onDelete: () => void
  onVoid: () => void
  onCreateReplacement: () => void
}

export function InvoiceDetailHeader(props: Props) {
  const invoice = props.invoice
  return (
    <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
      <Space direction="vertical" size={2}>
        <Typography.Text strong>{invoice.building_name} / Room {invoice.room_code}</Typography.Text>
        <Typography.Text type="secondary">{dayjs(invoice.month).format('MM/YYYY')}</Typography.Text>
      </Space>
      <Space wrap>
        {props.hasPendingProof ? (
          <Button type="primary" icon={<CheckOutlined />} onClick={props.onConfirmPayment}>
            {props.pendingProofCompletesInvoice ? 'Confirm and complete invoice' : 'Confirm payment'}
          </Button>
        ) : null}
        {invoice.status === 'DRAFT' ? <Button type="primary" icon={<QrcodeOutlined />} onClick={props.onIssue}>Issue and create QR</Button> : null}
        {invoice.status === 'DRAFT' ? <Button icon={<PlusOutlined />} onClick={props.onAdjustment}>Adjustment</Button> : null}
        {invoice.status === 'DRAFT' ? <Button danger icon={<DeleteOutlined />} onClick={props.onDelete}>Delete draft</Button> : null}
        {['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(invoice.status) ? <Button danger icon={<StopOutlined />} onClick={props.onVoid}>Void invoice</Button> : null}
        {invoice.status === 'VOID' && !invoice.replacement_invoice_id ? (
          <Button type="primary" icon={<PlusOutlined />} loading={props.replacementLoading} onClick={props.onCreateReplacement}>Create replacement</Button>
        ) : null}
      </Space>
    </Space>
  )
}
