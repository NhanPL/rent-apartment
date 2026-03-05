import { DeleteOutlined, EditOutlined, EyeOutlined, ExclamationCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
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
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  RoomOption,
  TenantListItem,
  TenantStatus,
  TenantUpsertPayload,
} from './types'
import './TenantsPage.css'

interface TenantFormValues extends Omit<TenantUpsertPayload, 'note' | 'email' | 'dob' | 'gender' | 'identity_issued_date' | 'identity_issued_place' | 'permanent_address'> {
  note?: string
  email?: string
  dob?: string
  gender?: string
  identity_issued_date?: string
  identity_issued_place?: string
  permanent_address?: string
}

const statusOptions: { label: string; value: TenantStatus; color: string }[] = [
  { label: 'Active', value: 'ACTIVE', color: 'green' },
  { label: 'Moved Out', value: 'MOVED_OUT', color: 'gold' },
  { label: 'Blacklist', value: 'BLACKLIST', color: 'red' },
]

const defaultFormValues: TenantFormValues = {
  full_name: '',
  phone: '',
  identity_number: '',
  status: 'ACTIVE',
}

export function TenantsPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [form] = Form.useForm<TenantFormValues>()
  const initialSnapshotRef = useRef('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<TenantListItem[]>([])
  const [selectedTenant, setSelectedTenant] = useState<TenantListItem | null>(null)
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

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const loadOptions = async () => {
    const [buildings, rooms] = await Promise.all([listBuildings(), listRooms()])
    setBuildingOptions(buildings)
    setRoomOptions(rooms)
  }

  const loadTenants = async () => {
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
      setSelectedTenant((current) => data.find((tenant) => tenant.id === current?.id) ?? null)
    } catch {
      setError('Unable to load tenants. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOptions()
  }, [])

  useEffect(() => {
    void loadTenants()
  }, [debouncedSearch, statusFilter, buildingFilter, roomFilter])

  const openCreate = () => {
    setDrawerMode('create')
    setDrawerOpen(true)
    form.setFieldsValue(defaultFormValues)
    initialSnapshotRef.current = JSON.stringify(defaultFormValues)
    setCanSave(false)
  }

  const openEdit = async (id: string) => {
    setDrawerMode('edit')
    setDrawerOpen(true)
    setDrawerLoading(true)

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
      }
      setSelectedTenant(data)
      form.setFieldsValue(values)
      initialSnapshotRef.current = JSON.stringify(values)
      setCanSave(false)
    } catch {
      message.error('Failed to load tenant data')
      setDrawerOpen(false)
    } finally {
      setDrawerLoading(false)
    }
  }

  const isDirty = () => JSON.stringify(form.getFieldsValue()) !== initialSnapshotRef.current

  const requestCloseDrawer = () => {
    if (isDirty()) {
      setDiscardModalOpen(true)
      return
    }

    setDrawerOpen(false)
  }

  const submitForm = async () => {
    const values = await form.validateFields()
    const payload: TenantUpsertPayload = {
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
    }

    setSaveLoading(true)
    try {
      if (drawerMode === 'create') {
        await createTenant(payload)
        message.success('Tenant created successfully')
      } else if (selectedTenant) {
        await updateTenant(selectedTenant.id, payload)
        message.success('Tenant updated successfully')
      }
      setDrawerOpen(false)
      await loadTenants()
    } catch {
      message.error('Failed to save tenant')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleDelete = (id: string) => {
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
  }

  const handleView = async (id: string) => {
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
  }

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
          item.current_room ? `${item.current_room.building_name} / ${item.current_room.room_code}` : <Typography.Text type="secondary">No active room</Typography.Text>,
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
    [],
  )

  const filteredRooms = useMemo(() => {
    if (!buildingFilter) {
      return roomOptions
    }
    return roomOptions.filter((room) => room.building_id === buildingFilter)
  }, [roomOptions, buildingFilter])

  return (
    <div className="tenants-page">
      <Card>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className="tenants-toolbar">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                Tenants
              </Typography.Title>
              <Typography.Text type="secondary">Manage tenant profiles and occupancy from one workspace.</Typography.Text>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Add Tenant
            </Button>
          </div>

          <div className="tenants-filters">
            <Input.Search placeholder="Search name, phone, email, identity number" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} allowClear />
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
              options={filteredRooms.map((room) => ({ label: room.code, value: room.id }))}
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
              onRow={(record) => ({
                onClick: () => {
                  setSelectedTenant(record)
                },
              })}
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
          <Form
            form={form}
            layout="vertical"
            initialValues={defaultFormValues}
            onFieldsChange={async () => {
              try {
                await form.validateFields({ validateOnly: true })
                setCanSave(isDirty())
              } catch {
                setCanSave(false)
              }
            }}
          >
            <Form.Item name="full_name" label="full_name" rules={[{ required: true, message: 'full_name is required' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="phone" rules={[{ required: true, message: 'phone is required' }, { pattern: /^[0-9+\-\s]{8,20}$/, message: 'Invalid phone format' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="email" label="email" rules={[{ type: 'email', message: 'Invalid email format' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="identity_number" label="identity_number" rules={[{ required: true, message: 'identity_number is required' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="dob" label="dob">
              <Input type="date" />
            </Form.Item>
            <Form.Item name="gender" label="gender">
              <Input />
            </Form.Item>
            <Form.Item name="identity_issued_date" label="identity_issued_date">
              <Input type="date" />
            </Form.Item>
            <Form.Item name="identity_issued_place" label="identity_issued_place">
              <Input />
            </Form.Item>
            <Form.Item name="permanent_address" label="permanent_address">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item name="status" label="status" rules={[{ required: true }]}>
              <Select options={statusOptions.map((item) => ({ label: item.label, value: item.value }))} />
            </Form.Item>
            <Form.Item name="note" label="note">
              <Input.TextArea rows={3} />
            </Form.Item>

            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={requestCloseDrawer}>Cancel</Button>
              <Button type="primary" loading={saveLoading} disabled={!canSave} onClick={() => void submitForm()}>
                Save
              </Button>
            </Space>
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
              <Descriptions.Item label="permanent_address">{selectedTenant.permanent_address ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="note">{selectedTenant.note ?? '—'}</Descriptions.Item>
            </Descriptions>

            <Card size="small" title="Current Contract / Room">
              {selectedTenant.current_room ? (
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="building_name">{selectedTenant.current_room.building_name}</Descriptions.Item>
                  <Descriptions.Item label="room_code">{selectedTenant.current_room.room_code}</Descriptions.Item>
                  <Descriptions.Item label="contract_id">{selectedTenant.current_room.contract_id}</Descriptions.Item>
                  <Descriptions.Item label="start_date">{dayjs(selectedTenant.current_room.start_date).format('DD/MM/YYYY')}</Descriptions.Item>
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
