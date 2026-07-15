import {
  BankOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
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
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createInvoice,
  addInvoiceAdjustment,
  deleteInvoice,
  getInvoice,
  getInvoicePrefill,
  getInvoicesSummary,
  generateInvoices,
  issueInvoice,
  listBuildings,
  listContracts,
  listInvoices,
  listRooms,
  listTenants,
  markInvoiceOverdue,
  updateInvoice,
  voidInvoice,
} from '../../services/invoicesService'
import { getUserErrorMessage } from '../../services/errorMessage'
import { getUtilityReading } from '../../services/utilitiesService'
import {
  cancelPaymentRequest,
  createPaymentRequest,
  expirePaymentRequest,
  getPaymentRequestByInvoice,
  type PaymentProof,
  type PaymentRequest,
  type PaymentRequestStatus,
} from '../../services/paymentsService'
import {
  getInvoiceFormDefaultValues,
  invoiceFormDefaultValues,
  type InvoiceFormValues,
} from './components/invoiceFormState'
import { InvoiceFormFields } from './components/invoiceFormShared'
import './components/invoiceFormShared.css'
import type {
  Contract,
  InvoiceDetail,
  InvoiceGenerateScope,
  InvoiceListItem,
  InvoiceStatus,
  PaymentStatus,
} from './types'
import './InvoicesPage.css'

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

const paymentRequestStatusColor: Record<PaymentRequestStatus, string> = {
  DRAFT: 'default',
  WAITING_TRANSFER: 'blue',
  TRANSFER_SUBMITTED: 'gold',
  VERIFIED: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
  EXPIRED: 'orange',
}

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

interface PaymentRequestFormValues {
  amount: number
  bank_code?: string
  bank_account_no?: string
  bank_account_name?: string
  transfer_note?: string
  qr_image_url?: string
  expires_at?: string
}

interface AdjustmentFormValues { amount: number; reason: string }

export function InvoicesPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [form] = Form.useForm<InvoiceFormValues>()
  const [generateForm] = Form.useForm<{ scope: InvoiceGenerateScope; month: string; building_id?: string; room_id?: string }>()
  const [paymentRequestForm] = Form.useForm<PaymentRequestFormValues>()
  const [adjustmentForm] = Form.useForm<AdjustmentFormValues>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<InvoiceListItem[]>([])
  const [summary, setSummary] = useState({ totalInvoices: 0, paidInvoices: 0, unpaidInvoices: 0, totalRevenue: 0 })

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
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
  const [utilitySourceId, setUtilitySourceId] = useState<string | null>(null)
  const [utilityPrefillLoading, setUtilityPrefillLoading] = useState(false)
  const utilityPrefillRequest = useRef(0)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<InvoiceDetail | null>(null)
  const [detailPaymentRequest, setDetailPaymentRequest] = useState<PaymentRequest | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generateLoading, setGenerateLoading] = useState(false)
  const [generateResult, setGenerateResult] = useState<{ generated: number; skipped: number; total: number } | null>(null)
  const [statusActionLoading, setStatusActionLoading] = useState<string | null>(null)
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [paymentRequestOpen, setPaymentRequestOpen] = useState(false)
  const [paymentRequestLoading, setPaymentRequestLoading] = useState(false)
  const [paymentActionLoading, setPaymentActionLoading] = useState<string | null>(null)
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  const [adjustmentLoading, setAdjustmentLoading] = useState(false)

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
        listInvoices({
          search,
          month: monthFilter,
          invoice_status: invoiceStatusFilter,
          payment_status: paymentStatusFilter,
          building_id: buildingFilter,
          room_id: roomFilter,
          tenant_id: tenantFilter,
        }),
        getInvoicesSummary(monthFilter),
      ])

      setItems(paymentRows)
      setSummary(summaryRows)
    } catch (error) {
      setError(getUserErrorMessage(error, 'Khong tai duoc danh sach hoa don.'))
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

  const selectedTenantName = useMemo(() => {
    if (!selectedContractId) {
      return null
    }

    const contract = contracts.find((item) => item.id === selectedContractId)
    if (contract?.tenant_name) {
      return contract.tenant_name
    }

    if (contract?.tenant_id) {
      return tenants.find((tenant) => tenant.id === contract.tenant_id)?.full_name ?? null
    }

    const row = items.find((item) => item.contract_id === selectedContractId)
    return row?.tenant_name ?? null
  }, [selectedContractId, contracts, items, tenants])

  const openCreate = useCallback(() => {
    utilityPrefillRequest.current += 1
    setDrawerMode('create')
    setEditingId(null)
    setUtilitySourceId(null)
    setUtilityPrefillLoading(false)
    form.resetFields()
    form.setFieldsValue(getInvoiceFormDefaultValues())
    setDrawerOpen(true)
  }, [form])

  const openEdit = useCallback(async (id: string) => {
    utilityPrefillRequest.current += 1
    const row = await getInvoice(id)
    setDrawerMode('edit')
    setEditingId(id)
    setUtilitySourceId(null)
    setUtilityPrefillLoading(false)
    form.resetFields()
    form.setFieldsValue({
      building_id: row.building_id,
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

  const openCreateFromUtilityReading = useCallback(async (utilityReadingId: string) => {
    const requestId = utilityPrefillRequest.current + 1
    utilityPrefillRequest.current = requestId
    setDrawerMode('create')
    setEditingId(null)
    setUtilitySourceId(utilityReadingId)
    setUtilityPrefillLoading(true)
    form.resetFields()
    form.setFieldsValue(getInvoiceFormDefaultValues())
    setDrawerOpen(true)

    try {
      const reading = await getUtilityReading(utilityReadingId)
      if (utilityPrefillRequest.current !== requestId) return
      if (reading.status !== 'APPROVED') {
        throw new Error('Only an approved utility reading can be used to create an invoice.')
      }
      if (
        reading.electricity_prev === null ||
        reading.electricity_curr === null ||
        reading.water_prev === null ||
        reading.water_curr === null
      ) {
        throw new Error('The approved utility reading is incomplete. Please review it before creating an invoice.')
      }

      const prefill = await getInvoicePrefill(reading.room_id, reading.month)
      if (utilityPrefillRequest.current !== requestId) return
      if (!prefill.contract_id) {
        throw new Error('No active contract was found for this room and billing month.')
      }

      form.setFieldsValue({
        ...getInvoiceFormDefaultValues(),
        building_id: prefill.building_id,
        contract_id: prefill.contract_id,
        room_id: reading.room_id,
        month: dayjs(reading.month).startOf('month').format('YYYY-MM-DD'),
        status: 'DRAFT',
        issued_at: prefill.issued_at,
        due_date: prefill.due_date ?? undefined,
        rent_amount: prefill.rent_amount,
        electricity_prev: reading.electricity_prev,
        electricity_curr: reading.electricity_curr,
        water_prev: reading.water_prev,
        water_curr: reading.water_curr,
        electric_unit_price: prefill.electric_unit_price,
        water_unit_price: prefill.water_unit_price,
        other_fees: prefill.other_fees,
      })
    } catch (error) {
      if (utilityPrefillRequest.current !== requestId) return
      message.error(getUserErrorMessage(error, 'Unable to prepare the invoice from this utility reading.'))
      setDrawerOpen(false)
      setUtilitySourceId(null)
    } finally {
      if (utilityPrefillRequest.current === requestId) {
        setUtilityPrefillLoading(false)
      }
    }
  }, [form])

  const openDetail = useCallback(async (id: string, syncUrl = true) => {
    if (syncUrl) {
      window.history.pushState(null, '', `/invoices?invoiceId=${encodeURIComponent(id)}`)
    }
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const [row, paymentRequest] = await Promise.all([
        getInvoice(id),
        getPaymentRequestByInvoice(id),
      ])
      setDetailItem(row)
      setDetailPaymentRequest(paymentRequest)
    } catch {
      message.error('Khong tai duoc chi tiet hoa don. Vui long thu lai.')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const utilityReadingId = params.get('utilityReadingId')
    if (utilityReadingId) {
      params.delete('utilityReadingId')
      const queryString = params.toString()
      window.history.replaceState(null, '', `/invoices${queryString ? `?${queryString}` : ''}`)
      void openCreateFromUtilityReading(utilityReadingId)
      return
    }

    const invoiceId = params.get('invoiceId')
    if (invoiceId) {
      void openDetail(invoiceId, false)
    }
  }, [openCreateFromUtilityReading, openDetail])

  const closeInvoiceDrawer = useCallback(() => {
    utilityPrefillRequest.current += 1
    setDrawerOpen(false)
    setUtilitySourceId(null)
    setUtilityPrefillLoading(false)
  }, [])

  const closeDetail = useCallback(() => {
    setDetailOpen(false)
    setDetailPaymentRequest(null)
    const params = new URLSearchParams(window.location.search)
    if (params.has('invoiceId')) {
      params.delete('invoiceId')
      const queryString = params.toString()
      window.history.pushState(null, '', `/invoices${queryString ? `?${queryString}` : ''}`)
    }
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
        await createInvoice(payload)
        message.success('Invoice created successfully.')
      } else if (editingId) {
        await updateInvoice(editingId, payload)
        message.success('Invoice updated successfully.')
      }

      closeInvoiceDrawer()
      void loadData()
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the luu hoa don. Vui long kiem tra du lieu.'))
    } finally {
      setSaveLoading(false)
    }
  }, [closeInvoiceDrawer, drawerMode, editingId, form, loadData])

  const confirmDelete = useCallback(async () => {
    if (!deletingInvoiceId) return

    setDeleteLoading(true)
    try {
      await deleteInvoice(deletingInvoiceId)
      setDeletingInvoiceId(null)
      message.success('Invoice deleted.')
      await loadData()
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Unable to delete the invoice.'))
    } finally {
      setDeleteLoading(false)
    }
  }, [deletingInvoiceId, loadData])

  const openGenerate = useCallback(() => {
    setGenerateResult(null)
    generateForm.resetFields()
    generateForm.setFieldsValue({ scope: 'all', month: dayjs().format('YYYY-MM') })
    setGenerateOpen(true)
  }, [generateForm])

  const selectedGenerateScope = Form.useWatch('scope', generateForm)
  const selectedGenerateBuilding = Form.useWatch('building_id', generateForm)
  const generateRoomOptions = useMemo(() => {
    if (!selectedGenerateBuilding) return rooms
    return rooms.filter((room) => room.building_id === selectedGenerateBuilding)
  }, [rooms, selectedGenerateBuilding])

  const onGenerate = useCallback(async () => {
    setGenerateLoading(true)
    try {
      const values = await generateForm.validateFields()
      const result = await generateInvoices(values)
      setGenerateResult({ generated: result.generated.length, skipped: result.skipped.length, total: result.total })
      message.success(`Generated ${result.generated.length} invoice(s).`)
      await loadData()
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the tao hoa don.'))
    } finally {
      setGenerateLoading(false)
    }
  }, [generateForm, loadData])

  const runStatusAction = useCallback(async (action: 'issue' | 'void' | 'overdue') => {
    if (!detailItem) return
    setStatusActionLoading(action)
    try {
      const updated =
        action === 'issue'
          ? await issueInvoice(detailItem.id)
          : action === 'void'
            ? await voidInvoice(detailItem.id)
            : await markInvoiceOverdue(detailItem.id)
      setDetailItem(updated)
      await loadData()
      message.success('Invoice status updated.')
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the cap nhat trang thai hoa don.'))
    } finally {
      setStatusActionLoading(null)
    }
  }, [detailItem, loadData])

  const submitAdjustment = useCallback(async () => {
    if (!detailItem) return
    setAdjustmentLoading(true)
    try {
      const values = await adjustmentForm.validateFields()
      const updated = await addInvoiceAdjustment(detailItem.id, values.amount, values.reason)
      setDetailItem(updated)
      setAdjustmentOpen(false)
      adjustmentForm.resetFields()
      await loadData()
      message.success('Adjustment added to the draft invoice.')
    } catch (error) {
      const formError = error as { errorFields?: unknown[] }
      if (!formError.errorFields) message.error(getUserErrorMessage(error, 'Unable to add the adjustment.'))
    } finally { setAdjustmentLoading(false) }
  }, [adjustmentForm, detailItem, loadData])

  const paymentRemainingAmount = useMemo(() => {
    if (!detailItem) return 0
    return Math.max(0, detailItem.total - detailItem.paid_amount)
  }, [detailItem])

  const paymentRequestIsClosed = !detailPaymentRequest || ['CANCELLED', 'EXPIRED'].includes(detailPaymentRequest.status)

  const openPaymentRequestModal = useCallback(() => {
    if (!detailItem) return
    paymentRequestForm.resetFields()
    paymentRequestForm.setFieldsValue({
      amount: paymentRemainingAmount,
      transfer_note: `INV-${detailItem.id.slice(0, 8)}`,
      expires_at: dayjs().add(7, 'day').format('YYYY-MM-DDTHH:mm'),
    })
    setPaymentRequestOpen(true)
  }, [detailItem, paymentRemainingAmount, paymentRequestForm])

  const refreshDetailPaymentRequest = useCallback(async () => {
    if (!detailItem) return
    const [invoice, paymentRequest] = await Promise.all([
      getInvoice(detailItem.id),
      getPaymentRequestByInvoice(detailItem.id),
    ])
    setDetailItem(invoice)
    setDetailPaymentRequest(paymentRequest)
    await loadData()
  }, [detailItem, loadData])

  const onCreatePaymentRequest = useCallback(async () => {
    if (!detailItem) return
    const values = await paymentRequestForm.validateFields()
    setPaymentRequestLoading(true)
    try {
      const request = await createPaymentRequest({
        invoice_id: detailItem.id,
        amount: values.amount,
        currency: 'VND',
        bank_code: values.bank_code?.trim() || null,
        bank_account_no: values.bank_account_no?.trim() || null,
        bank_account_name: values.bank_account_name?.trim() || null,
        transfer_note: values.transfer_note?.trim() || null,
        qr_image_url: values.qr_image_url?.trim() || null,
        expires_at: values.expires_at ? dayjs(values.expires_at).toISOString() : null,
      })
      setDetailPaymentRequest(request)
      setPaymentRequestOpen(false)
      message.success('Payment request created.')
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the tao yeu cau thanh toan.'))
    } finally {
      setPaymentRequestLoading(false)
    }
  }, [detailItem, paymentRequestForm])

  const runPaymentRequestAction = useCallback(async (action: 'cancel' | 'expire') => {
    if (!detailPaymentRequest) return
    setPaymentActionLoading(action)
    try {
      if (action === 'cancel') {
        await cancelPaymentRequest(detailPaymentRequest.id)
      } else {
        await expirePaymentRequest(detailPaymentRequest.id)
      }
      await refreshDetailPaymentRequest()
      message.success('Payment request updated.')
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the cap nhat yeu cau thanh toan.'))
    } finally {
      setPaymentActionLoading(null)
    }
  }, [detailPaymentRequest, refreshDetailPaymentRequest])

  const columns: ColumnsType<InvoiceListItem> = [
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
          <Tooltip title="Delete invoice">
            <Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete invoice" onClick={() => setDeletingInvoiceId(row.id)} />
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} className="invoices-page">
      <div className="invoices-toolbar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>Invoices</Typography.Title>
          <Typography.Text type="secondary">Manage monthly invoices from contracts, utility readings, and payment status.</Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<ThunderboltOutlined />} onClick={openGenerate}>Generate Monthly</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Create Manual Invoice</Button>
        </Space>
      </div>

      <Card>
        <div className="invoices-filters">
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

      <div className="invoices-summary-grid">
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
        title={drawerMode === 'create' ? (utilitySourceId ? 'Create invoice from utility reading' : 'Add invoice') : 'Edit invoice'}
        placement="right"
        open={drawerOpen}
        width={isMobile ? '100%' : 500}
        onClose={closeInvoiceDrawer}
        destroyOnClose
      >
        <Spin spinning={utilityPrefillLoading} tip="Loading approved utility reading...">
          <Form form={form} layout="vertical" initialValues={invoiceFormDefaultValues}>
            <InvoiceFormFields
              form={form}
              buildings={buildings}
              rooms={rooms}
              contracts={contracts}
              tenantName={selectedTenantName ?? undefined}
              invoiceStatusOptions={invoiceStatusOptions.map((item) => ({ label: item.label, value: item.value }))}
              currencyFormatter={(value) => currency.format(value)}
              sourceLocked={Boolean(utilitySourceId)}
              autoFillFromLatest={drawerMode === 'create' && !utilitySourceId}
            />
            <Space className="invoice-drawer-actions">
              <Button onClick={closeInvoiceDrawer}>Cancel</Button>
              <Button type="primary" loading={saveLoading} disabled={utilityPrefillLoading} onClick={() => void onSave()}>Save</Button>
            </Space>
          </Form>
        </Spin>
      </Drawer>

      <Drawer title="Invoice detail" placement="right" open={detailOpen} width={isMobile ? '100%' : 720} onClose={closeDetail}>
        {detailLoading || !detailItem ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space direction="vertical" size={2}>
                <Typography.Text strong>{detailItem.building_name} / Room {detailItem.room_code}</Typography.Text>
                <Typography.Text type="secondary">{dayjs(detailItem.month).format('MM/YYYY')}</Typography.Text>
              </Space>
              <Space wrap>
                {detailItem.status === 'DRAFT' ? <Button type="primary" loading={statusActionLoading === 'issue'} onClick={() => void runStatusAction('issue')}>Issue and create QR</Button> : null}
                {detailItem.status === 'DRAFT' ? <Button icon={<PlusOutlined />} onClick={() => setAdjustmentOpen(true)}>Adjustment</Button> : null}
                <Button loading={statusActionLoading === 'overdue'} disabled={detailItem.status !== 'ISSUED'} onClick={() => void runStatusAction('overdue')}>Mark overdue</Button>
                <Button danger loading={statusActionLoading === 'void'} disabled={detailItem.status === 'PAID' || detailItem.status === 'VOID'} onClick={() => void runStatusAction('void')}>Void</Button>
              </Space>
            </Space>
            <Descriptions column={isMobile ? 1 : 2} size="small" bordered>
              <Descriptions.Item label="Tenant">{detailItem.tenant_name}</Descriptions.Item>
              <Descriptions.Item label="Invoice status"><Tag color={invoiceStatusOptions.find((item) => item.value === detailItem.status)?.color}>{detailItem.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Payment status">{detailItem.payment_status ?? 'NO_PAYMENT'}</Descriptions.Item>
              <Descriptions.Item label="Due date">{detailItem.due_date ? dayjs(detailItem.due_date).format('DD/MM/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">{currency.format(detailItem.subtotal)}</Descriptions.Item>
              <Descriptions.Item label="Discount">{currency.format(detailItem.discount)}</Descriptions.Item>
              <Descriptions.Item label="Paid">{currency.format(detailItem.paid_amount)}</Descriptions.Item>
              <Descriptions.Item label="Total">{currency.format(detailItem.total)}</Descriptions.Item>
              <Descriptions.Item label="Note" span={isMobile ? 1 : 2}>{detailItem.note ?? '-'}</Descriptions.Item>
            </Descriptions>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detailItem.items}
              columns={[
                { title: 'Item', dataIndex: 'name' },
                { title: 'Qty', dataIndex: 'quantity', align: 'right' },
                { title: 'Unit price', dataIndex: 'unit_price', align: 'right', render: (value: number) => currency.format(value) },
                { title: 'Amount', dataIndex: 'amount', align: 'right', render: (value: number) => currency.format(value) },
                { title: 'Source', render: (_, item) => String(item.meta?.source ?? '-') },
              ]}
            />
            {detailItem.adjustments.length > 0 ? (
              <Card size="small" title="Adjustments">
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={detailItem.adjustments}
                  columns={[
                    { title: 'Type', dataIndex: 'adjustment_type' },
                    { title: 'Amount', dataIndex: 'amount', align: 'right', render: (value: number) => currency.format(value) },
                    { title: 'Reason', dataIndex: 'reason' },
                  ]}
                />
              </Card>
            ) : null}
            <Card
              size="small"
              title="Bank transfer payment"
              extra={
                paymentRequestIsClosed && ['ISSUED', 'OVERDUE'].includes(detailItem.status) ? (
                  <Button size="small" type="primary" icon={<BankOutlined />} onClick={openPaymentRequestModal}>
                    Create payment request
                  </Button>
                ) : null
              }
            >
              {!detailPaymentRequest ? (
                <Alert showIcon type="info" message="No payment request has been sent for this invoice." />
              ) : (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Descriptions column={isMobile ? 1 : 2} size="small" bordered>
                    <Descriptions.Item label="Request status">
                      <Tag color={paymentRequestStatusColor[detailPaymentRequest.status]}>{detailPaymentRequest.status}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Request amount">{currency.format(detailPaymentRequest.amount)}</Descriptions.Item>
                    <Descriptions.Item label="Paid amount">{currency.format(detailPaymentRequest.paid_amount ?? 0)}</Descriptions.Item>
                    <Descriptions.Item label="Remaining">{currency.format(detailPaymentRequest.remaining_amount ?? paymentRemainingAmount)}</Descriptions.Item>
                    <Descriptions.Item label="Bank">{detailPaymentRequest.bank_code ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label="Account no.">{detailPaymentRequest.bank_account_no ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label="Account name">{detailPaymentRequest.bank_account_name ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label="Transfer note">{detailPaymentRequest.transfer_note ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label="Expires at">{detailPaymentRequest.expires_at ? dayjs(detailPaymentRequest.expires_at).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
                    <Descriptions.Item label="Sent at">{detailPaymentRequest.sent_at ? dayjs(detailPaymentRequest.sent_at).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
                  </Descriptions>
                  {!['VERIFIED', 'CANCELLED', 'EXPIRED'].includes(detailPaymentRequest.status) ? (
                    <Space>
                      <Button danger loading={paymentActionLoading === 'cancel'} onClick={() => void runPaymentRequestAction('cancel')}>Cancel request</Button>
                      <Button loading={paymentActionLoading === 'expire'} onClick={() => void runPaymentRequestAction('expire')}>Expire request</Button>
                    </Space>
                  ) : null}
                  <Divider style={{ margin: '4px 0' }} />
                  <Typography.Text strong>Payment history</Typography.Text>
                  <Table<PaymentProof>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={detailPaymentRequest.proofs ?? []}
                    locale={{ emptyText: <Empty description="No proof submitted" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                    columns={[
                      { title: 'Submitted', dataIndex: 'submitted_at', render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm') },
                      { title: 'Amount', dataIndex: 'transfer_amount', align: 'right', render: (value: number) => currency.format(value) },
                      { title: 'Status', dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> },
                      {
                        title: 'Proof',
                        dataIndex: 'file_url',
                        render: (value: string, row) => (
                          <a href={value} target="_blank" rel="noreferrer">{row.file_name || 'Open file'}</a>
                        ),
                      },
                      { title: 'Reason', dataIndex: 'rejection_reason', render: (value: string | null) => value ?? '-' },
                    ]}
                  />
                </Space>
              )}
            </Card>
          </Space>
        )}
      </Drawer>

      <Modal
        open={Boolean(deletingInvoiceId)}
        title="Delete this invoice?"
        okText="Delete"
        okButtonProps={{ danger: true }}
        cancelButtonProps={{ disabled: deleteLoading }}
        confirmLoading={deleteLoading}
        closable={!deleteLoading}
        maskClosable={!deleteLoading}
        onOk={() => void confirmDelete()}
        onCancel={() => setDeletingInvoiceId(null)}
      >
        <Typography.Text>
          This permanently removes the invoice, its line items, and all related payment records. This action cannot be undone.
        </Typography.Text>
      </Modal>

      <Modal
        open={adjustmentOpen}
        title="Add draft adjustment"
        okText="Add adjustment"
        confirmLoading={adjustmentLoading}
        onOk={() => void submitAdjustment()}
        onCancel={() => setAdjustmentOpen(false)}
        destroyOnClose
      >
        <Form form={adjustmentForm} layout="vertical">
          <Form.Item name="amount" label="Amount" extra="Use a negative amount for a discount." rules={[{ required: true, type: 'number', message: 'Please enter a non-zero amount.' }]}>
            <InputNumber style={{ width: '100%' }} precision={0} />
          </Form.Item>
          <Form.Item name="reason" label="Reason" rules={[{ required: true, whitespace: true, message: 'Please enter a reason.' }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        open={paymentRequestOpen}
        title="Create payment request"
        okText="Create request"
        confirmLoading={paymentRequestLoading}
        onOk={() => void onCreatePaymentRequest()}
        onCancel={() => setPaymentRequestOpen(false)}
        destroyOnClose
      >
        <Form form={paymentRequestForm} layout="vertical">
          <Form.Item name="amount" label="Amount" rules={[{ required: true, type: 'number', min: 1, message: 'Please enter amount' }]}>
            <InputNumber min={1} max={paymentRemainingAmount || undefined} precision={0} style={{ width: '100%' }} formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(value) => Number(value?.replace(/\D/g, '') || 0)} />
          </Form.Item>
          <Form.Item name="bank_code" label="Bank code">
            <Input placeholder="VCB, ACB, TCB..." />
          </Form.Item>
          <Form.Item name="bank_account_no" label="Bank account number">
            <Input />
          </Form.Item>
          <Form.Item name="bank_account_name" label="Bank account name">
            <Input />
          </Form.Item>
          <Form.Item name="transfer_note" label="Transfer note">
            <Input />
          </Form.Item>
          <Form.Item name="qr_image_url" label="QR image URL">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="expires_at" label="Expires at">
            <Input type="datetime-local" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={generateOpen}
        title="Generate monthly invoices"
        okText="Generate"
        confirmLoading={generateLoading}
        onOk={() => void onGenerate()}
        onCancel={() => setGenerateOpen(false)}
        destroyOnClose
      >
        <Form form={generateForm} layout="vertical" initialValues={{ scope: 'all', month: dayjs().format('YYYY-MM') }}>
          <Form.Item name="scope" label="Scope" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'All active contracts', value: 'all' },
                { label: 'Building', value: 'building' },
                { label: 'Room', value: 'room' },
              ]}
            />
          </Form.Item>
          <Form.Item name="month" label="Month" rules={[{ required: true, message: 'Please select month' }]}>
            <Input type="month" />
          </Form.Item>
          {selectedGenerateScope === 'building' || selectedGenerateScope === 'room' ? (
            <Form.Item name="building_id" label="Building" rules={[{ required: true, message: 'Please select building' }]}>
              <Select
                options={buildings.map((item) => ({ label: item.name, value: item.id }))}
                onChange={() => generateForm.setFieldValue('room_id', undefined)}
              />
            </Form.Item>
          ) : null}
          {selectedGenerateScope === 'room' ? (
            <Form.Item name="room_id" label="Room" rules={[{ required: true, message: 'Please select room' }]}>
              <Select options={generateRoomOptions.map((item) => ({ label: item.code, value: item.id }))} />
            </Form.Item>
          ) : null}
          <Alert
            showIcon
            type="info"
            message="Generation requires an approved utility reading and an effective utility rate for each contract/month."
          />
          {generateResult ? (
            <Alert
              showIcon
              type={generateResult.skipped > 0 ? 'warning' : 'success'}
              style={{ marginTop: 12 }}
              message={`Generated ${generateResult.generated}/${generateResult.total}; skipped ${generateResult.skipped}.`}
            />
          ) : null}
        </Form>
      </Modal>
    </Space>
  )
}
