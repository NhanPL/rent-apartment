import { CheckOutlined, ClearOutlined, CloseOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, DatePicker, Descriptions, Drawer, Empty, Form, Grid, Input, Modal, Row, Select, Skeleton, Space, Table, Tag, Typography, message } from 'antd'
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
  type LatestProofFilter,
  type PaymentRequestListFilters,
  type PaymentRequestStatus,
} from '../../services/paymentsService'
import { getFormErrorMessage, getUserErrorMessage } from '../../services/errorMessage'
import { Localized } from '../../shared/components/Localized'
import { vndCurrency } from '../../i18n'

const currency = vndCurrency

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

const requestStatusOptions: Array<{ label: string; value: PaymentRequestStatus }> = (Object.keys(paymentRequestStatusColor) as PaymentRequestStatus[])
  .map((status) => ({ label: status, value: status }))
const latestProofOptions: Array<{ label: string; value: LatestProofFilter }> = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'No proof', value: 'NONE' },
]

const hasFilters = (filters: PaymentRequestListFilters) => Object.values(filters).some(Boolean)

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
  const [filters, setFilters] = useState<PaymentRequestListFilters>({})
  const [filterSourceItems, setFilterSourceItems] = useState<PaymentRequest[]>([])

  const pendingProofs = useMemo(() => items.filter((item) => item.latest_proof_status === 'PENDING').length, [items])
  const buildingOptions = useMemo(() => Array.from(new Map(
    filterSourceItems
      .filter((item) => item.building_id && item.building_name)
      .map((item) => [item.building_id as string, { value: item.building_id as string, label: item.building_name as string }]),
  ).values()).sort((left, right) => left.label.localeCompare(right.label)), [filterSourceItems])
  const roomOptions = useMemo(() => Array.from(new Map(
    filterSourceItems
      .filter((item) => item.room_id && item.room_code && (!filters.building_id || item.building_id === filters.building_id))
      .map((item) => [item.room_id as string, {
        value: item.room_id as string,
        label: filters.building_id ? item.room_code as string : `${item.building_name} / ${item.room_code}`,
      }]),
  ).values()).sort((left, right) => left.label.localeCompare(right.label)), [filterSourceItems, filters.building_id])
  const tenantOptions = useMemo(() => Array.from(new Map(
    filterSourceItems
      .filter((item) => item.tenant_id && item.tenant_name
        && (!filters.building_id || item.building_id === filters.building_id)
        && (!filters.room_id || item.room_id === filters.room_id))
      .map((item) => [item.tenant_id as string, {
        value: item.tenant_id as string,
        label: filters.room_id ? item.tenant_name as string : `${item.tenant_name} - Room ${item.room_code}`,
      }]),
  ).values()).sort((left, right) => left.label.localeCompare(right.label)), [filterSourceItems, filters.building_id, filters.room_id])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listPaymentRequests(filters)
      setItems(data)
      if (!hasFilters(filters)) setFilterSourceItems(data)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Unable to load payment requests.'))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const openDetail = useCallback(async (id: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      setDetailItem(await getPaymentRequest(id))
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong tai duoc chi tiet thanh toan.'))
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
      message.error(getUserErrorMessage(error, 'Khong the duyet chung tu thanh toan.'))
    } finally {
      setReviewLoading(null)
    }
  }, [refreshDetail])

  const rejectProof = useCallback(async () => {
    if (!rejectProofId) return
    try {
      const values = await rejectForm.validateFields()
      setReviewLoading(rejectProofId)
      await rejectPaymentProof(rejectProofId, values.reason)
      setRejectProofId(null)
      rejectForm.resetFields()
      await refreshDetail()
      message.success('Payment proof rejected.')
    } catch (error) {
      message.error(getFormErrorMessage(error, 'Unable to reject the payment proof.'))
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
    <Localized>
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>Payments</Typography.Title>
        <Typography.Text type="secondary">Review manual bank transfer proofs and track invoice payment history.</Typography.Text>
      </div>

      <Card
        title="Filters"
        extra={hasFilters(filters) ? (
          <Button icon={<ClearOutlined />} onClick={() => setFilters({})}>Clear filters</Button>
        ) : null}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Typography.Text strong>Month</Typography.Text>
            <DatePicker
              picker="month"
              format="MM/YYYY"
              value={filters.month ? dayjs(filters.month) : null}
              onChange={(value) => setFilters((current) => ({ ...current, month: value?.format('YYYY-MM') }))}
              placeholder="Select month"
              aria-label="Month filter"
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Typography.Text strong>Building</Typography.Text>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              value={filters.building_id}
              options={buildingOptions}
              onChange={(value) => setFilters((current) => ({ ...current, building_id: value, room_id: undefined, tenant_id: undefined }))}
              placeholder="All buildings"
              aria-label="Building filter"
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Typography.Text strong>Room</Typography.Text>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              value={filters.room_id}
              options={roomOptions}
              onChange={(value) => setFilters((current) => ({ ...current, room_id: value, tenant_id: undefined }))}
              placeholder="All rooms"
              aria-label="Room filter"
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Typography.Text strong>Tenant</Typography.Text>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              value={filters.tenant_id}
              options={tenantOptions}
              onChange={(value) => setFilters((current) => ({ ...current, tenant_id: value }))}
              placeholder="All tenants"
              aria-label="Tenant filter"
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Typography.Text strong>Request status</Typography.Text>
            <Select
              allowClear
              value={filters.request_status}
              options={requestStatusOptions}
              onChange={(value) => setFilters((current) => ({ ...current, request_status: value }))}
              placeholder="All statuses"
              aria-label="Request status filter"
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Typography.Text strong>Latest proof</Typography.Text>
            <Select
              allowClear
              value={filters.latest_proof_status}
              options={latestProofOptions}
              onChange={(value) => setFilters((current) => ({ ...current, latest_proof_status: value }))}
              placeholder="All proof statuses"
              aria-label="Latest proof filter"
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
        </Row>
      </Card>

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
    </Localized>
  )
}
