import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
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
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createTenant,
  deleteTenant,
  getTenant,
  listBuildings,
  listRooms,
  listTenants,
  updateTenant,
} from '../../services/tenantsService'
import type {
  BuildingOption,
  ContractStatus,
  RoomOption,
  TenantDetail,
  TenantFormPayload,
  TenantListItem,
  TenantStatus,
} from './types'
import './TenantsPage.css'

interface TenantFormValues {
  full_name: string
  dob?: string
  gender?: string
  identity_number: string
  identity_issued_date?: string
  identity_issued_place?: string
  email?: string
  phone: string
  permanent_address?: string
  status: TenantStatus
  note?: string
  rental: {
    building_id?: string
    room_id?: string
    contract_code?: string
    contract_status?: ContractStatus
    start_date?: string
    end_date?: string
    move_in_date?: string
    move_out_date?: string
    rent_price?: number
    deposit_amount?: number
    billing_day?: number
    contract_note?: string
  }
}

const statusOptions: { label: string; value: TenantStatus; color: string }[] = [
  { label: 'Active', value: 'ACTIVE', color: 'green' },
  { label: 'Moved Out', value: 'MOVED_OUT', color: 'gold' },
  { label: 'Blacklist', value: 'BLACKLIST', color: 'red' },
]

const contractStatusOptions: { label: string; value: ContractStatus }[] = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Ended', value: 'ENDED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]

const defaultFormValues: TenantFormValues = {
  full_name: '',
  phone: '',
  identity_number: '',
  status: 'ACTIVE',
  rental: {
    contract_status: 'DRAFT',
    billing_day: 1,
  },
}

const tenantInfoFieldNames = new Set([
  'full_name',
  'dob',
  'gender',
  'identity_number',
  'identity_issued_date',
  'identity_issued_place',
  'email',
  'phone',
  'permanent_address',
  'status',
  'note',
])

export function TenantsPage() {
  const screens = Grid.useBreakpoint()
  const isDesktop = Boolean(screens.xl)
  const isMobile = !screens.md
  const [form] = Form.useForm<TenantFormValues>()

  const initialSnapshotRef = useRef('')
  const didInitFormRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<TenantListItem[]>([])
  const [selectedTenant, setSelectedTenant] = useState<TenantDetail | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TenantStatus | undefined>(undefined)
  const [buildingFilter, setBuildingFilter] = useState<string | undefined>(undefined)
  const [roomFilter, setRoomFilter] = useState<string | undefined>(undefined)
  const [buildingOptions, setBuildingOptions] = useState<BuildingOption[]>([])
  const [roomOptions, setRoomOptions] = useState<RoomOption[]>([])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [canSave, setCanSave] = useState(false)
  const [discardModalOpen, setDiscardModalOpen] = useState(false)
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null)
  const [drawerInitialValues, setDrawerInitialValues] = useState<TenantFormValues>(defaultFormValues)
  const [activeFormTab, setActiveFormTab] = useState<'tenant' | 'rental'>('tenant')

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const loadOptions = useCallback(async () => {
    const [buildings, rooms] = await Promise.all([listBuildings(), listRooms()])
    setBuildingOptions(buildings)
    setRoomOptions(rooms)
  }, [])

  const loadTenants = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await listTenants({
        search: debouncedSearch,
        status: statusFilter,
        building_id: buildingFilter,
        room_id: roomFilter,
      })
      setItems(data)
    } catch {
      setError('Unable to load tenants. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter, buildingFilter, roomFilter])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  useEffect(() => {
    void loadTenants()
  }, [loadTenants])

  const hasFormErrors = useCallback(() => form.getFieldsError().some((field) => field.errors.length > 0), [form])

  const isDirty = useCallback(() => JSON.stringify(form.getFieldsValue(true)) !== initialSnapshotRef.current, [form])

  const recalculateCanSave = useCallback(() => {
    const touched = form.isFieldsTouched(true)
    setCanSave(touched && !hasFormErrors() && isDirty())
  }, [form, hasFormErrors, isDirty])

  useEffect(() => {
    if (!drawerOpen) {
      didInitFormRef.current = false
      return
    }

    if (didInitFormRef.current) {
      return
    }

    form.resetFields()
    form.setFieldsValue(drawerInitialValues)
    initialSnapshotRef.current = JSON.stringify(drawerInitialValues)
    setCanSave(false)
    setActiveFormTab('tenant')
    didInitFormRef.current = true
  }, [drawerOpen, drawerInitialValues, form])

  const filteredRoomsForFilter = useMemo(() => {
    if (!buildingFilter) {
      return roomOptions
    }
    return roomOptions.filter((room) => room.building_id === buildingFilter)
  }, [buildingFilter, roomOptions])

  const selectedRentalBuildingId = Form.useWatch(['rental', 'building_id'], form)

  const filteredRoomsForDrawer = useMemo(() => {
    if (!selectedRentalBuildingId) {
      return roomOptions
    }

    return roomOptions.filter((room) => room.building_id === selectedRentalBuildingId)
  }, [roomOptions, selectedRentalBuildingId])

  const openCreate = useCallback(() => {
    setDrawerMode('create')
    setEditingTenantId(null)
    setDrawerInitialValues(defaultFormValues)
    setDiscardModalOpen(false)
    setDrawerOpen(true)
  }, [])

  const openEdit = useCallback(async (id: string) => {
    setDrawerMode('edit')
    setEditingTenantId(id)
    setDiscardModalOpen(false)
    setDrawerLoading(true)
    setDrawerOpen(true)

    try {
      const data = await getTenant(id)
      const values: TenantFormValues = {
        full_name: data.full_name,
        phone: data.phone,
        identity_number: data.identity_number,
        status: data.status,
        dob: data.dob ?? undefined,
        gender: data.gender ?? undefined,
        identity_issued_date: data.identity_issued_date ?? undefined,
        identity_issued_place: data.identity_issued_place ?? undefined,
        email: data.email ?? undefined,
        permanent_address: data.permanent_address ?? undefined,
        note: data.note ?? undefined,
        rental: {
          building_id: data.current_room?.building_id,
          room_id: data.current_room?.room_id,
          contract_code: data.current_contract?.contract_code ?? undefined,
          contract_status: data.current_contract?.status ?? 'DRAFT',
          start_date: data.current_contract?.start_date ?? undefined,
          end_date: data.current_contract?.end_date ?? undefined,
          move_in_date: data.current_contract?.move_in_date ?? undefined,
          move_out_date: data.current_contract?.move_out_date ?? undefined,
          rent_price: data.current_contract?.rent_price,
          deposit_amount: data.current_contract?.deposit_amount,
          billing_day: data.current_contract?.billing_day,
          contract_note: data.current_contract?.note ?? undefined,
        },
      }

      didInitFormRef.current = false
      setDrawerInitialValues(values)
    } catch {
      message.error('Failed to load tenant data')
      setDrawerOpen(false)
    } finally {
      setDrawerLoading(false)
    }
  }, [])

  const requestCloseDrawer = useCallback(() => {
    if (isDirty()) {
      setDiscardModalOpen(true)
      return
    }

    setDrawerOpen(false)
  }, [isDirty])

  const mapToPayload = useCallback((values: TenantFormValues): TenantFormPayload => {
    const hasRental =
      Boolean(values.rental.room_id) ||
      Boolean(values.rental.start_date) ||
      values.rental.rent_price !== undefined ||
      values.rental.deposit_amount !== undefined

    return {
      tenant: {
        full_name: values.full_name,
        phone: values.phone,
        identity_number: values.identity_number,
        status: values.status,
        dob: values.dob ?? null,
        gender: values.gender ?? null,
        identity_issued_date: values.identity_issued_date ?? null,
        identity_issued_place: values.identity_issued_place ?? null,
        email: values.email ?? null,
        permanent_address: values.permanent_address ?? null,
        note: values.note ?? null,
      },
      contract: hasRental
        ? {
            room_id: values.rental.room_id ?? null,
            contract_code: values.rental.contract_code ?? null,
            status: values.rental.contract_status ?? 'DRAFT',
            start_date: values.rental.start_date ?? null,
            end_date: values.rental.end_date ?? null,
            move_in_date: values.rental.move_in_date ?? null,
            move_out_date: values.rental.move_out_date ?? null,
            rent_price: values.rental.rent_price ?? null,
            deposit_amount: values.rental.deposit_amount ?? null,
            billing_day: values.rental.billing_day ?? null,
            note: values.rental.contract_note ?? null,
          }
        : null,
    }
  }, [])

  const switchToErrorTab = useCallback(
    (fieldNamePath: (string | number)[]) => {
      const [root] = fieldNamePath
      if (root === 'rental') {
        setActiveFormTab('rental')
      } else if (typeof root === 'string' && tenantInfoFieldNames.has(root)) {
        setActiveFormTab('tenant')
      }
    },
    [],
  )

  const submitForm = useCallback(async () => {
    try {
      const values = await form.validateFields()
      const payload = mapToPayload(values)

      setSaveLoading(true)
      if (drawerMode === 'create') {
        await createTenant(payload)
        message.success('Tenant created successfully')
      } else if (editingTenantId) {
        await updateTenant(editingTenantId, payload)
        message.success('Tenant updated successfully')
      }

      setDrawerOpen(false)
      await loadTenants()
    } catch (error: unknown) {
      const formError = error as { errorFields?: Array<{ name: (string | number)[] }> }
      const firstError = formError.errorFields?.[0]
      if (firstError?.name) {
        switchToErrorTab(firstError.name)
        form.scrollToField(firstError.name, { block: 'center' })
      } else {
        message.error('Failed to save tenant')
      }
    } finally {
      setSaveLoading(false)
    }
  }, [drawerMode, editingTenantId, form, loadTenants, mapToPayload, switchToErrorTab])

  const handleDelete = useCallback(
    (id: string) => {
      Modal.confirm({
        title: 'Delete tenant?',
        icon: <ExclamationCircleOutlined />,
        content: 'This action cannot be undone.',
        okText: 'Delete',
        okButtonProps: { danger: true },
        cancelText: 'Cancel',
        async onOk() {
          await deleteTenant(id)
          message.success('Tenant deleted successfully')
          await loadTenants()
        },
      })
    },
    [loadTenants],
  )

  const handleView = useCallback(async (id: string) => {
    setDetailOpen(true)
    setDetailLoading(true)

    try {
      const tenant = await getTenant(id)
      setSelectedTenant(tenant)
    } catch {
      message.error('Failed to load tenant details')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const columns: ColumnsType<TenantListItem> = useMemo(
    () => [
      { title: 'Tenant name', dataIndex: 'full_name', key: 'full_name', width: 180 },
      {
        title: 'Phone / Email',
        key: 'contact',
        width: 220,
        render: (_, item) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{item.phone}</Typography.Text>
            <Typography.Text type="secondary">{item.email ?? '—'}</Typography.Text>
          </Space>
        ),
      },
      { title: 'Identity number', dataIndex: 'identity_number', key: 'identity_number', width: 180 },
      {
        title: 'Current Building / Room',
        key: 'room',
        width: 220,
        render: (_, item) =>
          item.current_room ? (
            `${item.current_room.building_name} / ${item.current_room.room_code}`
          ) : (
            <Typography.Text type="secondary">No active room</Typography.Text>
          ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (value: TenantStatus) => {
          const status = statusOptions.find((item) => item.value === value)
          return <Tag color={status?.color}>{value}</Tag>
        },
      },
      {
        title: 'Updated at',
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 180,
        render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm'),
      },
      {
        title: 'Actions',
        key: 'actions',
        fixed: 'right',
        width: 160,
        render: (_, item) => (
          <Space>
            <Button type="text" icon={<EyeOutlined />} onClick={() => void handleView(item.id)} />
            <Button type="text" icon={<EditOutlined />} onClick={() => void openEdit(item.id)} />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)} />
          </Space>
        ),
      },
    ],
    [handleDelete, handleView, openEdit],
  )

  return (
    <div className="tenants-page">
      <Card>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className="tenants-toolbar">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                Tenants
              </Typography.Title>
              <Typography.Text type="secondary">
                Manage tenant profiles and occupancy from one workspace.
              </Typography.Text>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Add Tenant
            </Button>
          </div>

          <div className="tenants-filters">
            <Input.Search
              placeholder="Search name, phone, email, identity number"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              allowClear
            />
            <Select
              value={statusFilter}
              placeholder="Status"
              allowClear
              options={statusOptions.map((item) => ({ label: item.label, value: item.value }))}
              onChange={(value) => setStatusFilter(value)}
            />
            <Select
              value={buildingFilter}
              placeholder="Building"
              allowClear
              options={buildingOptions.map((building) => ({ label: building.name, value: building.id }))}
              onChange={(value) => {
                setBuildingFilter(value)
                setRoomFilter(undefined)
              }}
            />
            <Select
              value={roomFilter}
              placeholder="Room"
              allowClear
              options={filteredRoomsForFilter.map((room) => ({ label: room.code, value: room.id }))}
              onChange={(value) => setRoomFilter(value)}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void loadTenants()}>
              Retry
            </Button>
          </div>

          {loading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : error ? (
            <Empty description={error}>
              <Button type="primary" onClick={() => void loadTenants()}>
                Retry
              </Button>
            </Empty>
          ) : items.length === 0 ? (
            <Empty description="No tenants found">
              <Button type="primary" onClick={openCreate}>
                Add Tenant
              </Button>
            </Empty>
          ) : (
            <Table<TenantListItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={{ pageSize: 8 }}
              scroll={{ x: 1100 }}
            />
          )}
        </Space>
      </Card>

      <Drawer
        open={drawerOpen}
        title={drawerMode === 'create' ? 'Add Tenant' : 'Edit Tenant'}
        placement="right"
        width={screens.md ? 500 : '100%'}
        onClose={requestCloseDrawer}
        destroyOnClose
        maskClosable
      >
        {drawerLoading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Form form={form} layout="vertical" onFieldsChange={recalculateCanSave}>
            <Tabs
              activeKey={activeFormTab}
              onChange={(key) => setActiveFormTab(key as 'tenant' | 'rental')}
              items={[
                {
                  key: 'tenant',
                  label: 'Thông tin người thuê',
                  children: (
                    <div className={`tenant-tab-grid ${isDesktop ? 'desktop-two-cols' : ''}`}>
                      <Form.Item name="full_name" label="full_name" rules={[{ required: true, message: 'full_name is required' }]}>
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name="phone"
                        label="phone"
                        rules={[
                          { required: true, message: 'phone is required' },
                          { pattern: /^[0-9+\-\s]{8,20}$/, message: 'Invalid phone format' },
                        ]}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item name="email" label="email" rules={[{ type: 'email', message: 'Invalid email format' }]}>
                        <Input />
                      </Form.Item>
                      <Form.Item name="gender" label="gender">
                        <Input />
                      </Form.Item>
                      <Form.Item name="dob" label="dob">
                        <Input type="date" />
                      </Form.Item>
                      <Form.Item
                        name="identity_number"
                        label="identity_number"
                        rules={[{ required: true, message: 'identity_number is required' }]}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item name="identity_issued_date" label="identity_issued_date">
                        <Input type="date" />
                      </Form.Item>
                      <Form.Item name="identity_issued_place" label="identity_issued_place">
                        <Input />
                      </Form.Item>
                      <Form.Item name="status" label="status" rules={[{ required: true }]}> 
                        <Select options={statusOptions.map((item) => ({ label: item.label, value: item.value }))} />
                      </Form.Item>
                      <Form.Item name="permanent_address" label="permanent_address" className="tenant-tab-full-row">
                        <Input.TextArea rows={3} />
                      </Form.Item>
                      <Form.Item name="note" label="note" className="tenant-tab-full-row">
                        <Input.TextArea rows={3} />
                      </Form.Item>
                    </div>
                  ),
                },
                {
                  key: 'rental',
                  label: 'Thuê phòng',
                  children: (
                    <div className={`tenant-tab-grid ${isDesktop ? 'desktop-two-cols' : ''}`}>
                      <Form.Item name={['rental', 'building_id']} label="building_id">
                        <Select
                          allowClear
                          options={buildingOptions.map((building) => ({ label: building.name, value: building.id }))}
                          onChange={() => {
                            form.setFieldValue(['rental', 'room_id'], undefined)
                          }}
                        />
                      </Form.Item>
                      <Form.Item
                        name={['rental', 'room_id']}
                        label="room_id"
                        rules={
                          form.getFieldValue(['rental', 'building_id'])
                            ? [{ required: true, message: 'room_id is required when building is selected' }]
                            : undefined
                        }
                      >
                        <Select
                          allowClear
                          disabled={!form.getFieldValue(['rental', 'building_id'])}
                          options={filteredRoomsForDrawer.map((room) => ({ label: room.code, value: room.id }))}
                        />
                      </Form.Item>
                      <Form.Item name={['rental', 'contract_code']} label="contract_code">
                        <Input />
                      </Form.Item>
                      <Form.Item name={['rental', 'contract_status']} label="status" initialValue="DRAFT">
                        <Select options={contractStatusOptions.map((item) => ({ label: item.label, value: item.value }))} />
                      </Form.Item>
                      <Form.Item name={['rental', 'start_date']} label="start_date">
                        <Input type="date" />
                      </Form.Item>
                      <Form.Item name={['rental', 'end_date']} label="end_date">
                        <Input type="date" />
                      </Form.Item>
                      <Form.Item name={['rental', 'move_in_date']} label="move_in_date">
                        <Input type="date" />
                      </Form.Item>
                      <Form.Item name={['rental', 'move_out_date']} label="move_out_date">
                        <Input type="date" />
                      </Form.Item>
                      <Form.Item name={['rental', 'rent_price']} label="rent_price">
                        <InputNumber min={0} precision={0} controls={false} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name={['rental', 'deposit_amount']} label="deposit_amount">
                        <InputNumber min={0} precision={0} controls={false} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item
                        name={['rental', 'billing_day']}
                        label="billing_day"
                        rules={[
                          {
                            validator: async (_, value: number | undefined) => {
                              if (value === undefined) {
                                return
                              }
                              if (value < 1 || value > 28) {
                                throw new Error('billing_day must be from 1 to 28')
                              }
                            },
                          },
                        ]}
                      >
                        <InputNumber min={1} max={28} precision={0} controls={false} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name={['rental', 'contract_note']} label="note" className="tenant-tab-full-row">
                        <Input.TextArea rows={3} />
                      </Form.Item>
                    </div>
                  ),
                },
              ]}
            />

            <div className="tenant-drawer-actions">
              <Space style={{ width: '100%', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
                <Button size={isMobile ? 'large' : 'middle'} onClick={requestCloseDrawer}>
                  Cancel
                </Button>
                <Button
                  size={isMobile ? 'large' : 'middle'}
                  type="primary"
                  loading={saveLoading}
                  disabled={!canSave}
                  onClick={() => void submitForm()}
                >
                  Save
                </Button>
              </Space>
            </div>
          </Form>
        )}
      </Drawer>

      <Drawer
        open={detailOpen}
        title="Tenant Detail"
        placement="right"
        width={screens.lg ? 520 : screens.md ? 480 : '100%'}
        onClose={() => setDetailOpen(false)}
      >
        {detailLoading || !selectedTenant ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="full_name">{selectedTenant.full_name}</Descriptions.Item>
              <Descriptions.Item label="phone">{selectedTenant.phone}</Descriptions.Item>
              <Descriptions.Item label="email">{selectedTenant.email ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="identity_number">{selectedTenant.identity_number}</Descriptions.Item>
              <Descriptions.Item label="status">{selectedTenant.status}</Descriptions.Item>
              <Descriptions.Item label="permanent_address">
                {selectedTenant.permanent_address ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="note">{selectedTenant.note ?? '—'}</Descriptions.Item>
            </Descriptions>

            <Card size="small" title="Current Contract / Room">
              {selectedTenant.current_room ? (
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="building_name">
                    {selectedTenant.current_room.building_name}
                  </Descriptions.Item>
                  <Descriptions.Item label="room_code">{selectedTenant.current_room.room_code}</Descriptions.Item>
                  <Descriptions.Item label="contract_id">{selectedTenant.current_room.contract_id}</Descriptions.Item>
                  <Descriptions.Item label="start_date">
                    {dayjs(selectedTenant.current_room.start_date).format('DD/MM/YYYY')}
                  </Descriptions.Item>
                </Descriptions>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No active contract" />
              )}
            </Card>
          </Space>
        )}
      </Drawer>

      <Modal
        open={discardModalOpen}
        title="Discard unsaved changes?"
        onCancel={() => setDiscardModalOpen(false)}
        onOk={() => {
          setDiscardModalOpen(false)
          setDrawerOpen(false)
        }}
        okText="Discard"
        okButtonProps={{ danger: true }}
        cancelText="Keep editing"
        zIndex={1200}
        getContainer={() => document.body}
      >
        You have unsaved changes.
      </Modal>
    </div>
  )
}
