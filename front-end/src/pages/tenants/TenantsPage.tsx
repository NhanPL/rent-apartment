import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Grid,
  Image,
  Input,
  Modal,
  Radio,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createTenant,
  deleteTenant,
  getTenant,
  listTenants,
  updateTenant,
  updateTenantIdentityDocuments,
} from '../../services/tenantsService'
import { getFormErrorMessage, getUserErrorMessage } from '../../services/errorMessage'
import { Localized } from '../../shared/components/Localized'
import { uploadFileToCloudinary } from '../../services/uploadService'
import type {
  TenantDetail,
  TenantIdentityDocument,
  TenantIdentityDocumentFilePayload,
  TenantIdentityDocumentUpdatePayload,
  TenantListItem,
  TenantStatus,
} from './types'
import {
  defaultTenantFormValues,
  mapTenantFormValuesToPayload,
  type TenantFormValues,
} from './tenantFormPayload'
import { IdentityDocumentInput, type IdentityDocumentValue } from './IdentityDocumentInput'
import './TenantsPage.css'

const statusOptions: { label: string; value: TenantStatus; color: string }[] = [
  { label: 'Active', value: 'ACTIVE', color: 'green' },
  { label: 'Moved Out', value: 'MOVED_OUT', color: 'gold' },
  { label: 'Blacklist', value: 'BLACKLIST', color: 'red' },
]

const isFile = (value: IdentityDocumentValue | undefined): value is File => (
  typeof File !== 'undefined' && value instanceof File
)

const documentSignature = (value: IdentityDocumentValue | undefined): string => {
  if (!value) return ''
  if (isFile(value)) return `file:${value.name}:${value.size}:${value.type}:${value.lastModified}`
  return value.file_url
}

const snapshotFormValues = (values: TenantFormValues): string => JSON.stringify(values, (_key, value) => {
  if (isFile(value as IdentityDocumentValue)) {
    const file = value as File
    return { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified }
  }
  return value
})

const toIdentityDocumentPayload = (
  value: TenantIdentityDocument | TenantIdentityDocumentFilePayload,
): TenantIdentityDocumentFilePayload => ({
  file_name: value.file_name ?? 'identity-card',
  file_url: value.file_url,
  mime_type: value.mime_type,
  file_size: Number(value.file_size),
  resource_type: 'image',
})

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
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedTenant, setSelectedTenant] = useState<TenantDetail | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TenantStatus | undefined>()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [discardModalOpen, setDiscardModalOpen] = useState(false)
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null)
  const [drawerInitialValues, setDrawerInitialValues] = useState<TenantFormValues>(defaultTenantFormValues)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TenantListItem | null>(null)
  const [deletingTenantId, setDeletingTenantId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const loadTenants = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listTenants({ search: debouncedSearch, status: statusFilter, page, pageSize: 8 })
      setItems(data.items)
      setTotal(data.total)
    } catch (loadError) {
      setError(getUserErrorMessage(loadError, 'Unable to load tenants.'))
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, page, statusFilter])

  useEffect(() => {
    void loadTenants()
  }, [loadTenants])

  const isDirty = useCallback(() => (
    snapshotFormValues(form.getFieldsValue(true)) !== initialSnapshotRef.current
  ), [form])

  useEffect(() => {
    if (!drawerOpen) {
      didInitFormRef.current = false
      return
    }
    if (didInitFormRef.current) return

    form.resetFields()
    form.setFieldsValue(drawerInitialValues)
    initialSnapshotRef.current = snapshotFormValues(drawerInitialValues)
    didInitFormRef.current = true
  }, [drawerInitialValues, drawerOpen, form])

  const openCreate = useCallback(() => {
    setDrawerMode('create')
    setEditingTenantId(null)
    setDrawerInitialValues(defaultTenantFormValues)
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
        identity_front: data.identity_documents.front,
        identity_back: data.identity_documents.back,
      }
      didInitFormRef.current = false
      setDrawerInitialValues(values)
    } catch (loadError) {
      message.error(getUserErrorMessage(loadError, 'Unable to load tenant details.'))
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

  const resolveIdentityDocumentChange = useCallback(async (
    field: 'identity_front' | 'identity_back',
    current: IdentityDocumentValue | undefined,
    initial: IdentityDocumentValue | undefined,
  ): Promise<TenantIdentityDocumentFilePayload | null | undefined> => {
    if (documentSignature(current) === documentSignature(initial)) return undefined
    if (!current) return null
    if (!isFile(current)) return toIdentityDocumentPayload(current)

    const uploaded = await uploadFileToCloudinary(current, 'TENANT_DOCUMENT')
    const payload: TenantIdentityDocumentFilePayload = {
      file_name: uploaded.file_name,
      file_url: uploaded.file_url,
      mime_type: uploaded.mime_type,
      file_size: uploaded.file_size,
      resource_type: 'image',
    }
    form.setFieldValue(field, payload)
    return payload
  }, [form])

  const saveIdentityDocuments = useCallback(async (tenantId: string, values: TenantFormValues) => {
    const [front, back] = await Promise.all([
      resolveIdentityDocumentChange('identity_front', values.identity_front, drawerInitialValues.identity_front),
      resolveIdentityDocumentChange('identity_back', values.identity_back, drawerInitialValues.identity_back),
    ])
    const changes: TenantIdentityDocumentUpdatePayload = {}
    if (front !== undefined) changes.front = front
    if (back !== undefined) changes.back = back
    if (Object.keys(changes).length > 0) await updateTenantIdentityDocuments(tenantId, changes)
  }, [drawerInitialValues.identity_back, drawerInitialValues.identity_front, resolveIdentityDocumentChange])

  const submitForm = useCallback(async () => {
    setSaveLoading(true)
    let profileSaved = false
    try {
      const values = await form.validateFields()
      const payload = mapTenantFormValuesToPayload(values)
      let tenantId = editingTenantId

      if (drawerMode === 'create') {
        const created = await createTenant(payload)
        tenantId = created.tenantId
        setDrawerMode('edit')
        setEditingTenantId(created.tenantId)
      } else if (tenantId) {
        await updateTenant(tenantId, payload)
      }
      profileSaved = true

      if (!tenantId) throw new Error('The tenant profile was saved without a tenant identifier.')
      await saveIdentityDocuments(tenantId, values)
      message.success(drawerMode === 'create' ? 'Tenant created successfully.' : 'Tenant updated successfully.')
      setDrawerOpen(false)
      await loadTenants()
    } catch (saveError: unknown) {
      const formError = saveError as { errorFields?: Array<{ name: (string | number)[] }> }
      const firstError = formError.errorFields?.[0]
      if (firstError?.name) {
        window.setTimeout(() => form.scrollToField(firstError.name, { block: 'center' }), 0)
        message.error(getFormErrorMessage(saveError))
      } else if (profileSaved) {
        message.error(getUserErrorMessage(saveError, 'Tenant information was saved, but the identity images could not be updated. Please retry.'))
        await loadTenants()
      } else {
        message.error(getUserErrorMessage(saveError, 'Unable to save the tenant.'))
      }
    } finally {
      setSaveLoading(false)
    }
  }, [drawerMode, editingTenantId, form, loadTenants, saveIdentityDocuments])

  const confirmDeleteTenant = useCallback(async () => {
    if (!deleteTarget || deletingTenantId) return
    const tenantId = deleteTarget.id
    setDeletingTenantId(tenantId)
    try {
      await deleteTenant(tenantId)
      setItems((currentItems) => currentItems.filter((item) => item.id !== tenantId))
      if (selectedTenant?.id === tenantId) {
        setSelectedTenant(null)
        setDetailOpen(false)
      }
      setDeleteTarget(null)
      message.success('Tenant deleted successfully.')
      await loadTenants()
    } catch (deleteError) {
      message.error(getUserErrorMessage(deleteError, 'Unable to delete the tenant.'))
    } finally {
      setDeletingTenantId(null)
    }
  }, [deleteTarget, deletingTenantId, loadTenants, selectedTenant?.id])

  const handleView = useCallback(async (id: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      setSelectedTenant(await getTenant(id))
    } catch (loadError) {
      message.error(getUserErrorMessage(loadError, 'Unable to load tenant details.'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const columns: ColumnsType<TenantListItem> = useMemo(() => [
    { title: 'Tenant name', dataIndex: 'full_name', key: 'full_name', width: 190 },
    {
      title: 'Phone / Email',
      key: 'contact',
      width: 240,
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{item.phone}</Typography.Text>
          <Typography.Text type="secondary">{item.email ?? '-'}</Typography.Text>
        </Space>
      ),
    },
    { title: 'Identity number', dataIndex: 'identity_number', key: 'identity_number', width: 180 },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: TenantStatus) => {
        const status = statusOptions.find((item) => item.value === value)
        return <Tag color={status?.color}>{status?.label ?? value}</Tag>
      },
    },
    {
      title: 'Updated at',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 136,
      render: (_, item) => (
        <Space size={2}>
          <Button type="text" icon={<EyeOutlined />} aria-label={`View ${item.full_name}`} onClick={() => void handleView(item.id)} />
          <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${item.full_name}`} onClick={() => void openEdit(item.id)} />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Delete ${item.full_name}`}
            loading={deletingTenantId === item.id}
            disabled={Boolean(deletingTenantId)}
            onClick={() => setDeleteTarget(item)}
          />
        </Space>
      ),
    },
  ], [deletingTenantId, handleView, openEdit])

  const renderIdentityDocument = (label: string, document: TenantIdentityDocument | null) => (
    <div className="tenant-identity-detail-item">
      <Typography.Text strong>{label}</Typography.Text>
      {document ? (
        <Image src={document.file_url} alt={label} />
      ) : (
        <div className="tenant-identity-detail-empty">No image</div>
      )}
    </div>
  )

  return (
    <Localized>
    <div className="tenants-page">
      <Card>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className="tenants-toolbar">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>Tenants</Typography.Title>
              <Typography.Text type="secondary">Manage tenant profiles and identity information.</Typography.Text>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Tenant</Button>
          </div>

          <div className="tenants-filters">
            <Input.Search
              placeholder="Search name, phone, email, identity number"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value)
                setPage(1)
              }}
              allowClear
            />
            <Select
              value={statusFilter}
              placeholder="Status"
              allowClear
              options={statusOptions.map((item) => ({ label: item.label, value: item.value }))}
              onChange={(value) => {
                setStatusFilter(value)
                setPage(1)
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void loadTenants()}>Refresh</Button>
          </div>

          {loading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : error ? (
            <Empty description={error}><Button type="primary" onClick={() => void loadTenants()}>Retry</Button></Empty>
          ) : items.length === 0 ? (
            <Empty description="No tenants found"><Button type="primary" onClick={openCreate}>Add Tenant</Button></Empty>
          ) : (
            <Table<TenantListItem>
              rowKey="id"
              columns={columns}
              dataSource={items}
              pagination={{ current: page, pageSize: 8, total, onChange: setPage }}
              scroll={{ x: 900 }}
            />
          )}
        </Space>
      </Card>

      <Drawer
        open={drawerOpen}
        title={drawerMode === 'create' ? 'Add Tenant' : 'Edit Tenant'}
        placement="right"
        width={screens.lg ? 720 : screens.md ? 620 : '100%'}
        onClose={requestCloseDrawer}
        destroyOnHidden
        maskClosable
      >
        {drawerLoading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Form form={form} layout="vertical">
            <div className={`tenant-tab-grid ${isDesktop ? 'desktop-two-cols' : ''}`}>
              <Form.Item name="full_name" label="Full name" rules={[{ required: true, whitespace: true, message: 'Please enter the tenant name.' }]}>
                <Input placeholder="Tenant full name" />
              </Form.Item>
              <Form.Item name="phone" label="Phone" rules={[
                { required: true, message: 'Please enter the phone number.' },
                { pattern: /^[0-9+\-\s]{8,20}$/, message: 'Please enter a valid phone number.' },
              ]}>
                <Input placeholder="Phone number" />
              </Form.Item>
              <Form.Item name="email" label="Email" rules={[
                { required: true, message: 'Please enter the email address.' },
                { type: 'email', message: 'Please enter a valid email address.' },
              ]}>
                <Input placeholder="Email address" />
              </Form.Item>
              <Form.Item name="gender" label="Gender">
                <Radio.Group options={[
                  { label: 'Male', value: 'MALE' },
                  { label: 'Female', value: 'FEMALE' },
                  { label: 'Other', value: 'OTHER' },
                ]} />
              </Form.Item>
              <Form.Item name="dob" label="Date of birth"><Input type="date" /></Form.Item>
              <Form.Item name="identity_number" label="Citizen ID number" rules={[
                { required: true, whitespace: true, message: 'Please enter the citizen ID number.' },
                { pattern: /^[A-Za-z0-9]{6,20}$/, message: 'Please enter a valid citizen ID number.' },
              ]}>
                <Input placeholder="Citizen ID number" />
              </Form.Item>
              <Form.Item name="identity_issued_date" label="Issue date"><Input type="date" /></Form.Item>
              <Form.Item name="identity_issued_place" label="Place of issue"><Input placeholder="Place of issue" /></Form.Item>
              <Form.Item name="status" label="Status" rules={[{ required: true, message: 'Please select a status.' }]}>
                <Select options={statusOptions.map((item) => ({ label: item.label, value: item.value }))} />
              </Form.Item>
              <Form.Item name="permanent_address" label="Permanent address" className="tenant-tab-full-row">
                <Input.TextArea rows={3} placeholder="Permanent address" />
              </Form.Item>
              <Form.Item name="identity_front" label="Citizen ID - Front" className="tenant-identity-form-item">
                <IdentityDocumentInput disabled={saveLoading} />
              </Form.Item>
              <Form.Item name="identity_back" label="Citizen ID - Back" className="tenant-identity-form-item">
                <IdentityDocumentInput disabled={saveLoading} />
              </Form.Item>
              <Form.Item name="note" label="Note" className="tenant-tab-full-row">
                <Input.TextArea rows={3} placeholder="Tenant note" />
              </Form.Item>
            </div>

            <div className="tenant-drawer-actions">
              <Space style={{ width: '100%', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
                <Button size={isMobile ? 'large' : 'middle'} onClick={requestCloseDrawer}>Cancel</Button>
                <Button
                  size={isMobile ? 'large' : 'middle'}
                  type="primary"
                  loading={saveLoading}
                  disabled={saveLoading}
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
        width={screens.md ? 560 : '100%'}
        onClose={() => setDetailOpen(false)}
      >
        {detailLoading || !selectedTenant ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={20}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Full name">{selectedTenant.full_name}</Descriptions.Item>
              <Descriptions.Item label="Phone">{selectedTenant.phone}</Descriptions.Item>
              <Descriptions.Item label="Email">{selectedTenant.email ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Gender">{selectedTenant.gender ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Date of birth">{selectedTenant.dob ? dayjs(selectedTenant.dob).format('DD/MM/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Citizen ID number">{selectedTenant.identity_number}</Descriptions.Item>
              <Descriptions.Item label="Issue date">{selectedTenant.identity_issued_date ? dayjs(selectedTenant.identity_issued_date).format('DD/MM/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Place of issue">{selectedTenant.identity_issued_place ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Status">{selectedTenant.status}</Descriptions.Item>
              <Descriptions.Item label="Permanent address">{selectedTenant.permanent_address ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Note">{selectedTenant.note ?? '-'}</Descriptions.Item>
            </Descriptions>
            <div>
              <Typography.Title level={5}>Citizen ID images</Typography.Title>
              <div className="tenant-identity-detail-grid">
                {renderIdentityDocument('Front', selectedTenant.identity_documents.front)}
                {renderIdentityDocument('Back', selectedTenant.identity_documents.back)}
              </div>
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        open={Boolean(deleteTarget)}
        title="Delete tenant?"
        onCancel={() => setDeleteTarget(null)}
        onOk={() => void confirmDeleteTenant()}
        okText="Delete"
        okButtonProps={{ danger: true, loading: Boolean(deletingTenantId) }}
        cancelText="Cancel"
        maskClosable={!deletingTenantId}
        keyboard={!deletingTenantId}
        confirmLoading={Boolean(deletingTenantId)}
        zIndex={1200}
        getContainer={() => document.body}
      >
        This tenant profile will be removed. This action cannot be undone.
      </Modal>

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
    </Localized>
  )
}
