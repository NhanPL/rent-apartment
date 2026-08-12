import { useI18n } from '../../i18n'
import {
  BankOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  SendOutlined,
  StopOutlined,
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
  Skeleton,
  Space,
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
  createReplacementInvoice,
  addInvoiceAdjustment,
  deleteInvoice,
  getInvoice,
  getInvoicePrefill,
  issueInvoice,
  bulkIssueInvoices,
  updateInvoice,
  voidInvoice,
} from '../../services/invoicesService'
import { applyApiFieldErrors, getFormErrorMessage, getUserErrorMessage } from '../../services/errorMessage'
import { vndCurrency } from '../../i18n'
import { getUtilityReading } from '../../services/utilitiesService'
import {
  approvePaymentProof,
  cancelPaymentRequest,
  createPaymentRequest,
  expirePaymentRequest,
  getPaymentRequestByInvoice,
  type PaymentProof,
  type PaymentRequest,
  type PaymentRequestStatus,
} from '../../services/paymentsService'
import { getInvoiceFormDefaultValues, type InvoiceFormValues } from './components/invoiceFormState'
import './components/invoiceFormShared.css'
import { InvoiceDetailHeader } from './components/InvoiceDetailHeader'
import { InvoiceFilters } from './components/InvoiceFilters'
import { InvoiceFormDrawer } from './components/InvoiceFormDrawer'
import { InvoiceList } from './components/InvoiceList'
import { VietQrDisplay } from './components/VietQrDisplay'
import { useInvoicesData } from './hooks/useInvoicesData'
import type {
  InvoiceDetail,
  InvoiceListItem,
  InvoiceStatus,
  PaymentStatus,
} from './types'
import './InvoicesPage.css'

const invoiceStatusOptions: { label: string; value: InvoiceStatus; color: string }[] = [
  { label: 'Draft', value: 'DRAFT', color: 'default' },
  { label: 'Issued', value: 'ISSUED', color: 'blue' },
  { label: 'Partially paid', value: 'PARTIALLY_PAID', color: 'gold' },
  { label: 'Paid', value: 'PAID', color: 'green' },
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

const currency = vndCurrency

const invoiceQuery = () => new URLSearchParams(window.location.search)
const initialInvoiceStatus = () => {
  const value = invoiceQuery().get('invoiceStatus') as InvoiceStatus | null
  return invoiceStatusOptions.some((option) => option.value === value) ? value ?? undefined : undefined
}
const initialPaymentStatus = () => {
  const value = invoiceQuery().get('paymentStatus') as PaymentStatus | null
  return paymentStatusOptions.some((option) => option.value === value) ? value ?? undefined : undefined
}

interface PaymentRequestFormValues {
  amount: number
  bank_code?: string
  bank_account_no?: string
  bank_account_name?: string
  transfer_note?: string
  expires_at?: string
}

interface VoidInvoiceFormValues {
  reason: string
}

interface AdjustmentFormValues { amount: number; reason: string }

interface IssueInvoiceFormValues {
  bank_code: string
  bank_account_no: string
  bank_account_name: string
  transfer_note: string
}

type BulkIssueInvoiceFormValues = Omit<IssueInvoiceFormValues, 'transfer_note'>

function VietQrBankFields({ includeTransferNote = true }: { includeTransferNote?: boolean }) {
  const { t } = useI18n()
  return (
    <>
      <Form.Item
        name="bank_code"
        label={t("Bank code or BIN")}
        rules={[
          { required: true, whitespace: true, message: t("Please enter the receiving bank code.") },
          { pattern: /^[A-Za-z0-9]{2,20}$/, message: t("Use a VietQR bank code or bank BIN.") },
        ]}
      >
        <Input placeholder={t("970436 or VCB")} maxLength={20} />
      </Form.Item>
      <Form.Item
        name="bank_account_no"
        label={t("Bank account number")}
        rules={[
          { required: true, whitespace: true, message: t("Please enter the bank account number.") },
          { pattern: /^\d{6,19}$/, message: t("The account number must contain 6 to 19 digits.") },
        ]}
      >
        <Input inputMode="numeric" maxLength={19} />
      </Form.Item>
      <Form.Item
        name="bank_account_name"
        label={t("Bank account name")}
        rules={[{ required: true, whitespace: true, message: t("Please enter the bank account name.") }]}
      >
        <Input maxLength={100} />
      </Form.Item>
      {includeTransferNote ? <Form.Item
        name="transfer_note"
        label={t("Transfer note")}
        rules={[
          { required: true, whitespace: true, message: t("Please enter the transfer note.") },
          { max: 25, message: t("The transfer note must not exceed 25 characters.") },
        ]}
      >
        <Input maxLength={25} showCount />
      </Form.Item> : null}
    </>
  )
}

export function InvoicesPage() {
  const { t } = useI18n()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [form] = Form.useForm<InvoiceFormValues>()
  const [paymentRequestForm] = Form.useForm<PaymentRequestFormValues>()
  const [adjustmentForm] = Form.useForm<AdjustmentFormValues>()
  const [issueForm] = Form.useForm<IssueInvoiceFormValues>()
  const [bulkIssueForm] = Form.useForm<BulkIssueInvoiceFormValues>()
  const [voidForm] = Form.useForm<VoidInvoiceFormValues>()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [searchInput, setSearchInput] = useState(() => invoiceQuery().get('search') ?? '')
  const [search, setSearch] = useState(() => invoiceQuery().get('search') ?? '')
  const [monthFilter, setMonthFilter] = useState(() => invoiceQuery().get('month') ?? '')
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<InvoiceStatus | undefined>(initialInvoiceStatus)
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatus | undefined>(initialPaymentStatus)
  const [buildingFilter, setBuildingFilter] = useState<string | undefined>(() => invoiceQuery().get('buildingId') ?? undefined)
  const [roomFilter, setRoomFilter] = useState<string | undefined>(() => invoiceQuery().get('roomId') ?? undefined)
  const [tenantFilter, setTenantFilter] = useState<string | undefined>(() => invoiceQuery().get('tenantId') ?? undefined)

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
  const [voidingInvoiceId, setVoidingInvoiceId] = useState<string | null>(null)
  const [voidLoading, setVoidLoading] = useState(false)
  const [replacementLoading, setReplacementLoading] = useState(false)
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [paymentRequestOpen, setPaymentRequestOpen] = useState(false)
  const [paymentRequestLoading, setPaymentRequestLoading] = useState(false)
  const [paymentActionLoading, setPaymentActionLoading] = useState<string | null>(null)
  const [confirmingPaymentProof, setConfirmingPaymentProof] = useState<PaymentProof | null>(null)
  const [paymentConfirmationLoading, setPaymentConfirmationLoading] = useState(false)
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  const [adjustmentLoading, setAdjustmentLoading] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueLoading, setIssueLoading] = useState(false)
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([])
  const [bulkIssueOpen, setBulkIssueOpen] = useState(false)
  const [bulkIssueLoading, setBulkIssueLoading] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    const params = invoiceQuery()
    const values: Record<string, string | undefined> = {
      search: search || undefined,
      month: monthFilter || undefined,
      invoiceStatus: invoiceStatusFilter,
      paymentStatus: paymentStatusFilter,
      buildingId: buildingFilter,
      roomId: roomFilter,
      tenantId: tenantFilter,
    }
    Object.entries(values).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key))
    const query = params.toString()
    window.history.replaceState(null, '', `/invoices${query ? `?${query}` : ''}`)
  }, [search, monthFilter, invoiceStatusFilter, paymentStatusFilter, buildingFilter, roomFilter, tenantFilter])

  const dataFilters = useMemo(() => ({
    search,
    month: monthFilter,
    invoiceStatus: invoiceStatusFilter,
    paymentStatus: paymentStatusFilter,
    buildingId: buildingFilter,
    roomId: roomFilter,
    tenantId: tenantFilter,
  }), [search, monthFilter, invoiceStatusFilter, paymentStatusFilter, buildingFilter, roomFilter, tenantFilter])
  const { loading, error, items, total, summary, references, reload: loadData } = useInvoicesData(dataFilters, page, pageSize)
  const { buildings, rooms, tenants, contracts } = references

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
    try {
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
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Unable to load the invoice for editing.'))
    }
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
      const params = invoiceQuery()
      params.set('invoiceId', id)
      window.history.pushState(null, '', `/invoices?${params.toString()}`)
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
    setConfirmingPaymentProof(null)
    const params = new URLSearchParams(window.location.search)
    if (params.has('invoiceId')) {
      params.delete('invoiceId')
      const queryString = params.toString()
      window.history.pushState(null, '', `/invoices${queryString ? `?${queryString}` : ''}`)
    }
  }, [])

  const onSave = useCallback(async () => {
    setSaveLoading(true)
    try {
      const values = await form.validateFields()
      if (!values.contract_id || !values.room_id) {
        throw new Error('Please select a contract and room.')
      }
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
      applyApiFieldErrors(form, error)
      message.error(getFormErrorMessage(error, 'Unable to save the invoice. Please review the submitted data.'))
    } finally {
      setSaveLoading(false)
    }
  }, [closeInvoiceDrawer, drawerMode, editingId, form, loadData])

  const confirmDelete = useCallback(async () => {
    if (!deletingInvoiceId) return

    setDeleteLoading(true)
    try {
      await deleteInvoice(deletingInvoiceId)
      if (detailItem?.id === deletingInvoiceId) closeDetail()
      setDeletingInvoiceId(null)
      message.success('Invoice deleted.')
      await loadData()
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Unable to delete the invoice.'))
    } finally {
      setDeleteLoading(false)
    }
  }, [closeDetail, deletingInvoiceId, detailItem?.id, loadData])

  const openVoidModal = useCallback((invoiceId: string) => {
    voidForm.resetFields()
    setVoidingInvoiceId(invoiceId)
  }, [voidForm])

  const confirmVoid = useCallback(async () => {
    if (!voidingInvoiceId) return
    setVoidLoading(true)
    try {
      const values = await voidForm.validateFields()
      const updated = await voidInvoice(voidingInvoiceId, values.reason.trim())
      if (detailItem?.id === voidingInvoiceId) setDetailItem(updated)
      setVoidingInvoiceId(null)
      voidForm.resetFields()
      await loadData()
      message.success('Invoice voided. Financial history has been retained.')
    } catch (error) {
      applyApiFieldErrors(voidForm, error)
      message.error(getFormErrorMessage(error, 'Unable to void the invoice.'))
    } finally {
      setVoidLoading(false)
    }
  }, [detailItem?.id, loadData, voidForm, voidingInvoiceId])

  const createReplacement = useCallback(async () => {
    if (!detailItem) return
    setReplacementLoading(true)
    try {
      const replacement = await createReplacementInvoice(detailItem.id)
      await loadData()
      message.success('Replacement draft created.')
      await openDetail(replacement.id)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Unable to create a replacement invoice.'))
    } finally {
      setReplacementLoading(false)
    }
  }, [detailItem, loadData, openDetail])

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
      applyApiFieldErrors(adjustmentForm, error)
      message.error(getFormErrorMessage(error, 'Unable to add the adjustment.'))
    } finally { setAdjustmentLoading(false) }
  }, [adjustmentForm, detailItem, loadData])

  const paymentRemainingAmount = useMemo(() => {
    if (!detailItem) return 0
    return Math.max(0, detailItem.total - detailItem.paid_amount)
  }, [detailItem])

  const pendingPaymentProof = useMemo(
    () => detailPaymentRequest?.proofs?.find((proof) => proof.status === 'PENDING') ?? null,
    [detailPaymentRequest],
  )

  const openIssueModal = useCallback(() => {
    if (!detailItem) return
    issueForm.resetFields()
    issueForm.setFieldsValue({
      transfer_note: `INV ${detailItem.id.slice(0, 8)}`,
    })
    setIssueOpen(true)
  }, [detailItem, issueForm])

  const onIssueInvoice = useCallback(async () => {
    if (!detailItem) return

    try {
      const values = await issueForm.validateFields()
      setIssueLoading(true)
      const updated = await issueInvoice(detailItem.id, {
        bank_code: values.bank_code.trim(),
        bank_account_no: values.bank_account_no.trim(),
        bank_account_name: values.bank_account_name.trim(),
        transfer_note: values.transfer_note.trim(),
      })
      const paymentRequest = await getPaymentRequestByInvoice(detailItem.id)
      setDetailItem(updated)
      setDetailPaymentRequest(paymentRequest)
      setIssueOpen(false)
      await loadData()
      message.success('Invoice issued and VietQR payment request created.')
    } catch (error) {
      applyApiFieldErrors(issueForm, error)
      message.error(getFormErrorMessage(error, 'Unable to issue the invoice and create its VietQR payment request.'))
    } finally {
      setIssueLoading(false)
    }
  }, [detailItem, issueForm, loadData])

  const onBulkIssueInvoices = useCallback(async () => {
    try {
      const values = await bulkIssueForm.validateFields()
      setBulkIssueLoading(true)
      const result = await bulkIssueInvoices(selectedInvoiceIds, {
        bank_code: values.bank_code.trim(),
        bank_account_no: values.bank_account_no.trim(),
        bank_account_name: values.bank_account_name.trim(),
      })
      setBulkIssueOpen(false)
      bulkIssueForm.resetFields()
      setSelectedInvoiceIds([])
      await loadData()
      if (result.failed.length) {
        Modal.warning({
          title: t('Bulk issue completed with errors'),
          content: `${result.succeeded.length}/${result.total} ${t('invoices issued')}. ${result.failed.slice(0, 3).map((item) => item.message).join(' ')}`,
        })
      } else {
        message.success(`${result.succeeded.length} ${t('invoices issued')}.`)
      }
    } catch (error) {
      applyApiFieldErrors(bulkIssueForm, error)
      message.error(getFormErrorMessage(error, t('Unable to issue selected invoices.')))
    } finally {
      setBulkIssueLoading(false)
    }
  }, [bulkIssueForm, loadData, selectedInvoiceIds, t])

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

  const confirmInvoicePayment = useCallback(async () => {
    if (!confirmingPaymentProof) return

    setPaymentConfirmationLoading(true)
    try {
      const result = await approvePaymentProof(confirmingPaymentProof.id)
      setConfirmingPaymentProof(null)
      await refreshDetailPaymentRequest()
      message.success(
        result.invoice_status === 'PAID'
          ? 'Payment confirmed. The invoice is now complete.'
          : `Payment confirmed. Remaining balance: ${currency.format(result.remaining_amount)}.`,
      )
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Unable to confirm this invoice payment.'))
    } finally {
      setPaymentConfirmationLoading(false)
    }
  }, [confirmingPaymentProof, refreshDetailPaymentRequest])

  const onCreatePaymentRequest = useCallback(async () => {
    if (!detailItem) return
    setPaymentRequestLoading(true)
    try {
      const values = await paymentRequestForm.validateFields()
      const request = await createPaymentRequest({
        invoice_id: detailItem.id,
        amount: values.amount,
        currency: 'VND',
        bank_code: values.bank_code?.trim() || null,
        bank_account_no: values.bank_account_no?.trim() || null,
        bank_account_name: values.bank_account_name?.trim() || null,
        transfer_note: values.transfer_note?.trim() || null,
        expires_at: values.expires_at ? dayjs(values.expires_at).toISOString() : null,
      })
      setDetailPaymentRequest(request)
      setPaymentRequestOpen(false)
      message.success('Payment request created.')
    } catch (error) {
      applyApiFieldErrors(paymentRequestForm, error)
      message.error(getFormErrorMessage(error, 'Unable to create the payment request.'))
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
    { title: t("Month"), dataIndex: 'month', width: 110, render: (value: string) => dayjs(value).format('MM/YYYY') },
    { title: t("Building"), dataIndex: 'building_name', width: 170 },
    { title: t("Room"), dataIndex: 'room_code', width: 100 },
    { title: t("Tenant"), dataIndex: 'tenant_name', width: 170 },
    { title: t("Room rent"), dataIndex: 'rent_amount', width: 130, align: 'right', render: (value: number) => currency.format(value) },
    { title: t("Electric amount"), dataIndex: 'electric_amount', width: 140, align: 'right', render: (value: number) => currency.format(value) },
    { title: t("Water amount"), dataIndex: 'water_amount', width: 130, align: 'right', render: (value: number) => currency.format(value) },
    { title: t("Other fees"), dataIndex: 'other_fees', width: 120, align: 'right', render: (value: number) => currency.format(value) },
    { title: t("Total"), dataIndex: 'total', width: 130, align: 'right', render: (value: number) => <strong>{currency.format(value)}</strong> },
    {
      title: t("Invoice status"),
      dataIndex: 'status',
      width: 130,
      render: (value: InvoiceStatus) => <Tag color={invoiceStatusOptions.find((item) => item.value === value)?.color}>{value}</Tag>,
    },
    {
      title: t("Payment status"),
      dataIndex: 'payment_status',
      width: 130,
      render: (value: PaymentStatus | null) => {
        if (!value) {
          return <Tag>{t("NO_PAYMENT")}</Tag>
        }
        return <Tag color={paymentStatusOptions.find((item) => item.value === value)?.color}>{value}</Tag>
      },
    },
    { title: t("Due date"), dataIndex: 'due_date', width: 120, render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY') : '-') },
    { title: t("Paid date"), dataIndex: 'paid_at', width: 120, render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY') : '-') },
    {
      title: t("Actions"),
      key: 'actions',
      fixed: 'right',
      width: 170,
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} aria-label={t("View invoice")} onClick={() => void openDetail(row.id)} />
          {row.status === 'DRAFT' ? (
            <>
              <Tooltip title={t("Edit draft")}>
                <Button size="small" icon={<EditOutlined />} aria-label={t("Edit draft invoice")} onClick={() => void openEdit(row.id)} />
              </Tooltip>
              <Tooltip title={t("Delete draft permanently")}>
                <Button size="small" danger icon={<DeleteOutlined />} aria-label={t("Delete draft invoice")} onClick={() => setDeletingInvoiceId(row.id)} />
              </Tooltip>
            </>
          ) : ['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(row.status) ? (
            <Tooltip title={t("Void invoice and retain financial history")}>
              <Button size="small" danger icon={<StopOutlined />} aria-label={t("Void invoice")} onClick={() => openVoidModal(row.id)} />
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
  ]

  return (
    <>
    <Space direction="vertical" size={16} className="invoices-page">
      <div className="invoices-toolbar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>{t("Invoices")}</Typography.Title>
          <Typography.Text type="secondary">{t("Manage monthly invoices from contracts, utility readings, and payment status.")}</Typography.Text>
        </div>
        <Space wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t("Create Manual Invoice")}</Button>
        </Space>
      </div>

      <Card>
        <InvoiceFilters
          search={searchInput}
          month={monthFilter}
          invoiceStatus={invoiceStatusFilter}
          paymentStatus={paymentStatusFilter}
          buildingId={buildingFilter}
          roomId={roomFilter}
          tenantId={tenantFilter}
          buildings={buildings}
          rooms={roomFilterOptions}
          tenants={tenants}
          invoiceStatuses={invoiceStatusOptions}
          paymentStatuses={paymentStatusOptions}
          onSearchChange={setSearchInput}
          onMonthChange={(value) => { setMonthFilter(value); setPage(1) }}
          onInvoiceStatusChange={(value) => { setInvoiceStatusFilter(value); setPage(1) }}
          onPaymentStatusChange={(value) => { setPaymentStatusFilter(value); setPage(1) }}
          onBuildingChange={(value) => { setBuildingFilter(value); setRoomFilter(undefined); setPage(1) }}
          onRoomChange={(value) => { setRoomFilter(value); setPage(1) }}
          onTenantChange={(value) => { setTenantFilter(value); setPage(1) }}
          onRefresh={() => void loadData()}
        />
      </Card>

      <div className="invoices-summary-grid">
        <Card><Statistic title={t("Total invoices")} value={summary.totalInvoices} /></Card>
        <Card><Statistic title={t("Paid invoices")} value={summary.paidInvoices} /></Card>
        <Card><Statistic title={t("Unpaid invoices")} value={summary.unpaidInvoices} /></Card>
        <Card><Statistic title={t("Revenue (paid)")} value={summary.totalRevenue} formatter={(value) => currency.format(Number(value))} /></Card>
      </div>

      <Card
        title={t("Monthly invoices")}
        extra={selectedInvoiceIds.length ? (
          <Button type="primary" icon={<SendOutlined />} onClick={() => setBulkIssueOpen(true)}>
            {t('Issue selected')} ({selectedInvoiceIds.length})
          </Button>
        ) : null}
      >
        <InvoiceList
          loading={loading}
          error={error}
          items={items}
          columns={columns}
          page={page}
          pageSize={pageSize}
          total={total}
          selectedIds={selectedInvoiceIds}
          onSelectionChange={setSelectedInvoiceIds}
          onRetry={() => void loadData()}
          onPageChange={(nextPage, nextPageSize) => {
            setPage(nextPageSize === pageSize ? nextPage : 1)
            setPageSize(nextPageSize)
          }}
        />
      </Card>

      <InvoiceFormDrawer
        open={drawerOpen}
        mode={drawerMode}
        width={isMobile ? '100%' : 500}
        form={form}
        loading={utilityPrefillLoading}
        saveLoading={saveLoading}
        utilitySourceId={utilitySourceId}
        buildings={buildings}
        rooms={rooms}
        contracts={contracts}
        tenantName={selectedTenantName ?? undefined}
        currencyFormatter={(value) => currency.format(value)}
        onClose={closeInvoiceDrawer}
        onSave={() => void onSave()}
      />

      <Drawer title={t("Invoice detail")} placement="right" open={detailOpen} width={isMobile ? '100%' : 720} onClose={closeDetail}>
        {detailLoading || !detailItem ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <InvoiceDetailHeader
              invoice={detailItem}
              hasPendingProof={Boolean(pendingPaymentProof)}
              pendingProofCompletesInvoice={Boolean(pendingPaymentProof && pendingPaymentProof.transfer_amount >= paymentRemainingAmount)}
              replacementLoading={replacementLoading}
              onConfirmPayment={() => pendingPaymentProof && setConfirmingPaymentProof(pendingPaymentProof)}
              onIssue={openIssueModal}
              onAdjustment={() => setAdjustmentOpen(true)}
              onDelete={() => setDeletingInvoiceId(detailItem.id)}
              onVoid={() => openVoidModal(detailItem.id)}
              onCreateReplacement={() => void createReplacement()}
            />
            <Descriptions column={isMobile ? 1 : 2} size="small" bordered>
              <Descriptions.Item label={t("Tenant")}>{detailItem.tenant_name}</Descriptions.Item>
              <Descriptions.Item label={t("Invoice status")}><Tag color={invoiceStatusOptions.find((item) => item.value === detailItem.status)?.color}>{detailItem.status}</Tag></Descriptions.Item>
              <Descriptions.Item label={t("Payment status")}>{detailItem.payment_status ?? 'NO_PAYMENT'}</Descriptions.Item>
              <Descriptions.Item label={t("Due date")}>{detailItem.due_date ? dayjs(detailItem.due_date).format('DD/MM/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Subtotal")}>{currency.format(detailItem.subtotal)}</Descriptions.Item>
              <Descriptions.Item label={t("Discount")}>{currency.format(detailItem.discount)}</Descriptions.Item>
              <Descriptions.Item label={t("Paid")}>{currency.format(detailItem.paid_amount)}</Descriptions.Item>
              <Descriptions.Item label={t("Total")}>{currency.format(detailItem.total)}</Descriptions.Item>
              <Descriptions.Item label={t("Note")} span={isMobile ? 1 : 2}>{detailItem.note ?? '-'}</Descriptions.Item>
              {detailItem.status === 'VOID' ? (
                <>
                  <Descriptions.Item label={t("Void reason")} span={isMobile ? 1 : 2}>{detailItem.void_reason}</Descriptions.Item>
                  <Descriptions.Item label={t("Voided at")}>{detailItem.voided_at ? dayjs(detailItem.voided_at).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
                  <Descriptions.Item label={t("Replacement")}>
                    {detailItem.replacement_invoice_id ? <Button type="link" onClick={() => void openDetail(detailItem.replacement_invoice_id!)}>{t("Open replacement")}</Button> : 'Not created'}
                  </Descriptions.Item>
                </>
              ) : null}
              {detailItem.replaces_invoice_id ? (
                <Descriptions.Item label={t("Replaces invoice")} span={isMobile ? 1 : 2}>
                  <Button type="link" onClick={() => void openDetail(detailItem.replaces_invoice_id!)}>{t("Open original void invoice")}</Button>
                </Descriptions.Item>
              ) : null}
            </Descriptions>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detailItem.items}
              columns={[
                { title: t("Item"), dataIndex: 'name' },
                { title: t("Qty"), dataIndex: 'quantity', align: 'right' },
                { title: t("Unit price"), dataIndex: 'unit_price', align: 'right', render: (value: number) => currency.format(value) },
                { title: t("Amount"), dataIndex: 'amount', align: 'right', render: (value: number) => currency.format(value) },
                { title: t("Source"), render: (_, item) => String(item.meta?.source ?? '-') },
              ]}
            />
            {detailItem.adjustments.length > 0 ? (
              <Card size="small" title={t("Adjustments")}>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={detailItem.adjustments}
                  columns={[
                    { title: t("Type"), dataIndex: 'adjustment_type' },
                    { title: t("Amount"), dataIndex: 'amount', align: 'right', render: (value: number) => currency.format(value) },
                    { title: t("Reason"), dataIndex: 'reason' },
                  ]}
                />
              </Card>
            ) : null}
            <Card
              size="small"
              title={t("Bank transfer payment")}
              extra={
                paymentRequestIsClosed && ['ISSUED', 'PARTIALLY_PAID'].includes(detailItem.status) ? (
                  <Button size="small" type="primary" icon={<BankOutlined />} onClick={openPaymentRequestModal}>
                    {t("Create payment request")}
                  </Button>
                ) : null
              }
            >
              {!detailPaymentRequest ? (
                <Alert showIcon type="info" message={t("No payment request has been sent for this invoice.")} />
              ) : (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Descriptions column={isMobile ? 1 : 2} size="small" bordered>
                    <Descriptions.Item label={t("Request status")}>
                      <Tag color={paymentRequestStatusColor[detailPaymentRequest.status]}>{detailPaymentRequest.status}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label={t("Request amount")}>{currency.format(detailPaymentRequest.amount)}</Descriptions.Item>
                    <Descriptions.Item label={t("Paid amount")}>{currency.format(detailPaymentRequest.paid_amount ?? 0)}</Descriptions.Item>
                    <Descriptions.Item label={t("Remaining")}>{currency.format(detailPaymentRequest.remaining_amount ?? paymentRemainingAmount)}</Descriptions.Item>
                    <Descriptions.Item label={t("Bank")}>{detailPaymentRequest.bank_code ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label={t("Account no.")}>{detailPaymentRequest.bank_account_no ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label={t("Account name")}>{detailPaymentRequest.bank_account_name ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label={t("Transfer note")}>{detailPaymentRequest.transfer_note ?? '-'}</Descriptions.Item>
                    <Descriptions.Item label={t("Expires at")}>{detailPaymentRequest.expires_at ? dayjs(detailPaymentRequest.expires_at).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
                    <Descriptions.Item label={t("Sent at")}>{detailPaymentRequest.sent_at ? dayjs(detailPaymentRequest.sent_at).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
                  </Descriptions>
                  <VietQrDisplay src={detailPaymentRequest.qr_image_url} />
                  {!['VERIFIED', 'CANCELLED', 'EXPIRED'].includes(detailPaymentRequest.status) ? (
                    <Space>
                      <Button danger loading={paymentActionLoading === 'cancel'} onClick={() => void runPaymentRequestAction('cancel')}>{t("Cancel request")}</Button>
                      <Button loading={paymentActionLoading === 'expire'} onClick={() => void runPaymentRequestAction('expire')}>{t("Expire request")}</Button>
                    </Space>
                  ) : null}
                  <Divider style={{ margin: '4px 0' }} />
                  <Typography.Text strong>{t("Payment history")}</Typography.Text>
                  <Table<PaymentProof>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={detailPaymentRequest.proofs ?? []}
                    locale={{ emptyText: <Empty description={t("No proof submitted")} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                    columns={[
                      { title: t("Submitted"), dataIndex: 'submitted_at', render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm') },
                      { title: t("Amount"), dataIndex: 'transfer_amount', align: 'right', render: (value: number) => currency.format(value) },
                      { title: t("Status"), dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> },
                      {
                        title: t("Proof"),
                        dataIndex: 'file_url',
                        render: (value: string, row) => (
                          <a href={value} target="_blank" rel="noreferrer">{row.file_name || 'Open file'}</a>
                        ),
                      },
                      { title: t("Reason"), dataIndex: 'rejection_reason', render: (value: string | null) => value ?? '-' },
                    ]}
                  />
                </Space>
              )}
            </Card>
          </Space>
        )}
      </Drawer>

      <Modal
        open={Boolean(confirmingPaymentProof)}
        title={t("Confirm invoice payment?")}
        okText={t("Confirm payment")}
        confirmLoading={paymentConfirmationLoading}
        cancelButtonProps={{ disabled: paymentConfirmationLoading }}
        closable={!paymentConfirmationLoading}
        maskClosable={!paymentConfirmationLoading}
        onOk={() => void confirmInvoicePayment()}
        onCancel={() => setConfirmingPaymentProof(null)}
      >
        <Typography.Paragraph>
          {t("Confirm receipt of")} {currency.format(confirmingPaymentProof?.transfer_amount ?? 0)} {t("for the")}{' '}
          {detailItem ? dayjs(detailItem.month).format('MM/YYYY') : ''} {t("invoice.")}
        </Typography.Paragraph>
        <Typography.Text type="secondary">
          {t("This will approve the tenant's payment proof and complete the invoice when the full balance has been received.")}
        </Typography.Text>
      </Modal>

      <Modal
        open={Boolean(deletingInvoiceId)}
        title={t("Delete this invoice?")}
        okText={t("Delete")}
        okButtonProps={{ danger: true }}
        cancelButtonProps={{ disabled: deleteLoading }}
        confirmLoading={deleteLoading}
        closable={!deleteLoading}
        maskClosable={!deleteLoading}
        onOk={() => void confirmDelete()}
        onCancel={() => setDeletingInvoiceId(null)}
      >
        <Alert
          showIcon
          type="warning"
          message={t("Only a draft with no payment history can be deleted.")}
          description={t("This permanently removes the draft and its line items. Its utility reading becomes reusable only when no other invoice references it. Issued invoices must be voided instead.")}
        />
      </Modal>

      <Modal
        open={Boolean(voidingInvoiceId)}
        title={t("Void this invoice?")}
        okText={t("Void invoice")}
        okButtonProps={{ danger: true }}
        confirmLoading={voidLoading}
        cancelButtonProps={{ disabled: voidLoading }}
        closable={!voidLoading}
        maskClosable={!voidLoading}
        onOk={() => void confirmVoid()}
        onCancel={() => {
          setVoidingInvoiceId(null)
          voidForm.resetFields()
        }}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            showIcon
            type="warning"
            message={t("Voiding is permanent and preserves the financial audit trail.")}
            description={t("Payments, payment requests, and proofs will not be deleted. Any open request will be closed, and the utility reading will remain invoiced until you explicitly create a replacement invoice.")}
          />
          <Form form={voidForm} layout="vertical">
            <Form.Item
              name="reason"
              label={t("Void reason")}
              rules={[
                { required: true, whitespace: true, message: t("Please explain why this invoice is being voided.") },
                { min: 3, max: 500, message: t("The reason must contain 3 to 500 characters.") },
              ]}
            >
              <Input.TextArea rows={4} maxLength={500} showCount />
            </Form.Item>
          </Form>
        </Space>
      </Modal>

      <Modal
        open={issueOpen}
        title={t("Issue invoice and create VietQR")}
        okText={t("Issue invoice")}
        confirmLoading={issueLoading}
        closable={!issueLoading}
        maskClosable={!issueLoading}
        onOk={() => void onIssueInvoice()}
        onCancel={() => setIssueOpen(false)}
        destroyOnHidden
      >
        <Form form={issueForm} layout="vertical">
          <Form.Item label={t("Transfer amount")}>
            <Input value={currency.format(paymentRemainingAmount)} disabled />
          </Form.Item>
          <VietQrBankFields />
        </Form>
      </Modal>

      <Modal
        open={bulkIssueOpen}
        title={t('Issue selected invoices')}
        okText={t('Issue selected')}
        confirmLoading={bulkIssueLoading}
        closable={!bulkIssueLoading}
        maskClosable={!bulkIssueLoading}
        onOk={() => void onBulkIssueInvoices()}
        onCancel={() => setBulkIssueOpen(false)}
        destroyOnHidden
      >
        <Alert
          showIcon
          type="info"
          message={`${selectedInvoiceIds.length} ${t('draft invoices selected')}`}
          description={t('Each invoice receives its own transfer note and VietQR payment request.')}
          style={{ marginBottom: 16 }}
        />
        <Form form={bulkIssueForm} layout="vertical">
          <VietQrBankFields includeTransferNote={false} />
        </Form>
      </Modal>

      <Modal
        open={adjustmentOpen}
        title={t("Add draft adjustment")}
        okText={t("Add adjustment")}
        confirmLoading={adjustmentLoading}
        onOk={() => void submitAdjustment()}
        onCancel={() => setAdjustmentOpen(false)}
        destroyOnClose
      >
        <Form form={adjustmentForm} layout="vertical">
          <Form.Item name="amount" label={t("Amount")} extra="Use a negative amount for a discount." rules={[{ required: true, type: 'number', message: t("Please enter a non-zero amount.") }]}>
            <InputNumber style={{ width: '100%' }} precision={0} />
          </Form.Item>
          <Form.Item name="reason" label={t("Reason")} rules={[{ required: true, whitespace: true, message: t("Please enter a reason.") }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        open={paymentRequestOpen}
        title={t("Create payment request")}
        okText={t("Create request")}
        confirmLoading={paymentRequestLoading}
        onOk={() => void onCreatePaymentRequest()}
        onCancel={() => setPaymentRequestOpen(false)}
        destroyOnClose
      >
        <Form form={paymentRequestForm} layout="vertical">
          <Form.Item name="amount" label={t("Amount")} rules={[{ required: true, type: 'number', min: 1, message: t("Please enter amount") }]}>
            <InputNumber min={1} max={paymentRemainingAmount || undefined} precision={0} style={{ width: '100%' }} formatter={(value) => `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(value) => Number(value?.replace(/\D/g, '') || 0)} />
          </Form.Item>
          <VietQrBankFields />
          <Form.Item name="expires_at" label={t("Expires at")}>
            <Input type="datetime-local" />
          </Form.Item>
        </Form>
      </Modal>

    </Space>
    </>
  )
}
