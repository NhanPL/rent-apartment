import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createPayment,
  deletePayment,
  getPayment,
  getPaymentsSummary,
  getUnpaidRooms,
  listBuildings,
  listContracts,
  listPayments,
  listRooms,
  listTenants,
  updatePayment,
} from '../../services/paymentsService'
import type {
  Contract,
  InvoiceStatus,
  PaymentListItem,
  UnpaidRoomItem,
} from './types'
import './PaymentsPage.css'

interface PaymentFormValues {
  contract_id?: string
  room_id?: string
  month: string
  status: InvoiceStatus
  issued_at?: string
  due_date?: string
  rent_amount: number
  electric_amount: number
  water_amount: number
  service_amount: number
  discount: number
  note?: string
}

const statusOptions: { label: string; value: InvoiceStatus; color: string }[] = [
  { label: 'Draft', value: 'DRAFT', color: 'default' },
  { label: 'Issued', value: 'ISSUED', color: 'blue' },
  { label: 'Paid', value: 'PAID', color: 'green' },
  { label: 'Overdue', value: 'OVERDUE', color: 'red' },
  { label: 'Void', value: 'VOID', color: 'default' },
]

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

const defaultValues: PaymentFormValues = {
  month: dayjs().startOf('month').format('YYYY-MM-DD'),
  status: 'DRAFT',
  rent_amount: 0,
  electric_amount: 0,
  water_amount: 0,
  service_amount: 0,
  discount: 0,
}

export function PaymentsPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [form] = Form.useForm<PaymentFormValues>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<PaymentListItem[]>([])
  const [unpaidRooms, setUnpaidRooms] = useState<UnpaidRoomItem[]>([])
  const [summary, setSummary] = useState({ totalInvoices: 0, paidInvoices: 0, unpaidInvoices: 0, totalRevenue: 0 })

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [monthFilter, setMonthFilter] = useState(dayjs().format('YYYY-MM'))
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | undefined>()
  const [buildingFilter, setBuildingFilter] = useState<string | undefined>()
  const [roomFilter, setRoomFilter] = useState<string | undefined>()
  const [tenantFilter, setTenantFilter] = useState<string | undefined>()

  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([])
  const [rooms, setRooms] = useState<{ id: string; building_id: string; code: string }[]>([])
  const [tenants, setTenants] = useState<{ id: string; full_name: string }[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<PaymentListItem | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const loadOptions = useCallback(async () => {
    const [buildingRows, roomRows, tenantRows, contractRows] = await Promise.all([
      listBuildings(),
      listRooms(),
      listTenants(),
      listContracts(),
    ])
    setBuildings(buildingRows)
    setRooms(roomRows)
    setTenants(tenantRows)
    setContracts(contractRows)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [paymentRows, unpaidRows, sum] = await Promise.all([
        listPayments({ search, month: monthFilter, status: statusFilter, building_id: buildingFilter, room_id: roomFilter, tenant_id: tenantFilter }),
        getUnpaidRooms(monthFilter),
        getPaymentsSummary(monthFilter),
      ])
      setItems(paymentRows)
      setUnpaidRooms(unpaidRows)
      setSummary(sum)
    } catch {
      setError('Unable to load payments data. Please retry.')
    } finally {
      setLoading(false)
    }
  }, [search, monthFilter, statusFilter, buildingFilter, roomFilter, tenantFilter])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const roomOptions = useMemo(() => {
    if (!buildingFilter) return rooms
    return rooms.filter((room) => room.building_id === buildingFilter)
  }, [rooms, buildingFilter])

  const selectedRoomId = Form.useWatch('room_id', form)

  const contractOptions = useMemo(
    () => contracts.filter((contract) => contract.status === 'ACTIVE' && (!selectedRoomId || contract.room_id === selectedRoomId)),
    [contracts, selectedRoomId],
  )

  const totalAmount = Form.useWatch(['rent_amount'], form) ?? 0
  const electricAmount = Form.useWatch(['electric_amount'], form) ?? 0
  const waterAmount = Form.useWatch(['water_amount'], form) ?? 0
  const serviceAmount = Form.useWatch(['service_amount'], form) ?? 0
  const discountAmount = Form.useWatch(['discount'], form) ?? 0

  const computedTotal = Math.max(0, totalAmount + electricAmount + waterAmount + serviceAmount - discountAmount)

  const openCreate = useCallback((prefill?: Partial<PaymentFormValues>) => {
    setDrawerMode('create')
    setEditingId(null)
    form.resetFields()
    form.setFieldsValue({ ...defaultValues, ...prefill })
    setDrawerOpen(true)
  }, [form])

  const openEdit = useCallback(async (id: string) => {
    const row = await getPayment(id)
    setDrawerMode('edit')
    setEditingId(id)
    form.resetFields()
    form.setFieldsValue({
      contract_id: row.contract_id,
      room_id: row.room_id,
      month: row.month,
      status: row.status,
      issued_at: row.issued_at ?? undefined,
      due_date: row.due_date ?? undefined,
      discount: row.discount,
      rent_amount: row.rent_amount,
      electric_amount: row.electric_amount,
      water_amount: row.water_amount,
      service_amount: row.service_amount,
      note: row.note ?? undefined,
    })
    setDrawerOpen(true)
  }, [form])

  const onSave = useCallback(async () => {
    const values = await form.validateFields()
    if (!values.contract_id || !values.room_id) return

    setSaveLoading(true)
    try {
      const payload = {
        contract_id: values.contract_id,
        room_id: values.room_id,
        month: values.month,
        status: values.status,
        issued_at: values.issued_at ?? null,
        due_date: values.due_date ?? null,
        note: values.note ?? null,
        discount: values.discount,
        rent_amount: values.rent_amount,
        electric_amount: values.electric_amount,
        water_amount: values.water_amount,
        service_amount: values.service_amount,
      }

      if (drawerMode === 'create') {
        await createPayment(payload)
        message.success('Invoice created successfully.')
      } else if (editingId) {
        await updatePayment(editingId, payload)
        message.success('Invoice updated successfully.')
      }

      setDrawerOpen(false)
      void loadData()
    } catch {
      message.error('Unable to save invoice.')
    } finally {
      setSaveLoading(false)
    }
  }, [drawerMode, editingId, form, loadData])

  const onDelete = useCallback((id: string) => {
    Modal.confirm({
      title: 'Delete this invoice?',
      content: 'This action cannot be undone.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deletePayment(id)
        message.success('Invoice deleted.')
        void loadData()
      },
    })
  }, [loadData])

  const openDetail = useCallback(async (id: string) => {
    const row = await getPayment(id)
    setDetailItem(row)
    setDetailOpen(true)
  }, [])

  const columns: ColumnsType<PaymentListItem> = [
    { title: 'Month', dataIndex: 'month', width: 120, render: (value: string) => dayjs(value).format('MM/YYYY') },
    { title: 'Building', dataIndex: 'building_name', width: 180 },
    { title: 'Room', dataIndex: 'room_code', width: 110 },
    { title: 'Tenant', dataIndex: 'tenant_name', width: 180 },
    { title: 'Rent', dataIndex: 'rent_amount', width: 130, align: 'right', render: (value: number) => currency.format(value) },
    { title: 'Electric', dataIndex: 'electric_amount', width: 130, align: 'right', render: (value: number) => currency.format(value) },
    { title: 'Water', dataIndex: 'water_amount', width: 130, align: 'right', render: (value: number) => currency.format(value) },
    { title: 'Total', dataIndex: 'total', width: 140, align: 'right', render: (value: number) => <strong>{currency.format(value)}</strong> },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (value: InvoiceStatus) => <Tag color={statusOptions.find((item) => item.value === value)?.color}>{value}</Tag>,
    },
    { title: 'Due date', dataIndex: 'due_date', width: 130, render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY') : '-') },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 130,
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => void openDetail(row.id)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => void openEdit(row.id)} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(row.id)} />
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} className="payments-page">
      <div className="payments-toolbar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>Payments</Typography.Title>
          <Typography.Text type="secondary">Manage monthly room invoices and rent collection.</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
          Add Invoice
        </Button>
      </div>

      <Card>
        <div className="payments-filters">
          <Input placeholder="Search building, room, tenant" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} allowClear />
          <Input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} />
          <Select allowClear placeholder="Status" value={statusFilter} onChange={setStatusFilter} options={statusOptions.map((item) => ({ label: item.label, value: item.value }))} />
          <Select
            allowClear
            placeholder="Building"
            value={buildingFilter}
            onChange={(value) => {
              setBuildingFilter(value)
              setRoomFilter(undefined)
            }}
            options={buildings.map((item) => ({ label: item.name, value: item.id }))}
          />
          <Select allowClear placeholder="Room" value={roomFilter} onChange={setRoomFilter} options={roomOptions.map((item) => ({ label: item.code, value: item.id }))} />
          <Select allowClear placeholder="Tenant" value={tenantFilter} onChange={setTenantFilter} options={tenants.map((item) => ({ label: item.full_name, value: item.id }))} />
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>
            Refresh
          </Button>
        </div>
      </Card>

      <div className="payments-summary-grid">
        <Card><Statistic title="Total invoices" value={summary.totalInvoices} /></Card>
        <Card><Statistic title="Paid invoices" value={summary.paidInvoices} /></Card>
        <Card><Statistic title="Unpaid invoices" value={summary.unpaidInvoices} /></Card>
        <Card><Statistic title="Revenue (paid)" value={summary.totalRevenue} formatter={(value) => currency.format(Number(value))} /></Card>
      </div>

      <Card title="Rooms with unpaid rent" extra={<Typography.Text type="secondary">{monthFilter}</Typography.Text>}>
        <Table<UnpaidRoomItem>
          rowKey={(row) => `${row.contract_id}-${row.month}`}
          size="small"
          pagination={false}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty description="All active rooms are paid for this month" /> }}
          dataSource={unpaidRooms}
          columns={[
            { title: 'Building', dataIndex: 'building_name', width: 180 },
            { title: 'Room', dataIndex: 'room_code', width: 100 },
            { title: 'Tenant', dataIndex: 'tenant_name', width: 180 },
            { title: 'Month', dataIndex: 'month', width: 110, render: (value: string) => dayjs(`${value}-01`).format('MM/YYYY') },
            { title: 'Amount due', dataIndex: 'amount_due', width: 150, align: 'right', render: (value: number) => currency.format(value) },
            { title: 'Due date', dataIndex: 'due_date', width: 120, render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY') : '-') },
            {
              title: 'Action',
              width: 180,
              render: (_, row) => (
                row.invoice_id ? (
                  <Button type="link" onClick={() => void openDetail(row.invoice_id!)}>View invoice</Button>
                ) : (
                  <Button type="link" onClick={() => openCreate({ room_id: row.room_id, contract_id: row.contract_id, month: `${row.month}-01`, rent_amount: row.amount_due })}>Create invoice</Button>
                )
              ),
            },
          ]}
        />
      </Card>

      <Card title="Monthly invoices">
        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : error ? (
          <Empty description={error}><Button onClick={() => void loadData()}>Retry</Button></Empty>
        ) : (
          <Table rowKey="id" columns={columns} dataSource={items} scroll={{ x: 1450 }} locale={{ emptyText: <Empty description="No invoices found" /> }} />
        )}
      </Card>

      <Drawer
        title={drawerMode === 'create' ? 'Add invoice' : 'Edit invoice'}
        placement="right"
        open={drawerOpen}
        width={isMobile ? '100%' : 500}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={defaultValues}>
          <div className="payments-form-grid">
            <Form.Item label="Room" name="room_id" rules={[{ required: true, message: 'Please select room' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                options={rooms.map((item) => ({ label: item.code, value: item.id }))}
              />
            </Form.Item>
            <Form.Item label="Contract" name="contract_id" rules={[{ required: true, message: 'Please select contract' }]}>
              <Select options={contractOptions.map((item) => ({ label: item.id, value: item.id }))} />
            </Form.Item>
            <Form.Item label="Month" name="month" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item label="Status" name="status" rules={[{ required: true }]}>
              <Select options={statusOptions.map((item) => ({ label: item.label, value: item.value }))} />
            </Form.Item>
            <Form.Item label="Issued at" name="issued_at">
              <Input type="date" />
            </Form.Item>
            <Form.Item label="Due date" name="due_date">
              <Input type="date" />
            </Form.Item>
            <Form.Item label="Rent amount" name="rent_amount" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Electric amount" name="electric_amount" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Water amount" name="water_amount" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Service fee" name="service_amount" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Discount" name="discount" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Total amount">
              <Typography.Text strong>{currency.format(computedTotal)}</Typography.Text>
            </Form.Item>
            <Form.Item label="Note" name="note" className="payments-form-full">
              <Input.TextArea rows={3} />
            </Form.Item>
          </div>
          <Space className="payments-drawer-actions">
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" loading={saveLoading} onClick={() => void onSave()}>Save</Button>
          </Space>
        </Form>
      </Drawer>

      <Drawer title="Invoice detail" placement="right" open={detailOpen} width={isMobile ? '100%' : 460} onClose={() => setDetailOpen(false)}>
        {detailItem ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Month">{dayjs(detailItem.month).format('MM/YYYY')}</Descriptions.Item>
            <Descriptions.Item label="Building">{detailItem.building_name}</Descriptions.Item>
            <Descriptions.Item label="Room">{detailItem.room_code}</Descriptions.Item>
            <Descriptions.Item label="Tenant">{detailItem.tenant_name}</Descriptions.Item>
            <Descriptions.Item label="Status"><Tag color={statusOptions.find((item) => item.value === detailItem.status)?.color}>{detailItem.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="Rent">{currency.format(detailItem.rent_amount)}</Descriptions.Item>
            <Descriptions.Item label="Electric">{currency.format(detailItem.electric_amount)}</Descriptions.Item>
            <Descriptions.Item label="Water">{currency.format(detailItem.water_amount)}</Descriptions.Item>
            <Descriptions.Item label="Service">{currency.format(detailItem.service_amount)}</Descriptions.Item>
            <Descriptions.Item label="Discount">{currency.format(detailItem.discount)}</Descriptions.Item>
            <Descriptions.Item label="Total">{currency.format(detailItem.total)}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </Space>
  )
}
