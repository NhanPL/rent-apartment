import { useI18n } from '../../i18n'
import {
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Checkbox,
  Descriptions,
  Drawer,
  Form,
  Grid,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  activateContract,
  addContractDocument,
  addContractTenant,
  cancelContract,
  createContract,
  endContract,
  getContract,
  removeContractTenant,
  updateContract,
  updateContractTenant,
} from '../../services/contractsService'
import type {
  ContractClosePayload,
  ContractBusinessStage,
  ContractCreatePayload,
  ContractDetail,
  ContractListItem,
  ContractStatus,
  ContractTenant,
  ContractUpdatePayload,
} from './types'
import { applyApiFieldErrors, getFormErrorMessage, getUserErrorMessage } from '../../services/errorMessage'
import { vndCurrency } from '../../i18n'
import { ContractFilters } from './components/ContractFilters'
import { ContractTable } from './components/ContractTable'
import { ContractFormDrawer } from './components/ContractFormDrawer'
import { ContractStatusActions } from './components/ContractStatusActions'
import { ContractDocumentManager } from './components/ContractDocumentManager'
import type {
  AddTenantFormValues,
  CloseContractFormValues,
  ContractDocumentFormValues,
  ContractFormValues,
} from './components/formTypes'
import { useContractsData } from './hooks/useContractsData'
import './ContractsPage.css'

const statusOptions: { label: string; value: ContractStatus; color: string }[] = [
  { label: 'Draft', value: 'DRAFT', color: 'default' },
  { label: 'Active', value: 'ACTIVE', color: 'green' },
  { label: 'Ended', value: 'ENDED', color: 'blue' },
  { label: 'Cancelled', value: 'CANCELLED', color: 'red' },
]

const businessStageOptions: { label: string; value: ContractBusinessStage; color: string }[] = [
  { label: 'Da giu phong', value: 'RESERVED', color: 'gold' },
  { label: 'Cho ky', value: 'WAITING_SIGNATURE', color: 'orange' },
  { label: 'Cho ban giao', value: 'WAITING_HANDOVER', color: 'cyan' },
  { label: 'Dang o', value: 'ACTIVE', color: 'green' },
  { label: 'Da huy', value: 'CANCELLED', color: 'red' },
  { label: 'Da ket thuc', value: 'ENDED', color: 'blue' },
]

const closedStatuses = new Set<ContractStatus>(['ENDED', 'CANCELLED'])
const currency = vndCurrency

const today = () => new Date().toISOString().slice(0, 10)

const formatDate = (value: string | null | undefined) => (value ? dayjs(value).format('DD/MM/YYYY') : '-')

const statusTag = (value: ContractStatus) => {
  const status = statusOptions.find((item) => item.value === value)
  return <Tag color={status?.color}>{status?.label ?? value}</Tag>
}

const businessStageTag = (value: ContractBusinessStage | undefined) => {
  if (!value) return <Typography.Text type="secondary">-</Typography.Text>
  const stage = businessStageOptions.find((item) => item.value === value)
  return <Tag color={stage?.color}>{stage?.label ?? value}</Tag>
}

const nullableText = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

const nullableDate = (value: string | undefined): string | null => value || null

const nullableNumber = (value: number | undefined): number | null => {
  if (value === undefined || value === null) {
    return null
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

const toContractCreatePayload = (values: ContractFormValues): ContractCreatePayload => {
  if (!values.room_id || !values.start_date) {
    throw new Error('Please complete all required contract fields.')
  }

  const coTenantIds = values.co_tenant_ids?.filter((tenantId) => tenantId !== values.primary_tenant_id) ?? []
  const tenants = [
    ...(values.primary_tenant_id
      ? [{
          tenant_id: values.primary_tenant_id,
          is_primary: true,
          joined_at: values.start_date,
        }]
      : []),
    ...coTenantIds.map((tenantId) => ({
      tenant_id: tenantId,
      is_primary: false,
      joined_at: values.start_date,
    })),
  ]

  return {
    room_id: values.room_id,
    contract_code: nullableText(values.contract_code),
    status: 'DRAFT',
    start_date: values.start_date,
    end_date: nullableDate(values.end_date),
    move_in_date: nullableDate(values.move_in_date),
    move_out_date: nullableDate(values.move_out_date),
    rent_price: nullableNumber(values.rent_price),
    deposit_amount: nullableNumber(values.deposit_amount),
    billing_day: nullableNumber(values.billing_day),
    note: nullableText(values.note),
    tenants,
  }
}

const toContractUpdatePayload = (values: ContractFormValues): ContractUpdatePayload => {
  if (!values.room_id || !values.start_date) {
    throw new Error('Please complete all required contract fields.')
  }

  return {
    room_id: values.room_id,
    contract_code: nullableText(values.contract_code),
    start_date: values.start_date,
    end_date: nullableDate(values.end_date),
    move_in_date: nullableDate(values.move_in_date),
    move_out_date: nullableDate(values.move_out_date),
    rent_price: nullableNumber(values.rent_price),
    deposit_amount: nullableNumber(values.deposit_amount),
    billing_day: nullableNumber(values.billing_day),
    note: nullableText(values.note),
  }
}

export function ContractsPage() {
  const { t } = useI18n()
  const screens = Grid.useBreakpoint()
  const [contractForm] = Form.useForm<ContractFormValues>()
  const [addTenantForm] = Form.useForm<AddTenantFormValues>()
  const [closeForm] = Form.useForm<CloseContractFormValues>()
  const [documentForm] = Form.useForm<ContractDocumentFormValues>()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContractStatus | undefined>()
  const [businessStageFilter, setBusinessStageFilter] = useState<ContractBusinessStage | undefined>()
  const [buildingFilter, setBuildingFilter] = useState<string | undefined>()
  const [roomFilter, setRoomFilter] = useState<string | undefined>()
  const [tenantFilter, setTenantFilter] = useState<string | undefined>()

  const { loading, error, items, total, buildings, rooms, tenants, reload: loadData } = useContractsData({
    search,
    status: statusFilter,
    businessStage: businessStageFilter,
    buildingId: buildingFilter,
    roomId: roomFilter,
    tenantId: tenantFilter,
    page,
    pageSize,
  })

  const [formDrawerOpen, setFormDrawerOpen] = useState(false)
  const [formDrawerMode, setFormDrawerMode] = useState<'create' | 'edit'>('create')
  const [formDrawerLoading, setFormDrawerLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailItem, setDetailItem] = useState<ContractDetail | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const [closeAction, setCloseAction] = useState<'end' | 'cancel' | null>(null)
  const [closeLoading, setCloseLoading] = useState(false)
  const [documentSaving, setDocumentSaving] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, businessStageFilter, buildingFilter, roomFilter, tenantFilter])


  const openDetail = useCallback(async (id: string, syncUrl = true) => {
    if (syncUrl) {
      window.history.pushState(null, '', `/contracts?contractId=${encodeURIComponent(id)}`)
    }

    setDetailOpen(true)
    setDetailLoading(true)

    try {
      const detail = await getContract(id)
      setDetailItem(detail)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong tai duoc chi tiet hop dong.'))
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    const openFromQuery = () => {
      const contractId = new URLSearchParams(window.location.search).get('contractId')
      if (contractId) {
        void openDetail(contractId, false)
      }
    }

    openFromQuery()
    window.addEventListener('popstate', openFromQuery)
    return () => window.removeEventListener('popstate', openFromQuery)
  }, [openDetail])

  const closeDetail = useCallback(() => {
    setDetailOpen(false)
    const params = new URLSearchParams(window.location.search)
    if (params.has('contractId')) {
      params.delete('contractId')
      const queryString = params.toString()
      window.history.pushState(null, '', `/contracts${queryString ? `?${queryString}` : ''}`)
    }
  }, [])

  const refreshDetailAndList = useCallback(async (id: string) => {
    await Promise.all([loadData(), openDetail(id, false)])
  }, [loadData, openDetail])

  const selectedFormBuildingId = Form.useWatch('building_id', contractForm)
  const selectedPrimaryTenantId = Form.useWatch('primary_tenant_id', contractForm)

  const roomsForFilter = useMemo(() => {
    if (!buildingFilter) {
      return rooms
    }

    return rooms.filter((room) => room.building_id === buildingFilter)
  }, [buildingFilter, rooms])

  const roomsForForm = useMemo(() => {
    if (!selectedFormBuildingId) {
      return rooms
    }

    return rooms.filter((room) => room.building_id === selectedFormBuildingId)
  }, [rooms, selectedFormBuildingId])

  const coTenantOptions = useMemo(
    () => tenants.filter((tenant) => tenant.id !== selectedPrimaryTenantId),
    [selectedPrimaryTenantId, tenants],
  )

  const activeParticipantIds = useMemo(() => {
    const activeIds = new Set<string>()
    detailItem?.tenants.forEach((tenant) => {
      if (!tenant.left_at) {
        activeIds.add(tenant.tenant_id)
      }
    })
    return activeIds
  }, [detailItem])

  const availableTenantsForDetail = useMemo(
    () => tenants.filter((tenant) => !activeParticipantIds.has(tenant.id)),
    [activeParticipantIds, tenants],
  )

  const detailCanChange = detailItem ? !closedStatuses.has(detailItem.status) : false

  const openCreate = useCallback(() => {
    setFormDrawerMode('create')
    setEditingId(null)
    contractForm.resetFields()
    contractForm.setFieldsValue({ billing_day: 1, rent_price: 0, deposit_amount: 0, co_tenant_ids: [] })
    setFormDrawerOpen(true)
  }, [contractForm])

  const openEdit = useCallback(async (id: string) => {
    setFormDrawerMode('edit')
    setEditingId(id)
    setFormDrawerOpen(true)
    setFormDrawerLoading(true)

    try {
      const detail = await getContract(id)
      contractForm.resetFields()
      contractForm.setFieldsValue({
        building_id: detail.building_id,
        room_id: detail.room_id,
        contract_code: detail.contract_code ?? undefined,
        start_date: detail.start_date,
        end_date: detail.end_date ?? undefined,
        move_in_date: detail.move_in_date ?? undefined,
        move_out_date: detail.move_out_date ?? undefined,
        rent_price: detail.rent_price,
        deposit_amount: detail.deposit_amount,
        billing_day: detail.billing_day,
        note: detail.note ?? undefined,
      })
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong tai duoc hop dong de chinh sua.'))
      setFormDrawerOpen(false)
    } finally {
      setFormDrawerLoading(false)
    }
  }, [contractForm])

  const submitContractForm = useCallback(async () => {
    setSaveLoading(true)

    try {
      const values = await contractForm.validateFields()

      if (formDrawerMode === 'create') {
        await createContract(toContractCreatePayload(values))
        message.success('Contract created successfully')
      } else if (editingId) {
        await updateContract(editingId, toContractUpdatePayload(values))
        message.success('Contract updated successfully')
        if (detailItem?.id === editingId) {
          await openDetail(editingId, false)
        }
      }

      setFormDrawerOpen(false)
      await loadData()
    } catch (error: unknown) {
      applyApiFieldErrors(contractForm, error)
      message.error(getFormErrorMessage(error, 'Unable to save the contract.'))
    } finally {
      setSaveLoading(false)
    }
  }, [contractForm, detailItem?.id, editingId, formDrawerMode, loadData, openDetail])

  const handleActivate = useCallback(async (id: string) => {
    setActionLoading(`activate-${id}`)

    try {
      await activateContract(id)
      message.success('Contract activated')
      await refreshDetailAndList(id)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the kich hoat hop dong.'))
    } finally {
      setActionLoading(null)
    }
  }, [refreshDetailAndList])

  const openCloseModal = useCallback((action: 'end' | 'cancel') => {
    closeForm.resetFields()
    closeForm.setFieldsValue({ close_date: today() })
    setCloseAction(action)
  }, [closeForm])

  const submitCloseAction = useCallback(async () => {
    if (!detailItem || !closeAction) {
      return
    }

    setCloseLoading(true)

    try {
      const values = await closeForm.validateFields()
      const payload: ContractClosePayload = {
        end_date: closeAction === 'end' ? values.close_date : null,
        move_out_date: values.close_date,
        note: nullableText(values.note),
      }

      if (closeAction === 'end') {
        await endContract(detailItem.id, payload)
        message.success('Contract ended')
      } else {
        await cancelContract(detailItem.id, payload)
        message.success('Contract cancelled')
      }

      setCloseAction(null)
      await refreshDetailAndList(detailItem.id)
    } catch (error: unknown) {
      applyApiFieldErrors(closeForm, error)
      message.error(getFormErrorMessage(error, 'Unable to close the contract.'))
    } finally {
      setCloseLoading(false)
    }
  }, [closeAction, closeForm, detailItem, refreshDetailAndList])

  const submitAddTenant = useCallback(async () => {
    if (!detailItem) {
      return
    }

    setActionLoading(`add-tenant-${detailItem.id}`)

    try {
      const values = await addTenantForm.validateFields()
      await addContractTenant(detailItem.id, {
        tenant_id: values.tenant_id,
        joined_at: values.joined_at || detailItem.start_date,
        is_primary: values.is_primary ?? false,
      })
      addTenantForm.resetFields()
      message.success('Tenant added to contract')
      await refreshDetailAndList(detailItem.id)
    } catch (error: unknown) {
      applyApiFieldErrors(addTenantForm, error)
      message.error(getFormErrorMessage(error, 'Unable to add the tenant to the contract.'))
    } finally {
      setActionLoading(null)
    }
  }, [addTenantForm, detailItem, refreshDetailAndList])

  const handleMakePrimary = useCallback(async (tenant: ContractTenant) => {
    if (!detailItem) {
      return
    }

    setActionLoading(`primary-${tenant.tenant_id}`)

    try {
      await updateContractTenant(detailItem.id, tenant.tenant_id, { is_primary: true })
      message.success('Primary tenant updated')
      await refreshDetailAndList(detailItem.id)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the cap nhat nguoi thue chinh.'))
    } finally {
      setActionLoading(null)
    }
  }, [detailItem, refreshDetailAndList])

  const handleRemoveTenant = useCallback(async (tenant: ContractTenant) => {
    if (!detailItem) {
      return
    }

    setActionLoading(`remove-${tenant.tenant_id}`)

    try {
      await removeContractTenant(detailItem.id, tenant.tenant_id, today())
      message.success('Tenant removed from contract')
      await refreshDetailAndList(detailItem.id)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the xoa nguoi thue khoi hop dong.'))
    } finally {
      setActionLoading(null)
    }
  }, [detailItem, refreshDetailAndList])

  const submitContractDocument = useCallback(async () => {
    if (!detailItem) {
      return
    }

    setDocumentSaving(true)

    try {
      const values = await documentForm.validateFields()
      if (!values.file_url || !values.mime_type || !values.file_size) {
        message.warning('Please upload a contract document first')
        return
      }

      await addContractDocument(detailItem.id, {
        doc_type: values.doc_type,
        file_name: nullableText(values.file_name),
        file_url: values.file_url,
        mime_type: values.mime_type,
        file_size: values.file_size,
        note: nullableText(values.note),
      })
      documentForm.resetFields()
      documentForm.setFieldValue('doc_type', 'SIGNED_SCAN')
      message.success('Contract document uploaded')
      await refreshDetailAndList(detailItem.id)
    } catch (error: unknown) {
      applyApiFieldErrors(documentForm, error)
      message.error(getFormErrorMessage(error, 'Unable to save the contract document.'))
    } finally {
      setDocumentSaving(false)
    }
  }, [detailItem, documentForm, refreshDetailAndList])

  const statusHistoryItems = useMemo(() => {
    if (!detailItem) {
      return []
    }

    return [
      { color: 'gray', children: `Created ${formatDate(detailItem.created_at)}` },
      { color: 'blue', children: `Started ${formatDate(detailItem.start_date)}` },
      ...(detailItem.move_in_date ? [{ color: 'green', children: `Move-in ${formatDate(detailItem.move_in_date)}` }] : []),
      ...(detailItem.end_date ? [{ color: 'blue', children: `End date ${formatDate(detailItem.end_date)}` }] : []),
      ...(detailItem.move_out_date ? [{ color: 'red', children: `Move-out ${formatDate(detailItem.move_out_date)}` }] : []),
      { color: statusOptions.find((item) => item.value === detailItem.status)?.color ?? 'gray', children: `Current status ${detailItem.status}` },
    ]
  }, [detailItem])

  const columns: ColumnsType<ContractListItem> = useMemo(
    () => [
      {
        title: t("Code"),
        dataIndex: 'contract_code',
        key: 'contract_code',
        width: 170,
        render: (value: string | null, item) => value ?? item.id.slice(0, 8),
      },
      {
        title: t("Status"),
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (value: ContractStatus) => statusTag(value),
      },
      {
        title: t("Business stage"),
        dataIndex: 'business_stage',
        key: 'business_stage',
        width: 160,
        render: (value: ContractBusinessStage | undefined) => businessStageTag(value),
      },
      {
        title: t("Building / Room"),
        key: 'room',
        width: 220,
        render: (_, item) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{item.building_name}</Typography.Text>
            <Typography.Text type="secondary">{t("Room")} {item.room_code}</Typography.Text>
          </Space>
        ),
      },
      {
        title: t("Tenants"),
        key: 'tenants',
        width: 260,
        render: (_, item) => item.tenant_names || item.tenant_name || <Typography.Text type="secondary">{t("No tenants")}</Typography.Text>,
      },
      {
        title: t("Occupants"),
        dataIndex: 'active_tenants_count',
        key: 'active_tenants_count',
        width: 110,
      },
      {
        title: t("Dates"),
        key: 'dates',
        width: 210,
        render: (_, item) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{formatDate(item.start_date)}</Typography.Text>
            <Typography.Text type="secondary">{t("End:")} {formatDate(item.end_date)}</Typography.Text>
          </Space>
        ),
      },
      {
        title: t("Rent"),
        dataIndex: 'rent_price',
        key: 'rent_price',
        width: 160,
        render: (value: number) => currency.format(value),
      },
      {
        title: t("Deposit"),
        dataIndex: 'deposit_amount',
        key: 'deposit_amount',
        width: 160,
        render: (value: number) => currency.format(value),
      },
      {
        title: t("Actions"),
        key: 'actions',
        fixed: 'right',
        width: 180,
        render: (_, item) => (
          <Space>
            <Button type="text" icon={<EyeOutlined />} onClick={() => void openDetail(item.id)} />
            <Button type="text" icon={<EditOutlined />} disabled={closedStatuses.has(item.status)} onClick={() => void openEdit(item.id)} />
            {item.status === 'DRAFT' ? (
              <Button
                type="link"
                loading={actionLoading === `activate-${item.id}`}
                onClick={() => void handleActivate(item.id)}
              >
                {t("Activate")}
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [actionLoading, handleActivate, openDetail, openEdit, t],
  )

  const tenantColumns: ColumnsType<ContractTenant> = useMemo(
    () => [
      {
        title: t("Tenant"),
        key: 'tenant',
        render: (_, tenant) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{tenant.full_name}</Typography.Text>
            <Typography.Text type="secondary">{tenant.phone ?? tenant.email ?? '-'}</Typography.Text>
          </Space>
        ),
      },
      {
        title: t("Role"),
        dataIndex: 'is_primary',
        key: 'is_primary',
        width: 120,
        render: (value: boolean) => (value ? <Tag color="green">{t("Primary")}</Tag> : <Tag>{t("Co-tenant")}</Tag>),
      },
      {
        title: t("Joined"),
        dataIndex: 'joined_at',
        key: 'joined_at',
        width: 130,
        render: (value: string) => formatDate(value),
      },
      {
        title: t("Left"),
        dataIndex: 'left_at',
        key: 'left_at',
        width: 130,
        render: (value: string | null) => formatDate(value),
      },
      {
        title: t("Actions"),
        key: 'actions',
        width: 210,
        render: (_, tenant) => {
          const inactive = Boolean(tenant.left_at)
          return (
            <Space wrap>
              <Button
                size="small"
                disabled={!detailCanChange || inactive || tenant.is_primary}
                loading={actionLoading === `primary-${tenant.tenant_id}`}
                onClick={() => void handleMakePrimary(tenant)}
              >
                {t("Make primary")}
              </Button>
              <Button
                size="small"
                danger
                disabled={!detailCanChange || inactive}
                loading={actionLoading === `remove-${tenant.tenant_id}`}
                onClick={() => void handleRemoveTenant(tenant)}
              >
                {t("Remove")}
              </Button>
            </Space>
          )
        },
      },
    ],
    [actionLoading, detailCanChange, handleMakePrimary, handleRemoveTenant, t],
  )

  return (
    <>
    <div className="contracts-page">
      <Card>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className="contracts-toolbar">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {t("Contracts")}
              </Typography.Title>
              <Typography.Text type="secondary">
                {t("Manage rental contracts, occupants, lifecycle status, and room capacity.")}
              </Typography.Text>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              {t("New Contract")}
            </Button>
          </div>

          <ContractFilters
            search={searchInput}
            status={statusFilter}
            businessStage={businessStageFilter}
            buildingId={buildingFilter}
            roomId={roomFilter}
            tenantId={tenantFilter}
            buildings={buildings}
            rooms={roomsForFilter}
            tenants={tenants}
            statusOptions={statusOptions}
            businessStageOptions={businessStageOptions}
            onSearchChange={setSearchInput}
            onStatusChange={setStatusFilter}
            onBusinessStageChange={setBusinessStageFilter}
            onBuildingChange={(value) => { setBuildingFilter(value); setRoomFilter(undefined) }}
            onRoomChange={setRoomFilter}
            onTenantChange={setTenantFilter}
            onRefresh={() => void loadData()}
          />
          <ContractTable
            loading={loading}
            error={error}
            items={items}
            columns={columns}
            page={page}
            pageSize={pageSize}
            total={total}
            onRetry={() => void loadData()}
            onCreate={openCreate}
            onPageChange={(nextPage, nextPageSize) => { setPage(nextPage); setPageSize(nextPageSize) }}
          />
        </Space>
      </Card>

      <ContractFormDrawer
        open={formDrawerOpen}
        mode={formDrawerMode}
        loading={formDrawerLoading}
        saving={saveLoading}
        width={screens.lg ? 620 : screens.md ? 540 : '100%'}
        form={contractForm}
        buildings={buildings}
        rooms={roomsForForm}
        tenants={tenants}
        coTenantOptions={coTenantOptions}
        selectedBuildingId={selectedFormBuildingId}
        onClose={() => setFormDrawerOpen(false)}
        onSave={() => void submitContractForm()}
      />

      <Drawer
        open={detailOpen}
        title={t("Contract Detail")}
        placement="right"
        width={screens.xl ? 860 : screens.md ? 720 : '100%'}
        onClose={closeDetail}
      >
        {detailLoading || !detailItem ? (
          <Skeleton active paragraph={{ rows: 10 }} />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div className="contract-detail-header">
              <Space direction="vertical" size={2}>
                <Typography.Text strong>{detailItem.contract_code ?? detailItem.id}</Typography.Text>
                <Typography.Text type="secondary">
                  {detailItem.building_name} {t("/ Room")} {detailItem.room_code}
                </Typography.Text>
              </Space>
              <ContractStatusActions
                contract={detailItem}
                canChange={detailCanChange}
                actionLoading={actionLoading}
                statusTag={statusTag(detailItem.status)}
                businessStageTag={businessStageTag(detailItem.business_stage)}
                onEdit={() => void openEdit(detailItem.id)}
                onActivate={() => void handleActivate(detailItem.id)}
                onEnd={() => openCloseModal('end')}
                onCancel={() => openCloseModal('cancel')}
              />
            </div>

            <Descriptions bordered size="small" column={screens.lg ? 2 : 1}>
              <Descriptions.Item label={t("Business stage")}>{businessStageTag(detailItem.business_stage)}</Descriptions.Item>
              <Descriptions.Item label={t("Technical status")}>{statusTag(detailItem.status)}</Descriptions.Item>
              <Descriptions.Item label={t("Rent")}>{currency.format(detailItem.rent_price)}</Descriptions.Item>
              <Descriptions.Item label={t("Deposit")}>{currency.format(detailItem.deposit_amount)}</Descriptions.Item>
              <Descriptions.Item label={t("Billing day")}>{detailItem.billing_day}</Descriptions.Item>
              <Descriptions.Item label={t("Occupants")}>
                {detailItem.active_tenants_count} {t("/")} {detailItem.max_occupants}
              </Descriptions.Item>
              <Descriptions.Item label={t("Start date")}>{formatDate(detailItem.start_date)}</Descriptions.Item>
              <Descriptions.Item label={t("End date")}>{formatDate(detailItem.end_date)}</Descriptions.Item>
              <Descriptions.Item label={t("Move-in")}>{formatDate(detailItem.move_in_date)}</Descriptions.Item>
              <Descriptions.Item label={t("Move-out")}>{formatDate(detailItem.move_out_date)}</Descriptions.Item>
              <Descriptions.Item label={t("Note")} span={screens.lg ? 2 : 1}>{detailItem.note ?? '-'}</Descriptions.Item>
            </Descriptions>

            <div>
              <Typography.Title level={5}>{t("Status history")}</Typography.Title>
              <Timeline items={statusHistoryItems} />
            </div>

            <ContractDocumentManager
              documents={detailItem.documents}
              form={documentForm}
              saving={documentSaving}
              onSave={() => void submitContractDocument()}
            />

            <div className="contract-tenants-section">
              <div className="contract-section-title">
                <Typography.Title level={5}>{t("Tenants")}</Typography.Title>
                <Typography.Text type="secondary">
                  {t("One active tenant must be marked primary before activation.")}
                </Typography.Text>
              </div>

              {detailCanChange ? (
                <Form form={addTenantForm} layout="vertical" className="contract-tenant-form">
                  <Form.Item name="tenant_id" label={t("Tenant")} rules={[{ required: true, message: t("Please select a tenant") }]}>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={availableTenantsForDetail.map((tenant) => ({ label: tenant.full_name, value: tenant.id }))}
                    />
                  </Form.Item>
                  <Form.Item name="joined_at" label={t("Joined at")}>
                    <Input type="date" />
                  </Form.Item>
                  <Form.Item name="is_primary" valuePropName="checked" className="contract-primary-checkbox">
                    <Checkbox>{t("Primary")}</Checkbox>
                  </Form.Item>
                  <Button
                    type="primary"
                    loading={actionLoading === `add-tenant-${detailItem.id}`}
                    onClick={() => void submitAddTenant()}
                  >
                    {t("Add tenant")}
                  </Button>
                </Form>
              ) : null}

              <Table<ContractTenant>
                rowKey="tenant_id"
                size="small"
                columns={tenantColumns}
                dataSource={detailItem.tenants}
                pagination={false}
                scroll={{ x: 760 }}
              />
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        open={Boolean(closeAction)}
        title={closeAction === 'end' ? 'End contract' : 'Cancel contract'}
        okText={closeAction === 'end' ? 'End' : 'Cancel contract'}
        okButtonProps={{ danger: closeAction === 'cancel' }}
        confirmLoading={closeLoading}
        onCancel={() => setCloseAction(null)}
        onOk={() => void submitCloseAction()}
        destroyOnClose
      >
        <Form form={closeForm} layout="vertical">
          <Form.Item name="close_date" label={t("Close date")} rules={[{ required: true, message: t("Please select close date") }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="note" label={t("Note")}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
    </>
  )
}
