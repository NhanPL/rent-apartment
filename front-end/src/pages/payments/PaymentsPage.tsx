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
  listBuildings,
  listContracts,
  listPayments,
  listRooms,
  listTenants,
  updatePayment,
} from '../../services/paymentsService'
import {
  InvoiceFormFields,
  invoiceFormDefaultValues,
  useInvoiceDerivedValues,
  type InvoiceFormValues,
} from './components/invoiceFormShared'
import './components/invoiceFormShared.css'
import type {
  Contract,
  InvoiceStatus,
  PaymentListItem,
  PaymentStatus,
} from './types'
import './PaymentsPage.css'

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

export function PaymentsPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [form] = Form.useForm<InvoiceFormValues>()

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

  const selectedContractId = Form.useWatch('contract_id', form)

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

  const { electricUsage, waterUsage } = useInvoiceDerivedValues(form)

  const openCreate = useCallback(() => {
    setDrawerMode('create')
    setEditingId(null)
    form.resetFields()
    form.setFieldsValue(invoiceFormDefaultValues)
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
        <Form form={form} layout="vertical" initialValues={invoiceFormDefaultValues}>
          <InvoiceFormFields
            form={form}
            rooms={rooms}
            contracts={contracts}
            tenantName={selectedTenant?.full_name}
            invoiceStatusOptions={invoiceStatusOptions.map((item) => ({ label: item.label, value: item.value }))}
            currencyFormatter={(value) => currency.format(value)}
          />
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
