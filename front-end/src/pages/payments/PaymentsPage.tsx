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
  getEffectiveUtilityRate,
  getPayment,
  getPaymentsSummary,
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
  PaymentStatus,
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
  electricity_prev: number
  electricity_curr: number
  water_prev: number
  water_curr: number
  electric_unit_price: number
  water_unit_price: number
  other_fees: number
  discount: number
  note?: string
}

const invoiceStatusOptions: { label: string; value: InvoiceStatus; color: string }[] = [
  { label: 'Draft', value: 'DRAFT', color: 'default' },
  { label: 'Issued', value: 'ISSUED', color: 'blue' },
  { label: 'Paid', value: 'PAID', color: 'green' },
  { label: 'Overdue', value: 'OVERDUE', color: 'red' },
  { label: 'Void', value: 'VOID', color: 'default' },
]

const paymentStatusOptions: { label: string; value: PaymentStatus; color: string }[] = [
  { label: 'Pending', value: 'PENDING', color: 'gold' },
  { label: 'Succeeded', value: 'SUCCEEDED', color: 'green' },
  { label: 'Failed', value: 'FAILED', color: 'red' },
  { label: 'Refunded', value: 'REFUNDED', color: 'purple' },
  { label: 'Cancelled', value: 'CANCELLED', color: 'default' },
]

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

const defaultValues: PaymentFormValues = {
  month: dayjs().startOf('month').format('YYYY-MM-DD'),
  status: 'DRAFT',
  rent_amount: 0,
  electricity_prev: 0,
  electricity_curr: 0,
  water_prev: 0,
  water_curr: 0,
  electric_unit_price: 0,
  water_unit_price: 0,
  other_fees: 0,
  discount: 0,
}

export function PaymentsPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [form] = Form.useForm<PaymentFormValues>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<PaymentListItem[]>([])
  const [summary, setSummary] = useState({ totalInvoices: 0, paidInvoices: 0, unpaidInvoices: 0, totalRevenue: 0 })

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [monthFilter, setMonthFilter] = useState(dayjs().format('YYYY-MM'))
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<InvoiceStatus | undefined>()
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatus | undefined>()
  const [buildingFilter, setBuildingFilter] = useState<string | undefined>()
  const [roomFilter, setRoomFilter] = useState<string | undefined>()
  const [tenantFilter, setTenantFilter] = useState<string | undefined>()

  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([])
  const [rooms, setRooms] = useState<{ id: string; building_id: string; code: string; base_rent: number }[]>([])
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
      const [paymentRows, summaryRows] = await Promise.all([
        listPayments({
          search,
          month: monthFilter,
          invoice_status: invoiceStatusFilter,
          payment_status: paymentStatusFilter,
          building_id: buildingFilter,
          room_id: roomFilter,
          tenant_id: tenantFilter,
        }),
        getPaymentsSummary(monthFilter),
      ])

      setItems(paymentRows)
      setSummary(summaryRows)
    } catch {
      setError('Unable to load payments. Please retry.')
    } finally {
      setLoading(false)
    }
  }, [search, monthFilter, invoiceStatusFilter, paymentStatusFilter, buildingFilter, roomFilter, tenantFilter])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const roomFilterOptions = useMemo(() => {
    if (!buildingFilter) {
      return rooms
    }

    return rooms.filter((room) => room.building_id === buildingFilter)
  }, [rooms, buildingFilter])

  const selectedRoomId = Form.useWatch('room_id', form)
  const selectedContractId = Form.useWatch('contract_id', form)
  const selectedMonth = Form.useWatch('month', form)

  const drawerRoomOptions = useMemo(() => {
    if (!selectedRoomId) {
      return rooms
    }

    const selectedRoom = rooms.find((room) => room.id === selectedRoomId)
    if (!selectedRoom) {
      return rooms
    }

    return rooms.filter((room) => room.building_id === selectedRoom.building_id)
  }, [rooms, selectedRoomId])

  const contractOptions = useMemo(
    () => contracts.filter((contract) => contract.status === 'ACTIVE' && (!selectedRoomId || contract.room_id === selectedRoomId)),
    [contracts, selectedRoomId],
  )

  const selectedTenant = useMemo(() => {
    if (!selectedContractId) {
      return null
    }

    const row = items.find((item) => item.contract_id === selectedContractId)
    if (row?.tenant_id) {
      return tenants.find((tenant) => tenant.id === row.tenant_id) ?? null
    }

    return null
  }, [selectedContractId, items, tenants])

  const rentAmount = Form.useWatch('rent_amount', form) ?? 0
  const electricityPrev = Form.useWatch('electricity_prev', form) ?? 0
  const electricityCurr = Form.useWatch('electricity_curr', form) ?? 0
  const waterPrev = Form.useWatch('water_prev', form) ?? 0
  const waterCurr = Form.useWatch('water_curr', form) ?? 0
  const electricUnitPrice = Form.useWatch('electric_unit_price', form) ?? 0
  const waterUnitPrice = Form.useWatch('water_unit_price', form) ?? 0
  const otherFees = Form.useWatch('other_fees', form) ?? 0
  const discount = Form.useWatch('discount', form) ?? 0

  const electricUsage = useMemo(() => Math.max(0, electricityCurr - electricityPrev), [electricityCurr, electricityPrev])
  const waterUsage = useMemo(() => Math.max(0, waterCurr - waterPrev), [waterCurr, waterPrev])
  const electricAmount = useMemo(() => electricUsage * electricUnitPrice, [electricUsage, electricUnitPrice])
  const waterAmount = useMemo(() => waterUsage * waterUnitPrice, [waterUsage, waterUnitPrice])
  const subtotal = useMemo(() => rentAmount + electricAmount + waterAmount + otherFees, [rentAmount, electricAmount, waterAmount, otherFees])
  const totalAmount = useMemo(() => Math.max(0, subtotal - discount), [subtotal, discount])

  useEffect(() => {
    if (!drawerOpen || !selectedRoomId || !selectedMonth) {
      return
    }

    const room = rooms.find((item) => item.id === selectedRoomId)
    if (!room) {
      return
    }

    void getEffectiveUtilityRate(selectedRoomId, selectedMonth).then((rate) => {
      form.setFieldValue('electric_unit_price', rate.electricity_unit_price)
      form.setFieldValue('water_unit_price', rate.water_unit_price)
      if (!form.getFieldValue('rent_amount')) {
        const contract = contracts.find((item) => item.room_id === selectedRoomId && item.status === 'ACTIVE')
        form.setFieldValue('rent_amount', contract?.rent_price ?? room.base_rent)
      }
    })
  }, [drawerOpen, selectedRoomId, selectedMonth, form, rooms, contracts])

  const openCreate = useCallback(() => {
    setDrawerMode('create')
    setEditingId(null)
    form.resetFields()
    form.setFieldsValue(defaultValues)
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
      rent_amount: row.rent_amount,
      electricity_prev: row.electricity_prev ?? 0,
      electricity_curr: row.electricity_curr ?? 0,
      water_prev: row.water_prev ?? 0,
      water_curr: row.water_curr ?? 0,
      electric_unit_price: row.electric_unit_price,
      water_unit_price: row.water_unit_price,
      other_fees: row.other_fees,
      discount: row.discount,
      note: row.note ?? undefined,
    })
    setDrawerOpen(true)
  }, [form])

  const openDetail = useCallback(async (id: string) => {
    const row = await getPayment(id)
    setDetailItem(row)
    setDetailOpen(true)
  }, [])

  const onSave = useCallback(async () => {
    const values = await form.validateFields()
    if (!values.contract_id || !values.room_id) {
      return
    }

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
        electricity_prev: values.electricity_prev,
        electricity_curr: values.electricity_curr,
        water_prev: values.water_prev,
        water_curr: values.water_curr,
        electric_unit_price: values.electric_unit_price,
        water_unit_price: values.water_unit_price,
        other_fees: values.other_fees,
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

  const columns: ColumnsType<PaymentListItem> = [
    { title: 'Month', dataIndex: 'month', width: 110, render: (value: string) => dayjs(value).format('MM/YYYY') },
    { title: 'Building', dataIndex: 'building_name', width: 170 },
    { title: 'Room', dataIndex: 'room_code', width: 100 },
    { title: 'Tenant', dataIndex: 'tenant_name', width: 170 },
    { title: 'Room rent', dataIndex: 'rent_amount', width: 130, align: 'right', render: (value: number) => currency.format(value) },
    { title: 'Electric amount', dataIndex: 'electric_amount', width: 140, align: 'right', render: (value: number) => currency.format(value) },
    { title: 'Water amount', dataIndex: 'water_amount', width: 130, align: 'right', render: (value: number) => currency.format(value) },
    { title: 'Other fees', dataIndex: 'other_fees', width: 120, align: 'right', render: (value: number) => currency.format(value) },
    { title: 'Total', dataIndex: 'total', width: 130, align: 'right', render: (value: number) => <strong>{currency.format(value)}</strong> },
    {
      title: 'Invoice status',
      dataIndex: 'status',
      width: 130,
      render: (value: InvoiceStatus) => <Tag color={invoiceStatusOptions.find((item) => item.value === value)?.color}>{value}</Tag>,
    },
    {
      title: 'Payment status',
      dataIndex: 'payment_status',
      width: 130,
      render: (value: PaymentStatus | null) => {
        if (!value) {
          return <Tag>NO_PAYMENT</Tag>
        }
        return <Tag color={paymentStatusOptions.find((item) => item.value === value)?.color}>{value}</Tag>
      },
    },
    { title: 'Due date', dataIndex: 'due_date', width: 120, render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY') : '-') },
    { title: 'Paid date', dataIndex: 'paid_at', width: 120, render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY') : '-') },
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
          <Typography.Text type="secondary">Manage monthly invoices from contracts, utility readings, and payment status.</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>+ Add Invoice</Button>
      </div>

      <Card>
        <div className="payments-filters">
          <Input placeholder="Search building, room, tenant" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} allowClear />
          <Input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} />
          <Select allowClear placeholder="Invoice status" value={invoiceStatusFilter} onChange={setInvoiceStatusFilter} options={invoiceStatusOptions.map((item) => ({ label: item.label, value: item.value }))} />
          <Select allowClear placeholder="Payment status" value={paymentStatusFilter} onChange={setPaymentStatusFilter} options={paymentStatusOptions.map((item) => ({ label: item.label, value: item.value }))} />
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
          <Select allowClear placeholder="Room" value={roomFilter} onChange={setRoomFilter} options={roomFilterOptions.map((item) => ({ label: item.code, value: item.id }))} />
          <Select allowClear placeholder="Tenant" value={tenantFilter} onChange={setTenantFilter} options={tenants.map((item) => ({ label: item.full_name, value: item.id }))} />
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>Refresh</Button>
        </div>
      </Card>

      <div className="payments-summary-grid">
        <Card><Statistic title="Total invoices" value={summary.totalInvoices} /></Card>
        <Card><Statistic title="Paid invoices" value={summary.paidInvoices} /></Card>
        <Card><Statistic title="Unpaid invoices" value={summary.unpaidInvoices} /></Card>
        <Card><Statistic title="Revenue (paid)" value={summary.totalRevenue} formatter={(value) => currency.format(Number(value))} /></Card>
      </div>

      <Card title="Monthly invoices">
        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : error ? (
          <Empty description={error}><Button onClick={() => void loadData()}>Retry</Button></Empty>
        ) : (
          <Table rowKey="id" columns={columns} dataSource={items} scroll={{ x: 1950 }} locale={{ emptyText: <Empty description="No invoices found" /> }} />
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
              <Select showSearch optionFilterProp="label" options={drawerRoomOptions.map((item) => ({ label: item.code, value: item.id }))} />
            </Form.Item>
            <Form.Item label="Contract" name="contract_id" rules={[{ required: true, message: 'Please select contract' }]}>
              <Select options={contractOptions.map((item) => ({ label: item.id, value: item.id }))} />
            </Form.Item>
            <Form.Item label="Tenant" className="payments-form-readonly">
              <Input value={selectedTenant?.full_name ?? '-'} readOnly />
            </Form.Item>
            <Form.Item label="Billing month" name="month" rules={[{ required: true }]}> 
              <Input type="date" />
            </Form.Item>
            <Form.Item label="Invoice status" name="status" rules={[{ required: true }]}>
              <Select options={invoiceStatusOptions.map((item) => ({ label: item.label, value: item.value }))} />
            </Form.Item>
            <Form.Item label="Issued at" name="issued_at">
              <Input type="date" />
            </Form.Item>
            <Form.Item label="Due date" name="due_date">
              <Input type="date" />
            </Form.Item>
            <Form.Item label="Room rent" name="rent_amount" rules={[{ required: true }]}> 
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="Previous electric reading" name="electricity_prev" rules={[{ required: true }]}> 
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="Current electric reading"
              name="electricity_curr"
              dependencies={['electricity_prev']}
              rules={[
                { required: true },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (typeof value !== 'number') {
                      return Promise.reject(new Error('Current electric reading is required'))
                    }

                    if (value < (getFieldValue('electricity_prev') ?? 0)) {
                      return Promise.reject(new Error('Current reading must be greater than or equal to previous reading'))
                    }

                    return Promise.resolve()
                  },
                }),
              ]}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="Previous water reading" name="water_prev" rules={[{ required: true }]}> 
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="Current water reading"
              name="water_curr"
              dependencies={['water_prev']}
              rules={[
                { required: true },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (typeof value !== 'number') {
                      return Promise.reject(new Error('Current water reading is required'))
                    }

                    if (value < (getFieldValue('water_prev') ?? 0)) {
                      return Promise.reject(new Error('Current reading must be greater than or equal to previous reading'))
                    }

                    return Promise.resolve()
                  },
                }),
              ]}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="Electric unit price" name="electric_unit_price" rules={[{ required: true }]}> 
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Water unit price" name="water_unit_price" rules={[{ required: true }]}> 
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="Electric usage">
              <Input value={electricUsage} readOnly />
            </Form.Item>
            <Form.Item label="Electric amount">
              <Input value={currency.format(electricAmount)} readOnly />
            </Form.Item>
            <Form.Item label="Water usage">
              <Input value={waterUsage} readOnly />
            </Form.Item>
            <Form.Item label="Water amount">
              <Input value={currency.format(waterAmount)} readOnly />
            </Form.Item>

            <Form.Item label="Other fees" name="other_fees" rules={[{ required: true }]}> 
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Discount" name="discount" rules={[{ required: true }]}> 
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Subtotal">
              <Input value={currency.format(subtotal)} readOnly />
            </Form.Item>
            <Form.Item label="Total amount">
              <Input value={currency.format(totalAmount)} readOnly />
            </Form.Item>

            <Form.Item label="Notes" name="note" className="payments-form-full">
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
            <Descriptions.Item label="Invoice status"><Tag color={invoiceStatusOptions.find((item) => item.value === detailItem.status)?.color}>{detailItem.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="Payment status">{detailItem.payment_status ?? 'NO_PAYMENT'}</Descriptions.Item>
            <Descriptions.Item label="Electric reading (prev/curr)">{`${detailItem.electricity_prev ?? 0} / ${detailItem.electricity_curr ?? 0}`}</Descriptions.Item>
            <Descriptions.Item label="Water reading (prev/curr)">{`${detailItem.water_prev ?? 0} / ${detailItem.water_curr ?? 0}`}</Descriptions.Item>
            <Descriptions.Item label="Electric usage">{detailItem.electric_usage}</Descriptions.Item>
            <Descriptions.Item label="Water usage">{detailItem.water_usage}</Descriptions.Item>
            <Descriptions.Item label="Electric amount">{currency.format(detailItem.electric_amount)}</Descriptions.Item>
            <Descriptions.Item label="Water amount">{currency.format(detailItem.water_amount)}</Descriptions.Item>
            <Descriptions.Item label="Other fees">{currency.format(detailItem.other_fees)}</Descriptions.Item>
            <Descriptions.Item label="Total">{currency.format(detailItem.total)}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </Space>
  )
}
