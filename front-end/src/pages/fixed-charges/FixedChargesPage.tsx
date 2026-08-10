import { useI18n } from '../../i18n'
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createBuildingCharge,
  createChargeCatalog,
  createContractChargeOverride,
  createRoomChargeOverride,
  createRoomMonthExtra,
  deleteBuildingCharge,
  deleteChargeCatalog,
  deleteContractChargeOverride,
  deleteRoomChargeOverride,
  deleteRoomMonthExtra,
  listBuildingCharges,
  listBuildings,
  listChargeCatalog,
  listContractChargeOverrides,
  listContracts,
  listRoomChargeOverrides,
  listRoomMonthExtras,
  listRooms,
  resolveFixedCharges,
  updateBuildingCharge,
  updateChargeCatalog,
  updateContractChargeOverride,
  updateRoomChargeOverride,
  updateRoomMonthExtra,
} from '../../services/fixedChargesService'
import { applyApiFieldErrors, getFormErrorMessage, getUserErrorMessage } from '../../services/errorMessage'
import { vndCurrency } from '../../i18n'
import type {
  BuildingCharge,
  BuildingChargePayload,
  BuildingOption,
  ChargeCatalog,
  ChargeCatalogPayload,
  ChargeType,
  ContractChargeOverride,
  ContractChargeOverridePayload,
  ContractOption,
  ResolvedFixedCharge,
  ResolvedFixedChargePreview,
  RoomChargeOverride,
  RoomChargeOverridePayload,
  RoomMonthExtra,
  RoomMonthExtraPayload,
  RoomOption,
} from './types'
import './FixedChargesPage.css'
import { ChargeAssignmentPanel } from './components/ChargeAssignmentPanel'
import { ChargeCatalogPanel } from './components/ChargeCatalogPanel'
import { MonthlyExtrasPanel } from './components/MonthlyExtrasPanel'

type TabKey = 'catalog' | 'building' | 'room' | 'contract' | 'extra' | 'preview'
type EditableKind = Exclude<TabKey, 'preview'>
type DrawerMode = 'create' | 'edit'

interface CatalogFormValues {
  code?: string
  name?: string
  charge_type?: ChargeType
  is_active?: boolean
  note?: string
}

interface ChargeFormValues {
  building_id?: string
  room_id?: string
  contract_id?: string
  charge_id?: string
  unit_price?: number
  effective_from?: string
  effective_to?: string
  is_active?: boolean
}

interface ExtraFormValues {
  building_id?: string
  room_id?: string
  month?: string
  persons_count?: number | null
  vehicles_count?: number | null
  note?: string
}

interface PreviewFormValues {
  contract_id?: string
  month?: string
}

const chargeTypeOptions: { label: string; value: ChargeType }[] = [
  { label: 'Flat monthly fee', value: 'FLAT' },
  { label: 'Per person', value: 'PER_PERSON' },
  { label: 'Per vehicle', value: 'PER_VEHICLE' },
]

const sourceColor: Record<ResolvedFixedCharge['source'], string> = {
  BUILDING_DEFAULT: 'blue',
  ROOM_OVERRIDE: 'gold',
  CONTRACT_OVERRIDE: 'green',
}

const currency = vndCurrency

const formatDate = (value: string | null | undefined) => (value ? dayjs(value).format('DD/MM/YYYY') : '-')
const formatMonth = (value: string | null | undefined) => (value ? dayjs(value).format('MM/YYYY') : '-')
const toDateInput = (value: string | null | undefined) => (value ? dayjs(value).format('YYYY-MM-DD') : undefined)
const toMonthInput = (value: string | null | undefined) => (value ? dayjs(value).format('YYYY-MM') : undefined)
const monthToDate = (value: string) => (value.length === 7 ? `${value}-01` : value)
const nullableText = (value: string | undefined) => {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

const typeTag = (type: ChargeType) => {
  const option = chargeTypeOptions.find((item) => item.value === type)
  return <Tag>{option?.label ?? type}</Tag>
}

const activeTag = (active: boolean) => <Tag color={active ? 'green' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>

export function FixedChargesPage() {
  const { t } = useI18n()
  const screens = Grid.useBreakpoint()
  const [catalogForm] = Form.useForm<CatalogFormValues>()
  const [chargeForm] = Form.useForm<ChargeFormValues>()
  const [extraForm] = Form.useForm<ExtraFormValues>()
  const [previewForm] = Form.useForm<PreviewFormValues>()

  const [activeTab, setActiveTab] = useState<TabKey>('catalog')
  const [buildings, setBuildings] = useState<BuildingOption[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [contracts, setContracts] = useState<ContractOption[]>([])

  const [catalog, setCatalog] = useState<ChargeCatalog[]>([])
  const [buildingCharges, setBuildingCharges] = useState<BuildingCharge[]>([])
  const [roomOverrides, setRoomOverrides] = useState<RoomChargeOverride[]>([])
  const [contractOverrides, setContractOverrides] = useState<ContractChargeOverride[]>([])
  const [extras, setExtras] = useState<RoomMonthExtra[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [drawerKind, setDrawerKind] = useState<EditableKind | null>(null)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('create')
  const [editingId, setEditingId] = useState<string | null>(null)

  const [buildingFilter, setBuildingFilter] = useState<string | undefined>()
  const [roomFilter, setRoomFilter] = useState<string | undefined>()
  const [contractFilter, setContractFilter] = useState<string | undefined>()
  const [monthFilter, setMonthFilter] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<ResolvedFixedChargePreview | null>(null)

  const selectedChargeBuilding = Form.useWatch('building_id', chargeForm)
  const selectedChargeRoom = Form.useWatch('room_id', chargeForm)
  const selectedExtraBuilding = Form.useWatch('building_id', extraForm)

  const loadOptions = useCallback(async () => {
    try {
      const [buildingRows, roomRows, contractRows] = await Promise.all([
        listBuildings(),
        listRooms(),
        listContracts(),
      ])
      setBuildings(buildingRows)
      setRooms(roomRows)
      setContracts(contractRows)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Unable to load the fixed charge form options.'))
    }
  }, [])

  const loadTables = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [catalogRows, buildingRows, roomRows, contractRows, extraRows] = await Promise.all([
        listChargeCatalog(),
        listBuildingCharges(),
        listRoomChargeOverrides(),
        listContractChargeOverrides(),
        listRoomMonthExtras(),
      ])
      setCatalog(catalogRows)
      setBuildingCharges(buildingRows)
      setRoomOverrides(roomRows)
      setContractOverrides(contractRows)
      setExtras(extraRows)
    } catch (error) {
      setError(getUserErrorMessage(error, 'Khong tai duoc danh sach khoan phi.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOptions()
    void loadTables()
  }, [loadOptions, loadTables])

  const activeCatalog = useMemo(() => catalog.filter((item) => item.is_active), [catalog])

  const filteredRooms = useMemo(() => {
    if (!buildingFilter) return rooms
    return rooms.filter((room) => room.building_id === buildingFilter)
  }, [buildingFilter, rooms])

  const formRooms = useMemo(() => {
    if (!selectedChargeBuilding) return rooms
    return rooms.filter((room) => room.building_id === selectedChargeBuilding)
  }, [rooms, selectedChargeBuilding])

  const extraFormRooms = useMemo(() => {
    if (!selectedExtraBuilding) return rooms
    return rooms.filter((room) => room.building_id === selectedExtraBuilding)
  }, [rooms, selectedExtraBuilding])

  const filteredContracts = useMemo(() => {
    return contracts.filter((contract) => {
      if (buildingFilter && contract.building_id !== buildingFilter) return false
      if (roomFilter && contract.room_id !== roomFilter) return false
      return true
    })
  }, [buildingFilter, contracts, roomFilter])

  const formContracts = useMemo(() => {
    return contracts.filter((contract) => {
      if (selectedChargeBuilding && contract.building_id !== selectedChargeBuilding) return false
      if (selectedChargeRoom && contract.room_id !== selectedChargeRoom) return false
      return true
    })
  }, [contracts, selectedChargeBuilding, selectedChargeRoom])

  const visibleBuildingCharges = useMemo(
    () => buildingCharges.filter((item) => !buildingFilter || item.building_id === buildingFilter),
    [buildingCharges, buildingFilter],
  )

  const visibleRoomOverrides = useMemo(
    () => roomOverrides.filter((item) => (!buildingFilter || item.building_id === buildingFilter) && (!roomFilter || item.room_id === roomFilter)),
    [buildingFilter, roomFilter, roomOverrides],
  )

  const visibleContractOverrides = useMemo(
    () =>
      contractOverrides.filter((item) =>
        (!buildingFilter || item.building_id === buildingFilter) &&
        (!roomFilter || item.room_id === roomFilter) &&
        (!contractFilter || item.contract_id === contractFilter)
      ),
    [buildingFilter, contractFilter, contractOverrides, roomFilter],
  )

  const visibleExtras = useMemo(
    () =>
      extras.filter((item) =>
        (!buildingFilter || item.building_id === buildingFilter) &&
        (!roomFilter || item.room_id === roomFilter) &&
        (!monthFilter || dayjs(item.month).format('YYYY-MM') === monthFilter)
      ),
    [buildingFilter, extras, monthFilter, roomFilter],
  )

  const openCreate = useCallback((kind: EditableKind) => {
    setDrawerKind(kind)
    setDrawerMode('create')
    setEditingId(null)
    catalogForm.resetFields()
    chargeForm.resetFields()
    extraForm.resetFields()

    if (kind === 'catalog') {
      catalogForm.setFieldsValue({ charge_type: 'FLAT', is_active: true })
    } else if (kind === 'extra') {
      extraForm.setFieldsValue({ month: dayjs().format('YYYY-MM'), persons_count: null, vehicles_count: null })
    } else {
      chargeForm.setFieldsValue({
        effective_from: dayjs().startOf('month').format('YYYY-MM-DD'),
        unit_price: 0,
        is_active: true,
      })
    }
  }, [catalogForm, chargeForm, extraForm])

  const openEditCatalog = useCallback((item: ChargeCatalog) => {
    setDrawerKind('catalog')
    setDrawerMode('edit')
    setEditingId(item.id)
    catalogForm.resetFields()
    catalogForm.setFieldsValue({
      code: item.code,
      name: item.name,
      charge_type: item.charge_type,
      is_active: item.is_active,
      note: item.note ?? undefined,
    })
  }, [catalogForm])

  const openEditBuildingCharge = useCallback((item: BuildingCharge) => {
    setDrawerKind('building')
    setDrawerMode('edit')
    setEditingId(item.id)
    chargeForm.resetFields()
    chargeForm.setFieldsValue({
      building_id: item.building_id,
      charge_id: item.charge_id,
      unit_price: item.unit_price,
      effective_from: toDateInput(item.effective_from),
      is_active: item.is_active,
    })
  }, [chargeForm])

  const openEditRoomOverride = useCallback((item: RoomChargeOverride) => {
    setDrawerKind('room')
    setDrawerMode('edit')
    setEditingId(item.id)
    chargeForm.resetFields()
    chargeForm.setFieldsValue({
      building_id: item.building_id,
      room_id: item.room_id,
      charge_id: item.charge_id,
      unit_price: item.unit_price,
      effective_from: toDateInput(item.effective_from),
      is_active: item.is_active,
    })
  }, [chargeForm])

  const openEditContractOverride = useCallback((item: ContractChargeOverride) => {
    setDrawerKind('contract')
    setDrawerMode('edit')
    setEditingId(item.id)
    chargeForm.resetFields()
    chargeForm.setFieldsValue({
      building_id: item.building_id,
      room_id: item.room_id,
      contract_id: item.contract_id,
      charge_id: item.charge_id,
      unit_price: item.unit_price,
      effective_from: toDateInput(item.effective_from),
      effective_to: toDateInput(item.effective_to),
      is_active: item.is_active,
    })
  }, [chargeForm])

  const openEditExtra = useCallback((item: RoomMonthExtra) => {
    setDrawerKind('extra')
    setDrawerMode('edit')
    setEditingId(item.id)
    extraForm.resetFields()
    extraForm.setFieldsValue({
      building_id: item.building_id,
      room_id: item.room_id,
      month: toMonthInput(item.month),
      persons_count: item.persons_count,
      vehicles_count: item.vehicles_count,
      note: item.note ?? undefined,
    })
  }, [extraForm])

  const closeDrawer = useCallback(() => {
    setDrawerKind(null)
    setEditingId(null)
  }, [])

  const submitCatalog = useCallback(async () => {
    const values = await catalogForm.validateFields()
    if (!values.code || !values.name || !values.charge_type) {
      throw new Error('Please complete the required charge catalog fields.')
    }

    const payload: ChargeCatalogPayload = {
      code: values.code,
      name: values.name,
      charge_type: values.charge_type,
      is_active: values.is_active ?? true,
      note: nullableText(values.note),
    }

    if (drawerMode === 'create') {
      await createChargeCatalog(payload)
      message.success('Charge catalog item created')
    } else if (editingId) {
      await updateChargeCatalog(editingId, payload)
      message.success('Charge catalog item updated')
    }
  }, [catalogForm, drawerMode, editingId])

  const submitCharge = useCallback(async () => {
    const values = await chargeForm.validateFields()
    if (!values.charge_id || values.unit_price === undefined || !values.effective_from) {
      throw new Error('Please complete the required charge fields.')
    }

    if (drawerKind === 'building') {
      if (!values.building_id) throw new Error('Please select a building.')
      const payload: BuildingChargePayload = {
        building_id: values.building_id,
        charge_id: values.charge_id,
        unit_price: values.unit_price,
        effective_from: values.effective_from,
        is_active: values.is_active ?? true,
      }
      if (drawerMode === 'create') {
        await createBuildingCharge(payload)
        message.success('Building charge created')
      } else if (editingId) {
        await updateBuildingCharge(editingId, payload)
        message.success('Building charge updated')
      }
    }

    if (drawerKind === 'room') {
      if (!values.room_id) throw new Error('Please select a room.')
      const payload: RoomChargeOverridePayload = {
        room_id: values.room_id,
        charge_id: values.charge_id,
        unit_price: values.unit_price,
        effective_from: values.effective_from,
        is_active: values.is_active ?? true,
      }
      if (drawerMode === 'create') {
        await createRoomChargeOverride(payload)
        message.success('Room override created')
      } else if (editingId) {
        await updateRoomChargeOverride(editingId, payload)
        message.success('Room override updated')
      }
    }

    if (drawerKind === 'contract') {
      if (!values.contract_id) throw new Error('Please select a contract.')
      const payload: ContractChargeOverridePayload = {
        contract_id: values.contract_id,
        charge_id: values.charge_id,
        unit_price: values.unit_price,
        effective_from: values.effective_from,
        effective_to: nullableText(values.effective_to),
        is_active: values.is_active ?? true,
      }
      if (drawerMode === 'create') {
        await createContractChargeOverride(payload)
        message.success('Contract override created')
      } else if (editingId) {
        await updateContractChargeOverride(editingId, payload)
        message.success('Contract override updated')
      }
    }
  }, [chargeForm, drawerKind, drawerMode, editingId])

  const submitExtra = useCallback(async () => {
    const values = await extraForm.validateFields()
    if (!values.room_id || !values.month) {
      throw new Error('Please select a room and month.')
    }

    const payload: RoomMonthExtraPayload = {
      room_id: values.room_id,
      month: monthToDate(values.month),
      persons_count: values.persons_count ?? null,
      vehicles_count: values.vehicles_count ?? null,
      note: nullableText(values.note),
    }

    if (drawerMode === 'create') {
      await createRoomMonthExtra(payload)
      message.success('Monthly extras created')
    } else if (editingId) {
      await updateRoomMonthExtra(editingId, payload)
      message.success('Monthly extras updated')
    }
  }, [drawerMode, editingId, extraForm])

  const submitDrawer = useCallback(async () => {
    if (!drawerKind) return
    setSaving(true)

    try {
      if (drawerKind === 'catalog') await submitCatalog()
      else if (drawerKind === 'extra') await submitExtra()
      else await submitCharge()

      closeDrawer()
      await loadTables()
    } catch (error: unknown) {
      if (drawerKind === 'catalog') applyApiFieldErrors(catalogForm, error)
      else if (drawerKind === 'extra') applyApiFieldErrors(extraForm, error)
      else applyApiFieldErrors(chargeForm, error)
      message.error(getFormErrorMessage(error, 'Unable to save the fixed charge.'))
    } finally {
      setSaving(false)
    }
  }, [catalogForm, chargeForm, closeDrawer, drawerKind, extraForm, loadTables, submitCatalog, submitCharge, submitExtra])

  const confirmDelete = useCallback((kind: EditableKind, id: string, title: string) => {
    Modal.confirm({
      title: `Delete ${title}?`,
      content: kind === 'catalog' ? 'Catalog entries are deactivated so existing invoices remain readable.' : 'This action cannot be undone.',
      okText: kind === 'catalog' ? 'Deactivate' : 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          if (kind === 'catalog') await deleteChargeCatalog(id)
          if (kind === 'building') await deleteBuildingCharge(id)
          if (kind === 'room') await deleteRoomChargeOverride(id)
          if (kind === 'contract') await deleteContractChargeOverride(id)
          if (kind === 'extra') await deleteRoomMonthExtra(id)
          message.success(kind === 'catalog' ? 'Catalog item deactivated' : 'Fixed charge deleted')
          await loadTables()
        } catch (error) {
          message.error(getUserErrorMessage(error, 'Khong the xoa khoan phi.'))
          throw error
        }
      },
    })
  }, [loadTables])

  const submitPreview = useCallback(async () => {
    setPreviewLoading(true)
    try {
      const values = await previewForm.validateFields()
      if (!values.contract_id || !values.month) {
        throw new Error('Please select a contract and month.')
      }
      setPreview(await resolveFixedCharges(values.contract_id, monthToDate(values.month)))
    } catch (error) {
      applyApiFieldErrors(previewForm, error)
      message.error(getFormErrorMessage(error, 'Unable to calculate the fixed charges.'))
    } finally {
      setPreviewLoading(false)
    }
  }, [previewForm])

  const catalogColumns: ColumnsType<ChargeCatalog> = useMemo(
    () => [
      { title: t("Code"), dataIndex: 'code', width: 150 },
      { title: t("Name"), dataIndex: 'name', width: 220 },
      { title: t("Type"), dataIndex: 'charge_type', width: 160, render: (value: ChargeType) => typeTag(value) },
      { title: t("Status"), dataIndex: 'is_active', width: 120, render: (value: boolean) => activeTag(value) },
      { title: t("Note"), dataIndex: 'note', render: (value: string | null) => value ?? '-' },
      {
        title: t("Actions"),
        key: 'actions',
        width: 120,
        fixed: 'right',
        render: (_, item) => (
          <Space>
            <Button type="text" icon={<EditOutlined />} onClick={() => openEditCatalog(item)} />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => confirmDelete('catalog', item.id, item.code)} />
          </Space>
        ),
      },
    ],
    [confirmDelete, openEditCatalog, t],
  )

  const buildingColumns: ColumnsType<BuildingCharge> = useMemo(
    () => [
      { title: t("Building"), dataIndex: 'building_name', width: 220 },
      { title: t("Charge"), key: 'charge', width: 240, render: (_, item) => `${item.charge_code} - ${item.charge_name}` },
      { title: t("Type"), dataIndex: 'charge_type', width: 150, render: (value: ChargeType) => typeTag(value) },
      { title: t("Unit price"), dataIndex: 'unit_price', width: 150, align: 'right', render: (value: number) => currency.format(value) },
      { title: t("Effective from"), dataIndex: 'effective_from', width: 150, render: (value: string) => formatDate(value) },
      { title: t("Status"), dataIndex: 'is_active', width: 120, render: (value: boolean) => activeTag(value) },
      {
        title: t("Actions"),
        key: 'actions',
        width: 120,
        fixed: 'right',
        render: (_, item) => (
          <Space>
            <Button type="text" icon={<EditOutlined />} onClick={() => openEditBuildingCharge(item)} />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => confirmDelete('building', item.id, item.charge_code)} />
          </Space>
        ),
      },
    ],
    [confirmDelete, openEditBuildingCharge, t],
  )

  const roomColumns: ColumnsType<RoomChargeOverride> = useMemo(
    () => [
      { title: t("Building"), dataIndex: 'building_name', width: 200 },
      { title: t("Room"), dataIndex: 'room_code', width: 120 },
      { title: t("Charge"), key: 'charge', width: 240, render: (_, item) => `${item.charge_code} - ${item.charge_name}` },
      { title: t("Type"), dataIndex: 'charge_type', width: 150, render: (value: ChargeType) => typeTag(value) },
      { title: t("Unit price"), dataIndex: 'unit_price', width: 150, align: 'right', render: (value: number) => currency.format(value) },
      { title: t("Effective from"), dataIndex: 'effective_from', width: 150, render: (value: string) => formatDate(value) },
      { title: t("Status"), dataIndex: 'is_active', width: 120, render: (value: boolean) => activeTag(value) },
      {
        title: t("Actions"),
        key: 'actions',
        width: 120,
        fixed: 'right',
        render: (_, item) => (
          <Space>
            <Button type="text" icon={<EditOutlined />} onClick={() => openEditRoomOverride(item)} />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => confirmDelete('room', item.id, item.charge_code)} />
          </Space>
        ),
      },
    ],
    [confirmDelete, openEditRoomOverride, t],
  )

  const contractColumns: ColumnsType<ContractChargeOverride> = useMemo(
    () => [
      { title: t("Building"), dataIndex: 'building_name', width: 180 },
      { title: t("Room"), dataIndex: 'room_code', width: 110 },
      {
        title: t("Contract"),
        key: 'contract',
        width: 260,
        render: (_, item) => item.contract_code ? `${item.contract_code} - ${item.tenant_name ?? item.contract_id}` : item.tenant_name ?? item.contract_id,
      },
      { title: t("Charge"), key: 'charge', width: 220, render: (_, item) => `${item.charge_code} - ${item.charge_name}` },
      { title: t("Unit price"), dataIndex: 'unit_price', width: 140, align: 'right', render: (value: number) => currency.format(value) },
      { title: t("From"), dataIndex: 'effective_from', width: 120, render: (value: string) => formatDate(value) },
      { title: t("To"), dataIndex: 'effective_to', width: 120, render: (value: string | null) => formatDate(value) },
      { title: t("Status"), dataIndex: 'is_active', width: 120, render: (value: boolean) => activeTag(value) },
      {
        title: t("Actions"),
        key: 'actions',
        width: 120,
        fixed: 'right',
        render: (_, item) => (
          <Space>
            <Button type="text" icon={<EditOutlined />} onClick={() => openEditContractOverride(item)} />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => confirmDelete('contract', item.id, item.charge_code)} />
          </Space>
        ),
      },
    ],
    [confirmDelete, openEditContractOverride, t],
  )

  const extraColumns: ColumnsType<RoomMonthExtra> = useMemo(
    () => [
      { title: t("Month"), dataIndex: 'month', width: 120, render: (value: string) => formatMonth(value) },
      { title: t("Building"), dataIndex: 'building_name', width: 200 },
      { title: t("Room"), dataIndex: 'room_code', width: 120 },
      { title: t("Persons"), dataIndex: 'persons_count', width: 120, render: (value: number | null) => value ?? '-' },
      { title: t("Vehicles"), dataIndex: 'vehicles_count', width: 120, render: (value: number | null) => value ?? '-' },
      { title: t("Note"), dataIndex: 'note', render: (value: string | null) => value ?? '-' },
      {
        title: t("Actions"),
        key: 'actions',
        width: 120,
        fixed: 'right',
        render: (_, item) => (
          <Space>
            <Button type="text" icon={<EditOutlined />} onClick={() => openEditExtra(item)} />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => confirmDelete('extra', item.id, item.room_code)} />
          </Space>
        ),
      },
    ],
    [confirmDelete, openEditExtra, t],
  )

  const previewColumns: ColumnsType<ResolvedFixedCharge> = useMemo(
    () => [
      { title: t("Charge"), key: 'charge', width: 240, render: (_, item) => `${item.charge_code} - ${item.charge_name}` },
      { title: t("Type"), dataIndex: 'charge_type', width: 150, render: (value: ChargeType) => typeTag(value) },
      { title: t("Source"), dataIndex: 'source', width: 170, render: (value: ResolvedFixedCharge['source']) => <Tag color={sourceColor[value]}>{value}</Tag> },
      { title: t("Quantity"), dataIndex: 'quantity', width: 110, align: 'right' },
      { title: t("Unit price"), dataIndex: 'unit_price', width: 150, align: 'right', render: (value: number) => currency.format(value) },
      { title: t("Amount"), dataIndex: 'amount', width: 150, align: 'right', render: (value: number) => currency.format(value) },
      { title: t("Effective from"), dataIndex: 'effective_from', width: 150, render: (value: string) => formatDate(value) },
    ],
    [t],
  )

  const renderFilters = (includeContract = false, includeMonth = false) => (
    <div className="fixed-charges-filters">
      <Select
        value={buildingFilter}
        placeholder={t("Building")}
        allowClear
        options={buildings.map((building) => ({ label: building.name, value: building.id }))}
        onChange={(value) => {
          setBuildingFilter(value)
          setRoomFilter(undefined)
          setContractFilter(undefined)
        }}
      />
      <Select
        value={roomFilter}
        placeholder={t("Room")}
        allowClear
        options={filteredRooms.map((room) => ({ label: room.code, value: room.id }))}
        onChange={(value) => {
          setRoomFilter(value)
          setContractFilter(undefined)
        }}
      />
      {includeContract ? (
        <Select
          value={contractFilter}
          placeholder={t("Contract")}
          allowClear
          options={filteredContracts.map((contract) => ({
            label: contract.contract_code ? `${contract.contract_code} - ${contract.tenant_name ?? contract.id}` : contract.tenant_name ?? contract.id,
            value: contract.id,
          }))}
          onChange={(value) => setContractFilter(value)}
        />
      ) : includeMonth ? (
        <Input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} />
      ) : (
        <span />
      )}
      <Button icon={<ReloadOutlined />} onClick={() => void loadTables()}>
        {t("Refresh")}
      </Button>
    </div>
  )

  const currentCreateKind = activeTab === 'preview' ? null : activeTab
  const createLabel = activeTab === 'catalog'
    ? 'New Catalog Item'
    : activeTab === 'building'
      ? 'New Building Charge'
      : activeTab === 'room'
        ? 'New Room Override'
        : activeTab === 'contract'
          ? 'New Contract Override'
          : 'New Monthly Extras'

  return (
    <>
    <div className="fixed-charges-page">
      <Card>
        <div className="fixed-charges-toolbar">
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {t("Fixed Charges")}
            </Typography.Title>
            <Typography.Text type="secondary">
              {t("Configure recurring fees, priority overrides, and monthly person/vehicle counts for invoice generation.")}
            </Typography.Text>
          </div>
          {currentCreateKind ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate(currentCreateKind)}>
              {createLabel}
            </Button>
          ) : null}
        </div>
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TabKey)}
        items={[
          {
            key: 'catalog',
            label: t("Catalog"),
            children: <ChargeCatalogPanel loading={loading} error={error} items={catalog} columns={catalogColumns} onRetry={() => void loadTables()} />,
          },
          {
            key: 'building',
            label: t("Building Defaults"),
            children: <ChargeAssignmentPanel filters={renderFilters()} loading={loading} items={visibleBuildingCharges} columns={buildingColumns} scrollWidth={1120} />,
          },
          {
            key: 'room',
            label: t("Room Overrides"),
            children: <ChargeAssignmentPanel filters={renderFilters()} loading={loading} items={visibleRoomOverrides} columns={roomColumns} scrollWidth={1240} />,
          },
          {
            key: 'contract',
            label: t("Contract Overrides"),
            children: <ChargeAssignmentPanel filters={renderFilters(true)} loading={loading} items={visibleContractOverrides} columns={contractColumns} scrollWidth={1460} />,
          },
          {
            key: 'extra',
            label: t("Monthly Extras"),
            children: <MonthlyExtrasPanel filters={renderFilters(false, true)} loading={loading} items={visibleExtras} columns={extraColumns} />,
          },
          {
            key: 'preview',
            label: t("Resolved Charges"),
            children: (
              <Card>
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <div className="fixed-charges-preview-header">
                    <div>
                      <Typography.Text strong>{t("Resolve preview")}</Typography.Text>
                      <br />
                      <Typography.Text type="secondary">{t("Shows priority result: contract override, then room override, then building default.")}</Typography.Text>
                    </div>
                    {preview ? <Typography.Text strong>{t("Total:")} {currency.format(preview.total)}</Typography.Text> : null}
                  </div>
                  <Form form={previewForm} layout="vertical" className="fixed-charges-preview-form" initialValues={{ month: dayjs().format('YYYY-MM') }}>
                    <Form.Item name="contract_id" label={t("Contract")} rules={[{ required: true, message: t("Please select contract") }]}>
                      <Select
                        showSearch
                        optionFilterProp="label"
                        options={contracts.map((contract) => ({
                          label: `${contract.building_name} / ${contract.room_code} - ${contract.tenant_name ?? contract.contract_code ?? contract.id}`,
                          value: contract.id,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item name="month" label={t("Month")} rules={[{ required: true, message: t("Please select month") }]}>
                      <Input type="month" />
                    </Form.Item>
                    <Form.Item label=" ">
                      <Button type="primary" loading={previewLoading} onClick={() => void submitPreview()}>
                        {t("Resolve")}
                      </Button>
                    </Form.Item>
                  </Form>
                  <Table<ResolvedFixedCharge>
                    rowKey={(item) => `${item.source}-${item.source_id}`}
                    columns={previewColumns}
                    dataSource={preview?.items ?? []}
                    loading={previewLoading}
                    scroll={{ x: 1060 }}
                    locale={{ emptyText: <Empty description={t("No resolved charges")} /> }}
                  />
                </Space>
              </Card>
            ),
          },
        ]}
      />

      <Drawer
        open={Boolean(drawerKind)}
        title={`${drawerMode === 'create' ? 'Create' : 'Edit'} ${drawerKind ?? ''}`}
        placement="right"
        width={screens.md ? 560 : '100%'}
        onClose={closeDrawer}
        destroyOnClose
      >
        {drawerKind === 'catalog' ? (
          <Form form={catalogForm} layout="vertical">
            <div className="fixed-charge-form-grid">
              <Form.Item name="code" label={t("Code")} rules={[{ required: true, whitespace: true, message: t("Please enter code") }]}>
                <Input placeholder={t("WIFI")} />
              </Form.Item>
              <Form.Item name="charge_type" label={t("Charge type")} rules={[{ required: true, message: t("Please select type") }]}>
                <Select options={chargeTypeOptions} />
              </Form.Item>
              <Form.Item name="name" label={t("Name")} rules={[{ required: true, whitespace: true, message: t("Please enter name") }]} className="fixed-charge-form-full">
                <Input placeholder={t("Wifi fee")} />
              </Form.Item>
              <Form.Item name="is_active" label={t("Active")} valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="note" label={t("Note")} className="fixed-charge-form-full">
                <Input.TextArea rows={3} />
              </Form.Item>
            </div>
          </Form>
        ) : drawerKind === 'extra' ? (
          <Form form={extraForm} layout="vertical">
            <div className="fixed-charge-form-grid">
              <Form.Item name="building_id" label={t("Building")}>
                <Select
                  allowClear
                  options={buildings.map((building) => ({ label: building.name, value: building.id }))}
                  onChange={() => extraForm.setFieldValue('room_id', undefined)}
                />
              </Form.Item>
              <Form.Item name="room_id" label={t("Room")} rules={[{ required: true, message: t("Please select room") }]}>
                <Select options={extraFormRooms.map((room) => ({ label: room.code, value: room.id }))} />
              </Form.Item>
              <Form.Item name="month" label={t("Month")} rules={[{ required: true, message: t("Please select month") }]}>
                <Input type="month" />
              </Form.Item>
              <Form.Item name="persons_count" label={t("Persons count")}>
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="vehicles_count" label={t("Vehicles count")}>
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="note" label={t("Note")} className="fixed-charge-form-full">
                <Input.TextArea rows={3} />
              </Form.Item>
            </div>
          </Form>
        ) : drawerKind ? (
          <Form form={chargeForm} layout="vertical">
            <div className="fixed-charge-form-grid">
              {drawerKind === 'building' || drawerKind === 'room' || drawerKind === 'contract' ? (
                <Form.Item name="building_id" label={t("Building")} rules={drawerKind === 'building' ? [{ required: true, message: t("Please select building") }] : undefined}>
                  <Select
                    allowClear={drawerKind !== 'building'}
                    options={buildings.map((building) => ({ label: building.name, value: building.id }))}
                    onChange={() => chargeForm.setFieldsValue({ room_id: undefined, contract_id: undefined })}
                  />
                </Form.Item>
              ) : null}

              {drawerKind === 'room' || drawerKind === 'contract' ? (
                <Form.Item name="room_id" label={t("Room")} rules={drawerKind === 'room' ? [{ required: true, message: t("Please select room") }] : undefined}>
                  <Select
                    allowClear={drawerKind !== 'room'}
                    options={formRooms.map((room) => ({ label: room.code, value: room.id }))}
                    onChange={() => chargeForm.setFieldValue('contract_id', undefined)}
                  />
                </Form.Item>
              ) : null}

              {drawerKind === 'contract' ? (
                <Form.Item name="contract_id" label={t("Contract")} rules={[{ required: true, message: t("Please select contract") }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={formContracts.map((contract) => ({
                      label: `${contract.building_name} / ${contract.room_code} - ${contract.tenant_name ?? contract.contract_code ?? contract.id}`,
                      value: contract.id,
                    }))}
                  />
                </Form.Item>
              ) : null}

              <Form.Item name="charge_id" label={t("Charge")} rules={[{ required: true, message: t("Please select charge") }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={(drawerMode === 'create' ? activeCatalog : catalog).map((item) => ({
                    label: `${item.code} - ${item.name}`,
                    value: item.id,
                  }))}
                />
              </Form.Item>
              <Form.Item name="unit_price" label={t("Unit price")} rules={[{ required: true, message: t("Please enter unit price") }]}>
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="effective_from" label={t("Effective from")} rules={[{ required: true, message: t("Please select effective date") }]}>
                <Input type="date" />
              </Form.Item>
              {drawerKind === 'contract' ? (
                <Form.Item name="effective_to" label={t("Effective to")}>
                  <Input type="date" />
                </Form.Item>
              ) : null}
              <Form.Item name="is_active" label={t("Active")} valuePropName="checked">
                <Switch />
              </Form.Item>
            </div>
          </Form>
        ) : null}

        <div className="fixed-charge-drawer-actions">
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeDrawer}>{t("Cancel")}</Button>
            <Button type="primary" loading={saving} onClick={() => void submitDrawer()}>
              {t("Save")}
            </Button>
          </Space>
        </div>
      </Drawer>
    </div>
    </>
  )
}
