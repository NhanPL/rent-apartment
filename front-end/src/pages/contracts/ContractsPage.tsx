import {
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Checkbox,
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
  listBuildings,
  listContracts,
  listRooms,
  listTenants,
  removeContractTenant,
  updateContract,
  updateContractTenant,
} from '../../services/contractsService'
import type {
  BuildingOption,
  ContractClosePayload,
  ContractBusinessStage,
  ContractCreatePayload,
  ContractDetail,
  ContractDocument,
  ContractDocumentType,
  ContractListItem,
  ContractStatus,
  ContractTenant,
  ContractUpdatePayload,
  RoomOption,
  TenantOption,
} from './types'
import { CloudinaryUploadButton } from '../../shared/components/CloudinaryUploadButton'
import type { UploadedCloudinaryFile } from '../../services/uploadService'
import { getFormErrorMessage, getUserErrorMessage } from '../../services/errorMessage'
import { Localized } from '../../shared/components/Localized'
import { vndCurrency } from '../../i18n'
import './ContractsPage.css'

interface ContractFormValues {
  building_id?: string
  room_id?: string
  contract_code?: string
  start_date?: string
  end_date?: string
  move_in_date?: string
  move_out_date?: string
  rent_price?: number
  deposit_amount?: number
  billing_day?: number
  note?: string
  primary_tenant_id?: string
  co_tenant_ids?: string[]
}

interface AddTenantFormValues {
  tenant_id: string
  joined_at?: string
  is_primary?: boolean
}

interface CloseContractFormValues {
  close_date: string
  note?: string
}

interface ContractDocumentFormValues {
  doc_type: ContractDocumentType
  file_name?: string
  file_url?: string
  mime_type?: string
  file_size?: number
  note?: string
}

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
const documentAccept = 'image/jpeg,image/png,image/webp,application/pdf'

const contractDocumentTypeLabel: Record<ContractDocumentType, string> = {
  SIGNED_SCAN: 'Signed scan',
  ADDENDUM: 'Addendum',
  TERMINATION: 'Termination',
  OTHER: 'Other',
}

const uploadedFileFields = (file: UploadedCloudinaryFile) => ({
  file_name: file.file_name,
  file_url: file.file_url,
  mime_type: file.mime_type,
  file_size: file.file_size,
})

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
  const screens = Grid.useBreakpoint()
  const [contractForm] = Form.useForm<ContractFormValues>()
  const [addTenantForm] = Form.useForm<AddTenantFormValues>()
  const [closeForm] = Form.useForm<CloseContractFormValues>()
  const [documentForm] = Form.useForm<ContractDocumentFormValues>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ContractListItem[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContractStatus | undefined>()
  const [businessStageFilter, setBusinessStageFilter] = useState<ContractBusinessStage | undefined>()
  const [buildingFilter, setBuildingFilter] = useState<string | undefined>()
  const [roomFilter, setRoomFilter] = useState<string | undefined>()
  const [tenantFilter, setTenantFilter] = useState<string | undefined>()

  const [buildings, setBuildings] = useState<BuildingOption[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])

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

  const loadOptions = useCallback(async () => {
    try {
      const [buildingRows, roomRows, tenantRows] = await Promise.all([
        listBuildings(),
        listRooms(),
        listTenants(),
      ])
      setBuildings(buildingRows)
      setRooms(roomRows)
      setTenants(tenantRows)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong tai duoc bo loc hop dong.'))
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await listContracts({
        search,
        status: statusFilter,
        business_stage: businessStageFilter,
        building_id: buildingFilter,
        room_id: roomFilter,
        tenant_id: tenantFilter,
        page,
        pageSize,
      })
      setItems(response.items)
      setTotal(response.total)
    } catch (error) {
      setError(getUserErrorMessage(error, 'Khong tai duoc danh sach hop dong.'))
    } finally {
      setLoading(false)
    }
  }, [buildingFilter, businessStageFilter, page, pageSize, roomFilter, search, statusFilter, tenantFilter])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  useEffect(() => {
    void loadData()
  }, [loadData])

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
        title: 'Code',
        dataIndex: 'contract_code',
        key: 'contract_code',
        width: 170,
        render: (value: string | null, item) => value ?? item.id.slice(0, 8),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (value: ContractStatus) => statusTag(value),
      },
      {
        title: 'Business stage',
        dataIndex: 'business_stage',
        key: 'business_stage',
        width: 160,
        render: (value: ContractBusinessStage | undefined) => businessStageTag(value),
      },
      {
        title: 'Building / Room',
        key: 'room',
        width: 220,
        render: (_, item) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{item.building_name}</Typography.Text>
            <Typography.Text type="secondary">Room {item.room_code}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Tenants',
        key: 'tenants',
        width: 260,
        render: (_, item) => item.tenant_names || item.tenant_name || <Typography.Text type="secondary">No tenants</Typography.Text>,
      },
      {
        title: 'Occupants',
        dataIndex: 'active_tenants_count',
        key: 'active_tenants_count',
        width: 110,
      },
      {
        title: 'Dates',
        key: 'dates',
        width: 210,
        render: (_, item) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{formatDate(item.start_date)}</Typography.Text>
            <Typography.Text type="secondary">End: {formatDate(item.end_date)}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Rent',
        dataIndex: 'rent_price',
        key: 'rent_price',
        width: 160,
        render: (value: number) => currency.format(value),
      },
      {
        title: 'Deposit',
        dataIndex: 'deposit_amount',
        key: 'deposit_amount',
        width: 160,
        render: (value: number) => currency.format(value),
      },
      {
        title: 'Actions',
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
                Activate
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [actionLoading, handleActivate, openDetail, openEdit],
  )

  const tenantColumns: ColumnsType<ContractTenant> = useMemo(
    () => [
      {
        title: 'Tenant',
        key: 'tenant',
        render: (_, tenant) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{tenant.full_name}</Typography.Text>
            <Typography.Text type="secondary">{tenant.phone ?? tenant.email ?? '-'}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Role',
        dataIndex: 'is_primary',
        key: 'is_primary',
        width: 120,
        render: (value: boolean) => (value ? <Tag color="green">Primary</Tag> : <Tag>Co-tenant</Tag>),
      },
      {
        title: 'Joined',
        dataIndex: 'joined_at',
        key: 'joined_at',
        width: 130,
        render: (value: string) => formatDate(value),
      },
      {
        title: 'Left',
        dataIndex: 'left_at',
        key: 'left_at',
        width: 130,
        render: (value: string | null) => formatDate(value),
      },
      {
        title: 'Actions',
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
                Make primary
              </Button>
              <Button
                size="small"
                danger
                disabled={!detailCanChange || inactive}
                loading={actionLoading === `remove-${tenant.tenant_id}`}
                onClick={() => void handleRemoveTenant(tenant)}
              >
                Remove
              </Button>
            </Space>
          )
        },
      },
    ],
    [actionLoading, detailCanChange, handleMakePrimary, handleRemoveTenant],
  )

  return (
    <Localized>
    <div className="contracts-page">
      <Card>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className="contracts-toolbar">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                Contracts
              </Typography.Title>
              <Typography.Text type="secondary">
                Manage rental contracts, occupants, lifecycle status, and room capacity.
              </Typography.Text>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              New Contract
            </Button>
          </div>

          <div className="contracts-filters">
            <Input.Search
              placeholder="Search code, room, building, tenant"
              value={searchInput}
              allowClear
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <Select
              value={statusFilter}
              placeholder="Status"
              allowClear
              options={statusOptions.map((item) => ({ label: item.label, value: item.value }))}
              onChange={(value) => setStatusFilter(value)}
            />
            <Select
              value={businessStageFilter}
              placeholder="Business stage"
              allowClear
              options={businessStageOptions.map((item) => ({ label: item.label, value: item.value }))}
              onChange={(value) => setBusinessStageFilter(value)}
            />
            <Select
              value={buildingFilter}
              placeholder="Building"
              allowClear
              options={buildings.map((building) => ({ label: building.name, value: building.id }))}
              onChange={(value) => {
                setBuildingFilter(value)
                setRoomFilter(undefined)
              }}
            />
            <Select
              value={roomFilter}
              placeholder="Room"
              allowClear
              options={roomsForFilter.map((room) => ({ label: room.code, value: room.id }))}
              onChange={(value) => setRoomFilter(value)}
            />
            <Select
              value={tenantFilter}
              placeholder="Tenant"
              allowClear
              showSearch
              optionFilterProp="label"
              options={tenants.map((tenant) => ({ label: tenant.full_name, value: tenant.id }))}
              onChange={(value) => setTenantFilter(value)}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : error ? (
            <Empty description={error}>
              <Button type="primary" onClick={() => void loadData()}>
                Retry
              </Button>
            </Empty>
          ) : items.length === 0 ? (
            <Empty description="No contracts found">
              <Button type="primary" onClick={openCreate}>
                New Contract
              </Button>
            </Empty>
          ) : (
            <Table<ContractListItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                onChange: (nextPage, nextPageSize) => {
                  setPage(nextPage)
                  setPageSize(nextPageSize)
                },
              }}
              scroll={{ x: 1420 }}
            />
          )}
        </Space>
      </Card>

      <Drawer
        open={formDrawerOpen}
        title={formDrawerMode === 'create' ? 'New Contract' : 'Edit Contract'}
        placement="right"
        width={screens.lg ? 620 : screens.md ? 540 : '100%'}
        onClose={() => setFormDrawerOpen(false)}
        destroyOnClose
      >
        {formDrawerLoading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Form form={contractForm} layout="vertical">
            <div className="contract-form-grid">
              <Form.Item name="building_id" label="Building" rules={[{ required: true, message: 'Please select a building' }]}>
                <Select
                  options={buildings.map((building) => ({ label: building.name, value: building.id }))}
                  onChange={() => contractForm.setFieldValue('room_id', undefined)}
                />
              </Form.Item>
              <Form.Item name="room_id" label="Room" rules={[{ required: true, message: 'Please select a room' }]}>
                <Select
                  disabled={!selectedFormBuildingId}
                  options={roomsForForm.map((room) => ({ label: room.code, value: room.id }))}
                  onChange={(roomId) => {
                    const room = rooms.find((item) => item.id === roomId)
                    if (room && formDrawerMode === 'create') {
                      contractForm.setFieldsValue({
                        rent_price: room.base_rent,
                        deposit_amount: room.deposit_default,
                      })
                    }
                  }}
                />
              </Form.Item>
              <Form.Item name="contract_code" label="Contract code">
                <Input placeholder="Auto-generated if empty" />
              </Form.Item>
              <Form.Item name="billing_day" label="Billing day" rules={[{ required: true, message: 'Please enter billing day' }]}>
                <InputNumber min={1} max={28} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="start_date" label="Start date" rules={[{ required: true, message: 'Please select start date' }]}>
                <Input type="date" />
              </Form.Item>
              <Form.Item name="end_date" label="End date">
                <Input type="date" />
              </Form.Item>
              <Form.Item name="move_in_date" label="Move-in date">
                <Input type="date" />
              </Form.Item>
              <Form.Item name="move_out_date" label="Move-out date">
                <Input type="date" />
              </Form.Item>
              <Form.Item name="rent_price" label="Rent" rules={[{ required: true, message: 'Please enter rent' }]}>
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="deposit_amount" label="Deposit" rules={[{ required: true, message: 'Please enter deposit' }]}>
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              {formDrawerMode === 'create' ? (
                <>
                  <Form.Item
                    name="primary_tenant_id"
                    label="Primary tenant"
                    dependencies={['co_tenant_ids']}
                    rules={[
                      ({ getFieldValue }) => ({
                        validator: async (_rule: unknown, value?: string) => {
                          const coTenantIds = (getFieldValue('co_tenant_ids') as string[] | undefined) ?? []
                          if (coTenantIds.length > 0 && !value) {
                            throw new Error('Please select a primary tenant')
                          }
                        },
                      }),
                    ]}
                  >
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={tenants.map((tenant) => ({ label: tenant.full_name, value: tenant.id }))}
                      onChange={(value) => {
                        const coTenantIds = (contractForm.getFieldValue('co_tenant_ids') as string[] | undefined) ?? []
                        contractForm.setFieldValue('co_tenant_ids', coTenantIds.filter((tenantId) => tenantId !== value))
                      }}
                    />
                  </Form.Item>
                  <Form.Item name="co_tenant_ids" label="Co-tenants">
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={coTenantOptions.map((tenant) => ({ label: tenant.full_name, value: tenant.id }))}
                    />
                  </Form.Item>
                </>
              ) : null}
              <Form.Item name="note" label="Note" className="contract-form-full-row">
                <Input.TextArea rows={3} placeholder="Internal note" />
              </Form.Item>
            </div>

            <div className="contract-drawer-actions">
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={() => setFormDrawerOpen(false)}>Cancel</Button>
                <Button type="primary" loading={saveLoading} onClick={() => void submitContractForm()}>
                  Save
                </Button>
              </Space>
            </div>
          </Form>
        )}
      </Drawer>

      <Drawer
        open={detailOpen}
        title="Contract Detail"
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
                  {detailItem.building_name} / Room {detailItem.room_code}
                </Typography.Text>
              </Space>
              <Space wrap className="contract-detail-actions">
                {statusTag(detailItem.status)}
                {businessStageTag(detailItem.business_stage)}
                <Button icon={<EditOutlined />} disabled={!detailCanChange} onClick={() => void openEdit(detailItem.id)}>
                  Edit
                </Button>
                {detailItem.status === 'DRAFT' ? (
                  <Button
                    type="primary"
                    loading={actionLoading === `activate-${detailItem.id}`}
                    onClick={() => void handleActivate(detailItem.id)}
                  >
                    Activate
                  </Button>
                ) : null}
                {detailCanChange ? (
                  <>
                    <Button onClick={() => openCloseModal('end')}>End</Button>
                    <Button danger onClick={() => openCloseModal('cancel')}>Cancel</Button>
                  </>
                ) : null}
              </Space>
            </div>

            <Descriptions bordered size="small" column={screens.lg ? 2 : 1}>
              <Descriptions.Item label="Business stage">{businessStageTag(detailItem.business_stage)}</Descriptions.Item>
              <Descriptions.Item label="Technical status">{statusTag(detailItem.status)}</Descriptions.Item>
              <Descriptions.Item label="Rent">{currency.format(detailItem.rent_price)}</Descriptions.Item>
              <Descriptions.Item label="Deposit">{currency.format(detailItem.deposit_amount)}</Descriptions.Item>
              <Descriptions.Item label="Billing day">{detailItem.billing_day}</Descriptions.Item>
              <Descriptions.Item label="Occupants">
                {detailItem.active_tenants_count} / {detailItem.max_occupants}
              </Descriptions.Item>
              <Descriptions.Item label="Start date">{formatDate(detailItem.start_date)}</Descriptions.Item>
              <Descriptions.Item label="End date">{formatDate(detailItem.end_date)}</Descriptions.Item>
              <Descriptions.Item label="Move-in">{formatDate(detailItem.move_in_date)}</Descriptions.Item>
              <Descriptions.Item label="Move-out">{formatDate(detailItem.move_out_date)}</Descriptions.Item>
              <Descriptions.Item label="Note" span={screens.lg ? 2 : 1}>{detailItem.note ?? '-'}</Descriptions.Item>
            </Descriptions>

            <div>
              <Typography.Title level={5}>Status history</Typography.Title>
              <Timeline items={statusHistoryItems} />
            </div>

            <Card size="small" title="Contract documents">
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Form<ContractDocumentFormValues>
                  form={documentForm}
                  layout="vertical"
                  initialValues={{ doc_type: 'SIGNED_SCAN' }}
                >
                  <div className="contract-tenant-form">
                    <Form.Item name="doc_type" label="Document type" rules={[{ required: true, message: 'Please select document type' }]}>
                      <Select
                        options={(Object.keys(contractDocumentTypeLabel) as ContractDocumentType[]).map((value) => ({
                          value,
                          label: contractDocumentTypeLabel[value],
                        }))}
                      />
                    </Form.Item>
                    <Form.Item name="note" label="Note">
                      <Input />
                    </Form.Item>
                    <Form.Item name="file_url" hidden rules={[{ required: true, message: 'Please upload a file' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="file_name" hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item name="mime_type" hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item name="file_size" hidden>
                      <InputNumber />
                    </Form.Item>
                    <Form.Item label="File" required>
                      <Space wrap>
                        <CloudinaryUploadButton
                          accept={documentAccept}
                          context="CONTRACT_DOCUMENT"
                          onUploaded={(file) => documentForm.setFieldsValue(uploadedFileFields(file))}
                        >
                          Upload file
                        </CloudinaryUploadButton>
                        <Form.Item noStyle shouldUpdate={(prev, next) => prev.file_url !== next.file_url || prev.file_name !== next.file_name}>
                          {({ getFieldValue }) => {
                            const fileUrl = getFieldValue('file_url') as string | undefined
                            const fileName = getFieldValue('file_name') as string | undefined
                            return fileUrl ? (
                              <Typography.Link href={fileUrl} target="_blank" rel="noreferrer">
                                {fileName || 'Uploaded file'}
                              </Typography.Link>
                            ) : (
                              <Typography.Text type="secondary">No file uploaded</Typography.Text>
                            )
                          }}
                        </Form.Item>
                      </Space>
                    </Form.Item>
                    <Button type="primary" loading={documentSaving} onClick={() => void submitContractDocument()}>
                      Save document
                    </Button>
                  </div>
                </Form>

                <Table<ContractDocument>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={detailItem.documents}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No documents uploaded" /> }}
                  columns={[
                    { title: 'Type', dataIndex: 'doc_type', render: (value: ContractDocumentType) => contractDocumentTypeLabel[value] ?? value },
                    {
                      title: 'File',
                      dataIndex: 'file_url',
                      render: (value: string | null, item) => value ? (
                        <Typography.Link href={value} target="_blank" rel="noreferrer">
                          {item.file_name ?? 'Open file'}
                        </Typography.Link>
                      ) : '-',
                    },
                    { title: 'Uploaded', dataIndex: 'uploaded_at', render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-') },
                  ]}
                />
              </Space>
            </Card>

            <div className="contract-tenants-section">
              <div className="contract-section-title">
                <Typography.Title level={5}>Tenants</Typography.Title>
                <Typography.Text type="secondary">
                  One active tenant must be marked primary before activation.
                </Typography.Text>
              </div>

              {detailCanChange ? (
                <Form form={addTenantForm} layout="vertical" className="contract-tenant-form">
                  <Form.Item name="tenant_id" label="Tenant" rules={[{ required: true, message: 'Please select a tenant' }]}>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      options={availableTenantsForDetail.map((tenant) => ({ label: tenant.full_name, value: tenant.id }))}
                    />
                  </Form.Item>
                  <Form.Item name="joined_at" label="Joined at">
                    <Input type="date" />
                  </Form.Item>
                  <Form.Item name="is_primary" valuePropName="checked" className="contract-primary-checkbox">
                    <Checkbox>Primary</Checkbox>
                  </Form.Item>
                  <Button
                    type="primary"
                    loading={actionLoading === `add-tenant-${detailItem.id}`}
                    onClick={() => void submitAddTenant()}
                  >
                    Add tenant
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
          <Form.Item name="close_date" label="Close date" rules={[{ required: true, message: 'Please select close date' }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="note" label="Note">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
    </Localized>
  )
}
