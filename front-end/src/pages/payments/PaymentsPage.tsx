import { CheckOutlined, CloseOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Drawer, Empty, Form, Grid, Input, Modal, Skeleton, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  approvePaymentProof,
  getPaymentRequest,
  listPaymentRequests,
  rejectPaymentProof,
  type PaymentProof,
  type PaymentRequest,
  type PaymentRequestStatus,
} from '../../services/paymentsService'

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

const paymentRequestStatusColor: Record<PaymentRequestStatus, string> = {
  DRAFT: 'default',
  WAITING_TRANSFER: 'blue',
  TRANSFER_SUBMITTED: 'gold',
  VERIFIED: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
  EXPIRED: 'orange',
}

interface RejectFormValues {
  reason: string
}

export function PaymentsPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [rejectForm] = Form.useForm<RejectFormValues>()
  const [items, setItems] = useState<PaymentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailItem, setDetailItem] = useState<PaymentRequest | null>(null)
  const [reviewLoading, setReviewLoading] = useState<string | null>(null)
  const [rejectProofId, setRejectProofId] = useState<string | null>(null)

  const pendingProofs = useMemo(() => items.filter((item) => item.latest_proof_status === 'PENDING').length, [items])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await listPaymentRequests())
    } catch {
      message.error('Unable to load payment requests.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const openDetail = useCallback(async (id: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      setDetailItem(await getPaymentRequest(id))
    } catch {
      message.error('Unable to load payment request detail.')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const refreshDetail = useCallback(async () => {
    if (!detailItem) return
    const updated = await getPaymentRequest(detailItem.id)
    setDetailItem(updated)
    await loadData()
  }, [detailItem, loadData])

  const approveProof = useCallback(async (proofId: string) => {
    setReviewLoading(proofId)
    try {
      await approvePaymentProof(proofId)
      await refreshDetail()
      message.success('Payment proof approved.')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to approve proof.')
    } finally {
      setReviewLoading(null)
    }
  }, [refreshDetail])

  const rejectProof = useCallback(async () => {
    if (!rejectProofId) return
    const values = await rejectForm.validateFields()
    setReviewLoading(rejectProofId)
    try {
      await rejectPaymentProof(rejectProofId, values.reason)
      setRejectProofId(null)
      rejectForm.resetFields()
      await refreshDetail()
      message.success('Payment proof rejected.')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to reject proof.')
    } finally {
      setReviewLoading(null)
    }
  }, [refreshDetail, rejectForm, rejectProofId])

  const columns: ColumnsType<PaymentRequest> = [
    { title: 'Month', dataIndex: 'month', width: 110, render: (value: string) => (value ? dayjs(value).format('MM/YYYY') : '-') },
    { title: 'Building', dataIndex: 'building_name', width: 170 },
    { title: 'Room', dataIndex: 'room_code', width: 100 },
    { title: 'Tenant', dataIndex: 'tenant_name', width: 170 },
    { title: 'Request amount', dataIndex: 'amount', width: 150, align: 'right', render: (value: number) => currency.format(value) },
    { title: 'Paid', dataIndex: 'paid_amount', width: 130, align: 'right', render: (value: number) => currency.format(value ?? 0) },
    { title: 'Remaining', dataIndex: 'remaining_amount', width: 130, align: 'right', render: (value: number) => currency.format(value ?? 0) },
    { title: 'Request status', dataIndex: 'status', width: 160, render: (value: PaymentRequestStatus) => <Tag color={paymentRequestStatusColor[value]}>{value}</Tag> },
    { title: 'Latest proof', dataIndex: 'latest_proof_status', width: 130, render: (value: string | null) => (value ? <Tag>{value}</Tag> : '-') },
    { title: 'Submitted', dataIndex: 'latest_proof_submitted_at', width: 160, render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-') },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 90,
      render: (_, row) => <Button size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row.id)} />,
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>Payments</Typography.Title>
        <Typography.Text type="secondary">Review manual bank transfer proofs and track invoice payment history.</Typography.Text>
      </div>

      <Card>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Tag color={pendingProofs > 0 ? 'gold' : 'green'}>{pendingProofs} pending proof(s)</Tag>
            <Typography.Text type="secondary">{items.length} payment request(s)</Typography.Text>
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>Refresh</Button>
        </Space>
      </Card>

      <Card title="Payment requests">
        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Table rowKey="id" columns={columns} dataSource={items} scroll={{ x: 1450 }} locale={{ emptyText: <Empty description="No payment requests" /> }} />
        )}
      </Card>

      <Drawer title="Payment request detail" open={detailOpen} width={isMobile ? '100%' : 760} onClose={() => setDetailOpen(false)}>
        {detailLoading || !detailItem ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={isMobile ? 1 : 2} size="small" bordered>
              <Descriptions.Item label="Invoice">{detailItem.building_name} / Room {detailItem.room_code}</Descriptions.Item>
              <Descriptions.Item label="Month">{detailItem.month ? dayjs(detailItem.month).format('MM/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Tenant">{detailItem.tenant_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={paymentRequestStatusColor[detailItem.status]}>{detailItem.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Invoice total">{currency.format(detailItem.invoice_total ?? 0)}</Descriptions.Item>
              <Descriptions.Item label="Paid">{currency.format(detailItem.paid_amount ?? 0)}</Descriptions.Item>
              <Descriptions.Item label="Remaining">{currency.format(detailItem.remaining_amount ?? 0)}</Descriptions.Item>
              <Descriptions.Item label="Request amount">{currency.format(detailItem.amount)}</Descriptions.Item>
              <Descriptions.Item label="Bank">{detailItem.bank_code ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Account">{detailItem.bank_account_no ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Account name">{detailItem.bank_account_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Transfer note">{detailItem.transfer_note ?? '-'}</Descriptions.Item>
            </Descriptions>

            {detailItem.status === 'WAITING_TRANSFER' ? (
              <Alert showIcon type="info" message="Partial payments are allowed. The invoice becomes PAID only after approved payments cover the invoice total." />
            ) : null}

            <Card size="small" title="Proof history">
              <Table<PaymentProof>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detailItem.proofs ?? []}
                locale={{ emptyText: <Empty description="No proof submitted" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                columns={[
                  { title: 'Submitted', dataIndex: 'submitted_at', render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm') },
                  { title: 'Amount', dataIndex: 'transfer_amount', align: 'right', render: (value: number) => currency.format(value) },
                  { title: 'Status', dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> },
                  { title: 'File', dataIndex: 'file_url', render: (value: string, row) => <a href={value} target="_blank" rel="noreferrer">{row.file_name || 'Open file'}</a> },
                  { title: 'Note', dataIndex: 'payer_note', render: (value: string | null) => value ?? '-' },
                  {
                    title: 'Review',
                    key: 'review',
                    render: (_, row) => row.status === 'PENDING' ? (
                      <Space size={4}>
                        <Button size="small" type="primary" icon={<CheckOutlined />} loading={reviewLoading === row.id} onClick={() => void approveProof(row.id)} />
                        <Button size="small" danger icon={<CloseOutlined />} loading={reviewLoading === row.id} onClick={() => setRejectProofId(row.id)} />
                      </Space>
                    ) : row.rejection_reason ?? '-',
                  },
                ]}
              />
            </Card>

            <Card size="small" title="Approved payments">
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detailItem.payments ?? []}
                locale={{ emptyText: <Empty description="No approved payment" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                columns={[
                  { title: 'Paid at', dataIndex: 'paid_at', render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-') },
                  { title: 'Amount', dataIndex: 'amount', align: 'right', render: (value: number) => currency.format(value) },
                  { title: 'Status', dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> },
                  { title: 'Note', dataIndex: 'note', render: (value: string | null) => value ?? '-' },
                ]}
              />
            </Card>
          </Space>
        )}
      </Drawer>

      <Modal
        open={Boolean(rejectProofId)}
        title="Reject payment proof"
        okText="Reject"
        okButtonProps={{ danger: true }}
        confirmLoading={Boolean(reviewLoading)}
        onOk={() => void rejectProof()}
        onCancel={() => {
          setRejectProofId(null)
          rejectForm.resetFields()
        }}
        destroyOnClose
      >
        <Form form={rejectForm} layout="vertical">
          <Form.Item name="reason" label="Reject reason" rules={[{ required: true, whitespace: true, message: 'Please enter reject reason' }]}>
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
