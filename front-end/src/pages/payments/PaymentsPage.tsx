import { useI18n } from '../../i18n'
import { CheckOutlined, ClearOutlined, CloseOutlined, EyeOutlined, ReloadOutlined, RollbackOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, DatePicker, Descriptions, Drawer, Empty, Form, Grid, Input, Modal, Row, Select, Skeleton, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  approvePaymentProof,
  getPaymentRequest,
  listPaymentRequests,
  rejectPaymentProof,
  reversePayment,
  type PaymentProof,
  type PaymentRequest,
  type LatestProofFilter,
  type PaymentRequestListFilters,
  type PaymentRequestStatus,
} from '../../services/paymentsService'
import { getFormErrorMessage, getUserErrorMessage } from '../../services/errorMessage'
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

const paymentRequestStatusLabel: Record<PaymentRequestStatus, string> = {
  DRAFT: 'Draft',
  WAITING_TRANSFER: 'Waiting for transfer',
  TRANSFER_SUBMITTED: 'Transfer submitted',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}

interface RejectFormValues {
  reason: string
}

interface ReverseFormValues {
  reason: string
}

const requestStatusOptions: Array<{ label: string; value: PaymentRequestStatus }> = (Object.keys(paymentRequestStatusColor) as PaymentRequestStatus[])
  .map((status) => ({ label: paymentRequestStatusLabel[status], value: status }))
const latestProofOptions: Array<{ label: string; value: LatestProofFilter }> = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'No proof', value: 'NONE' },
]

const hasFilters = (filters: PaymentRequestListFilters) => Boolean(
  filters.search || filters.month || filters.building_id || filters.room_id || filters.tenant_id
  || filters.request_status || filters.latest_proof_status
)

const initialPaymentFilters = (): PaymentRequestListFilters => {
  const params = new URLSearchParams(window.location.search)
  const requestStatus = params.get('requestStatus') as PaymentRequestStatus | null
  const latestProof = params.get('latestProof') as LatestProofFilter | null
  return {
    search: params.get('search') || undefined,
    month: params.get('month') || undefined,
    building_id: params.get('buildingId') || undefined,
    room_id: params.get('roomId') || undefined,
    tenant_id: params.get('tenantId') || undefined,
    request_status: requestStatusOptions.some((option) => option.value === requestStatus) ? requestStatus ?? undefined : undefined,
    latest_proof_status: latestProofOptions.some((option) => option.value === latestProof) ? latestProof ?? undefined : undefined,
    page: Math.max(1, Number(params.get('page')) || 1),
    pageSize: Math.min(100, Math.max(1, Number(params.get('pageSize')) || 20)),
    sortBy: 'createdAt',
    sortOrder: 'desc',
  }
}

export function PaymentsPage() {
  const { t } = useI18n()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [rejectForm] = Form.useForm<RejectFormValues>()
  const [reverseForm] = Form.useForm<ReverseFormValues>()
  const [items, setItems] = useState<PaymentRequest[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailItem, setDetailItem] = useState<PaymentRequest | null>(null)
  const [reviewLoading, setReviewLoading] = useState<string | null>(null)
  const [rejectProofId, setRejectProofId] = useState<string | null>(null)
  const [reversePaymentId, setReversePaymentId] = useState<string | null>(null)
  const [filters, setFilters] = useState<PaymentRequestListFilters>(initialPaymentFilters)
  const [searchInput, setSearchInput] = useState(() => initialPaymentFilters().search ?? '')
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
      setItems(data.items)
      setTotal(data.total)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Unable to load payment requests.'))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => ({ ...current, search: searchInput.trim() || undefined, page: 1 }))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const values: Record<string, string | number | undefined> = {
      search: filters.search,
      month: filters.month,
      buildingId: filters.building_id,
      roomId: filters.room_id,
      tenantId: filters.tenant_id,
      requestStatus: filters.request_status,
      latestProof: filters.latest_proof_status,
      page: filters.page && filters.page > 1 ? filters.page : undefined,
      pageSize: filters.pageSize && filters.pageSize !== 20 ? filters.pageSize : undefined,
    }
    Object.entries(values).forEach(([key, value]) => value == null || value === '' ? params.delete(key) : params.set(key, String(value)))
    const query = params.toString()
    window.history.replaceState(null, '', `/payments${query ? `?${query}` : ''}`)
  }, [filters])

  useEffect(() => {
    let active = true
    const loadFilterSource = async () => {
      try {
        const firstPage = await listPaymentRequests({ page: 1, pageSize: 100, sortBy: 'createdAt', sortOrder: 'desc' })
        const allItems = [...firstPage.items]
        const pageCount = Math.ceil(firstPage.total / firstPage.pageSize)
        for (let page = 2; page <= pageCount; page += 1) {
          const response = await listPaymentRequests({ page, pageSize: 100, sortBy: 'createdAt', sortOrder: 'desc' })
          allItems.push(...response.items)
        }
        if (active) setFilterSourceItems(allItems)
      } catch {
        if (active) setFilterSourceItems([])
      }
    }
    void loadFilterSource()
    return () => {
      active = false
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

  const reverseApprovedPayment = useCallback(async () => {
    if (!reversePaymentId) return
    try {
      const values = await reverseForm.validateFields()
      setReviewLoading(reversePaymentId)
      await reversePayment(reversePaymentId, values.reason.trim())
      setReversePaymentId(null)
      reverseForm.resetFields()
      await refreshDetail()
      message.success('Payment reversed. The original ledger entry was retained.')
    } catch (error) {
      message.error(getFormErrorMessage(error, 'Unable to reverse the payment.'))
    } finally {
      setReviewLoading(null)
    }
  }, [refreshDetail, reverseForm, reversePaymentId])

  const columns: ColumnsType<PaymentRequest> = [
    { title: t("Month"), dataIndex: 'month', width: 110, render: (value: string) => (value ? dayjs(value).format('MM/YYYY') : '-') },
    { title: t("Building"), dataIndex: 'building_name', width: 170 },
    { title: t("Room"), dataIndex: 'room_code', width: 100 },
    { title: t("Tenant"), dataIndex: 'tenant_name', width: 170 },
    { title: t("Request amount"), dataIndex: 'amount', width: 150, align: 'right', render: (value: number) => currency.format(value) },
    { title: t("Paid"), dataIndex: 'paid_amount', width: 130, align: 'right', render: (value: number) => currency.format(value ?? 0) },
    { title: t("Remaining"), dataIndex: 'remaining_amount', width: 130, align: 'right', render: (value: number) => currency.format(value ?? 0) },
    { title: t("Request status"), dataIndex: 'status', width: 160, render: (value: PaymentRequestStatus) => <Tag color={paymentRequestStatusColor[value]}>{t(paymentRequestStatusLabel[value])}</Tag> },
    { title: t("Latest proof"), dataIndex: 'latest_proof_status', width: 130, render: (value: string | null) => (value ? <Tag>{value}</Tag> : '-') },
    { title: t("Submitted"), dataIndex: 'latest_proof_submitted_at', width: 160, render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-') },
    {
      title: t("Actions"),
      key: 'actions',
      fixed: 'right',
      width: 90,
      render: (_, row) => (
        <Button
          size="small"
          aria-label={t("View payment request")}
          icon={<EyeOutlined />}
          onClick={() => void openDetail(row.id)}
        />
      ),
    },
  ]

  return (
    <>
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>{t("Payments")}</Typography.Title>
        <Typography.Text type="secondary">{t("Review manual bank transfer proofs and track invoice payment history.")}</Typography.Text>
      </div>

      <Card
        title={t("Filters")}
        extra={hasFilters(filters) ? (
          <Button icon={<ClearOutlined />} onClick={() => {
            setSearchInput('')
            setFilters({ page: 1, pageSize: filters.pageSize, sortBy: 'createdAt', sortOrder: 'desc' })
          }}>{t("Clear filters")}</Button>
        ) : null}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} lg={8} xl={6}>
            <Typography.Text strong>{t("Search")}</Typography.Text>
            <Input
              allowClear
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("Building, room, tenant, transfer note")}
              aria-label={t("Payment search")}
              style={{ marginTop: 4 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Typography.Text strong>{t("Month")}</Typography.Text>
            <DatePicker
              picker="month"
              format="MM/YYYY"
              value={filters.month ? dayjs(filters.month) : null}
              onChange={(value) => setFilters((current) => ({ ...current, month: value?.format('YYYY-MM'), page: 1 }))}
              placeholder={t("Select month")}
              aria-label={t("Month filter")}
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Typography.Text strong>{t("Building")}</Typography.Text>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              value={filters.building_id}
              options={buildingOptions}
              onChange={(value) => setFilters((current) => ({ ...current, building_id: value, room_id: undefined, tenant_id: undefined, page: 1 }))}
              placeholder={t("All buildings")}
              aria-label={t("Building filter")}
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Typography.Text strong>{t("Room")}</Typography.Text>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              value={filters.room_id}
              options={roomOptions}
              onChange={(value) => setFilters((current) => ({ ...current, room_id: value, tenant_id: undefined, page: 1 }))}
              placeholder={t("All rooms")}
              aria-label={t("Room filter")}
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Typography.Text strong>{t("Tenant")}</Typography.Text>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              value={filters.tenant_id}
              options={tenantOptions}
              onChange={(value) => setFilters((current) => ({ ...current, tenant_id: value, page: 1 }))}
              placeholder={t("All tenants")}
              aria-label={t("Tenant filter")}
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Typography.Text strong>{t("Request status")}</Typography.Text>
            <Select
              allowClear
              value={filters.request_status}
              options={requestStatusOptions.map((option) => ({ ...option, label: t(option.label) }))}
              onChange={(value) => setFilters((current) => ({ ...current, request_status: value, page: 1 }))}
              placeholder={t("All statuses")}
              aria-label={t("Request status filter")}
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <Typography.Text strong>{t("Latest proof")}</Typography.Text>
            <Select
              allowClear
              value={filters.latest_proof_status}
              options={latestProofOptions.map((option) => ({ ...option, label: t(option.label) }))}
              onChange={(value) => setFilters((current) => ({ ...current, latest_proof_status: value, page: 1 }))}
              placeholder={t("All proof statuses")}
              aria-label={t("Latest proof filter")}
              style={{ width: '100%', marginTop: 4 }}
            />
          </Col>
        </Row>
      </Card>

      <Card>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Tag color={pendingProofs > 0 ? 'gold' : 'green'}>{pendingProofs} {t("pending proof(s)")}</Tag>
            <Typography.Text type="secondary">{total} {t("payment request(s)")}</Typography.Text>
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>{t("Refresh")}</Button>
        </Space>
      </Card>

      <Card title={t("Payment requests")}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={items}
            scroll={{ x: 1450 }}
            pagination={{
              current: filters.page,
              pageSize: filters.pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (value) => `${value} payment requests`,
              onChange: (page, pageSize) => setFilters((current) => ({
                ...current,
                page: pageSize === current.pageSize ? page : 1,
                pageSize,
              })),
            }}
            locale={{ emptyText: <Empty description={t("No payment requests")} /> }}
          />
        )}
      </Card>

      <Drawer title={t("Payment request detail")} open={detailOpen} width={isMobile ? '100%' : 760} onClose={() => setDetailOpen(false)}>
        {detailLoading || !detailItem ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={isMobile ? 1 : 2} size="small" bordered>
              <Descriptions.Item label={t("Invoice")}>{detailItem.building_name} {t("/ Room")} {detailItem.room_code}</Descriptions.Item>
              <Descriptions.Item label={t("Month")}>{detailItem.month ? dayjs(detailItem.month).format('MM/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Tenant")}>{detailItem.tenant_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Status")}><Tag color={paymentRequestStatusColor[detailItem.status]}>{detailItem.status}</Tag></Descriptions.Item>
              <Descriptions.Item label={t("Invoice total")}>{currency.format(detailItem.invoice_total ?? 0)}</Descriptions.Item>
              <Descriptions.Item label={t("Gross payments")}>{currency.format(detailItem.gross_payment_amount ?? 0)}</Descriptions.Item>
              <Descriptions.Item label={t("Reversals")}>{currency.format(detailItem.reversal_amount ?? 0)}</Descriptions.Item>
              <Descriptions.Item label={t("Net paid")}>{currency.format(detailItem.paid_amount ?? 0)}</Descriptions.Item>
              <Descriptions.Item label={t("Remaining")}>{currency.format(detailItem.remaining_amount ?? 0)}</Descriptions.Item>
              <Descriptions.Item label={t("Request amount")}>{currency.format(detailItem.amount)}</Descriptions.Item>
              <Descriptions.Item label={t("Bank")}>{detailItem.bank_code ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Account")}>{detailItem.bank_account_no ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Account name")}>{detailItem.bank_account_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Transfer note")}>{detailItem.transfer_note ?? '-'}</Descriptions.Item>
            </Descriptions>

            {detailItem.status === 'WAITING_TRANSFER' ? (
              <Alert showIcon type="info" message={t("Partial payments are allowed. The invoice becomes PAID only after approved payments cover the invoice total.")} />
            ) : null}

            <Card size="small" title={t("Proof history")}>
              <Table<PaymentProof>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detailItem.proofs ?? []}
                locale={{ emptyText: <Empty description={t("No proof submitted")} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                columns={[
                  { title: t("Submitted"), dataIndex: 'submitted_at', render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm') },
                  { title: t("Amount"), dataIndex: 'transfer_amount', align: 'right', render: (value: number) => currency.format(value) },
                  { title: t("Status"), dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> },
                  { title: t("File"), dataIndex: 'file_url', render: (value: string, row) => <a href={value} target="_blank" rel="noreferrer">{row.file_name || 'Open file'}</a> },
                  { title: t("Note"), dataIndex: 'payer_note', render: (value: string | null) => value ?? '-' },
                  {
                    title: t("Review"),
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

            <Card size="small" title={t("Payment ledger")}>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detailItem.payments ?? []}
                locale={{ emptyText: <Empty description={t("No payment ledger entries")} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                columns={[
                  { title: t("Paid at"), dataIndex: 'paid_at', render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-') },
                  { title: t("Entry"), dataIndex: 'entry_type', render: (value: string) => <Tag color={value === 'REVERSAL' ? 'red' : 'green'}>{value}</Tag> },
                  {
                    title: t("Amount"),
                    dataIndex: 'signed_amount',
                    align: 'right',
                    render: (value: number) => <Typography.Text type={value < 0 ? 'danger' : undefined}>{currency.format(value)}</Typography.Text>,
                  },
                  { title: t("Status"), dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> },
                  { title: t("Reason / note"), render: (_: unknown, row) => row.reversal_reason ?? row.note ?? '-' },
                  {
                    title: t("Action"),
                    key: 'action',
                    render: (_: unknown, row) => row.entry_type === 'PAYMENT' && row.status === 'SUCCEEDED' && !row.reversal_payment_id ? (
                      <Button
                        size="small"
                        danger
                        icon={<RollbackOutlined />}
                        loading={reviewLoading === row.id}
                        onClick={() => setReversePaymentId(row.id)}
                      >
                        {t("Reverse")}
                      </Button>
                    ) : null,
                  },
                ]}
              />
            </Card>
          </Space>
        )}
      </Drawer>

      <Modal
        open={Boolean(rejectProofId)}
        title={t("Reject payment proof")}
        okText={t("Reject")}
        okButtonProps={{ danger: true }}
        confirmLoading={Boolean(reviewLoading)}
        onOk={() => void rejectProof()}
        onCancel={() => {
          setRejectProofId(null)
          rejectForm.resetFields()
        }}
        destroyOnHidden
      >
        <Form form={rejectForm} layout="vertical">
          <Form.Item name="reason" label={t("Reject reason")} rules={[{ required: true, whitespace: true, message: t("Please enter reject reason") }]}>
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(reversePaymentId)}
        title={t("Reverse approved payment?")}
        okText={t("Create reversal")}
        okButtonProps={{ danger: true }}
        confirmLoading={Boolean(reviewLoading)}
        onOk={() => void reverseApprovedPayment()}
        onCancel={() => {
          setReversePaymentId(null)
          reverseForm.resetFields()
        }}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            showIcon
            type="warning"
            message={t("The approved payment will remain unchanged.")}
            description={t("A separate reversal entry will be added to the ledger and the invoice balance will be recalculated.")}
          />
          <Form form={reverseForm} layout="vertical">
            <Form.Item
              name="reason"
              label={t("Reversal reason")}
              rules={[
                { required: true, whitespace: true, message: t("Please enter a reversal reason.") },
                { min: 3, max: 500, message: t("The reason must contain 3 to 500 characters.") },
              ]}
            >
              <Input.TextArea rows={3} maxLength={500} showCount />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </Space>
    </>
  )
}
