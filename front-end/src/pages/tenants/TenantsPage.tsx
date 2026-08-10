import { useI18n } from '../../i18n'
import { DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined, MailOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Checkbox,
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
import type { FormProps } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createTenant,
  deleteTenant,
  exportTenantData,
  getTenant,
  listTenants,
  resendTenantActivation,
  updateTenant,
  updateTenantIdentityDocuments,
} from '../../services/tenantsService'
import { applyApiFieldErrors, getFormErrorMessage, getUserErrorMessage } from '../../services/errorMessage'
import { uploadFileToCloudinary } from '../../services/uploadService'
import type {
  TenantDetail,
  AccountStatus,
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
  const { t } = useI18n()
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
  const [resendingTenantId, setResendingTenantId] = useState<string | null>(null)
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null)
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)
  const [exportingTenantId, setExportingTenantId] = useState<string | null>(null)

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
    setSaveErrorMessage(null)
    setDrawerMode('create')
    setEditingTenantId(null)
    setDrawerInitialValues(defaultTenantFormValues)
    setDiscardModalOpen(false)
    setDrawerOpen(true)
  }, [])

  const openEdit = useCallback(async (id: string) => {
    setSaveErrorMessage(null)
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
        privacy_consent: data.privacy_consent_granted ?? false,
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

  const submitForm = useCallback(async (validatedValues?: TenantFormValues) => {
    setSaveLoading(true)
    setSaveErrorMessage(null)
    let profileSaved = false
    let activationEmailSent: boolean | null = null
    try {
      const values = validatedValues ?? await form.validateFields()
      const payload = mapTenantFormValuesToPayload(values)
      let tenantId = editingTenantId

      if (drawerMode === 'create') {
        const created = await createTenant(payload)
        activationEmailSent = created.emailSent
        tenantId = created.tenantId
        setDrawerMode('edit')
        setEditingTenantId(created.tenantId)
      } else if (tenantId) {
        await updateTenant(tenantId, payload)
      }
      profileSaved = true

      if (!tenantId) throw new Error('The tenant profile was saved without a tenant identifier.')
      await saveIdentityDocuments(tenantId, values)
      if (drawerMode === 'create' && activationEmailSent === false) {
        message.warning('Tenant created, but the activation email was not sent. You can resend the invitation later.')
      } else {
        message.success(
          drawerMode === 'create'
            ? 'Tenant created and activation invitation sent.'
            : 'Tenant updated successfully.',
        )
      }
      setDrawerOpen(false)
      await loadTenants()
    } catch (saveError: unknown) {
      applyApiFieldErrors(form, saveError)
      const formError = saveError as { errorFields?: Array<{ name: (string | number)[] }> }
      const firstError = formError.errorFields?.[0]
      let userMessage: string
      if (firstError?.name) {
        window.setTimeout(() => form.scrollToField(firstError.name, { block: 'center' }), 0)
        userMessage = getFormErrorMessage(saveError)
      } else if (profileSaved) {
        userMessage = getUserErrorMessage(saveError, 'Tenant information was saved, but the identity images could not be updated. Please retry.')
        await loadTenants()
      } else {
        userMessage = getUserErrorMessage(saveError, 'Unable to save the tenant.')
      }
      setSaveErrorMessage(userMessage)
      message.error(userMessage)
    } finally {
      setSaveLoading(false)
    }
  }, [drawerMode, editingTenantId, form, loadTenants, saveIdentityDocuments])

  const handleFormValidationFailed = useCallback<NonNullable<FormProps<TenantFormValues>['onFinishFailed']>>((formError) => {
    const firstError = formError.errorFields[0]
    if (firstError?.name) {
      window.setTimeout(() => form.scrollToField(firstError.name, { block: 'center' }), 0)
    }
    const userMessage = getFormErrorMessage(formError)
    setSaveErrorMessage(userMessage)
    message.error(userMessage)
  }, [form])

  const confirmDeleteTenant = useCallback(async () => {
    if (!deleteTarget || deletingTenantId) return
    const tenantId = deleteTarget.id
    setDeletingTenantId(tenantId)
    setDeleteErrorMessage(null)
    try {
      const result = await deleteTenant(tenantId)
      setItems((currentItems) => currentItems.filter((item) => item.id !== tenantId))
      if (selectedTenant?.id === tenantId) {
        setSelectedTenant(null)
        setDetailOpen(false)
      }
      setDeleteTarget(null)
      message.success(result.message)
      await loadTenants()
    } catch (deleteError) {
      const userMessage = getUserErrorMessage(deleteError, 'Unable to delete the tenant.')
      setDeleteErrorMessage(userMessage)
      message.error(userMessage)
    } finally {
      setDeletingTenantId(null)
    }
  }, [deleteTarget, deletingTenantId, loadTenants, selectedTenant?.id])

  const handleExportTenantData = useCallback(async (tenant: TenantDetail) => {
    if (exportingTenantId) return
    setExportingTenantId(tenant.id)
    try {
      const payload = await exportTenantData(tenant.id)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `tenant-data-${tenant.id}.json`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      message.success('Tenant data export downloaded.')
    } catch (exportError) {
      message.error(getUserErrorMessage(exportError, 'Unable to export tenant data.'))
    } finally {
      setExportingTenantId(null)
    }
  }, [exportingTenantId])

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

  const handleResendActivation = useCallback(async (tenant: TenantListItem) => {
    if (resendingTenantId) return
    setResendingTenantId(tenant.id)
    try {
      const result = await resendTenantActivation(tenant.id)
      if (result.emailSent) {
        message.success('Activation invitation sent successfully.')
      } else {
        message.warning('Invitation renewed, but email delivery is not configured.')
      }
    } catch (resendError) {
      message.error(getUserErrorMessage(resendError, 'Unable to resend the activation invitation.'))
    } finally {
      setResendingTenantId(null)
    }
  }, [resendingTenantId])

  const columns: ColumnsType<TenantListItem> = useMemo(() => [
    { title: t("Tenant name"), dataIndex: 'full_name', key: 'full_name', width: 190 },
    {
      title: t("Phone / Email"),
      key: 'contact',
      width: 240,
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{item.phone}</Typography.Text>
          <Typography.Text type="secondary">{item.email ?? '-'}</Typography.Text>
        </Space>
      ),
    },
    { title: t("Identity number"), dataIndex: 'identity_number', key: 'identity_number', width: 180 },
    {
      title: t("Status"),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: TenantStatus) => {
        const status = statusOptions.find((item) => item.value === value)
        return <Tag color={status?.color}>{status?.label ?? value}</Tag>
      },
    },
    {
      title: t("Account status"),
      dataIndex: 'account_status',
      key: 'account_status',
      width: 170,
      render: (value: AccountStatus | null) => {
        if (!value) return '-'
        const settings: Record<AccountStatus, { label: string; color: string }> = {
          PENDING_ACTIVATION: { label: t("Pending activation"), color: 'gold' },
          ACTIVE: { label: t("Active"), color: 'green' },
          DISABLED: { label: t("Disabled"), color: 'default' },
        }
        return <Tag color={settings[value].color}>{settings[value].label}</Tag>
      },
    },
    {
      title: t("Updated at"),
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: t("Actions"),
      key: 'actions',
      fixed: 'right',
      width: 176,
      render: (_, item) => (
        <Space size={2}>
          <Button type="text" icon={<EyeOutlined />} aria-label={`View ${item.full_name}`} onClick={() => void handleView(item.id)} />
          <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${item.full_name}`} onClick={() => void openEdit(item.id)} />
          {item.account_status === 'PENDING_ACTIVATION' ? (
            <Button
              type="text"
              icon={<MailOutlined />}
              aria-label={`Resend activation invitation to ${item.full_name}`}
              title={t("Resend activation invitation")}
              loading={resendingTenantId === item.id}
              disabled={Boolean(resendingTenantId)}
              onClick={() => void handleResendActivation(item)}
            />
          ) : null}
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Delete ${item.full_name}`}
            loading={deletingTenantId === item.id}
            disabled={Boolean(deletingTenantId)}
            onClick={() => {
              setDeleteErrorMessage(null)
              setDeleteTarget(item)
            }}
          />
        </Space>
      ),
    },
  ], [deletingTenantId, handleResendActivation, handleView, openEdit, resendingTenantId, t])

  const renderIdentityDocument = (label: string, document: TenantIdentityDocument | null) => (
    <div className="tenant-identity-detail-item">
      <Typography.Text strong>{label}</Typography.Text>
      {document ? (
        <Image src={document.file_url} alt={label} />
      ) : (
        <div className="tenant-identity-detail-empty">{t("No image")}</div>
      )}
    </div>
  )

  return (
    <>
    <div className="tenants-page">
      <Card>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className="tenants-toolbar">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>{t("Tenants")}</Typography.Title>
              <Typography.Text type="secondary">{t("Manage tenant profiles and identity information.")}</Typography.Text>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t("Add Tenant")}</Button>
          </div>

          <div className="tenants-filters">
            <Input.Search
              placeholder={t("Search name, phone, email, identity number")}
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value)
                setPage(1)
              }}
              allowClear
            />
            <Select
              value={statusFilter}
              placeholder={t("Status")}
              allowClear
              options={statusOptions.map((item) => ({ label: item.label, value: item.value }))}
              onChange={(value) => {
                setStatusFilter(value)
                setPage(1)
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void loadTenants()}>{t("Refresh")}</Button>
          </div>

          {loading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : error ? (
            <Empty description={error}><Button type="primary" onClick={() => void loadTenants()}>{t("Retry")}</Button></Empty>
          ) : items.length === 0 ? (
            <Empty description={t("No tenants found")}><Button type="primary" onClick={openCreate}>{t("Add Tenant")}</Button></Empty>
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
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => void submitForm(values)}
            onFinishFailed={handleFormValidationFailed}
          >
            {saveErrorMessage ? (
              <Alert
                type="error"
                message={saveErrorMessage}
                showIcon
                closable
                onClose={() => setSaveErrorMessage(null)}
                style={{ marginBottom: 16 }}
              />
            ) : null}
            <div className={`tenant-tab-grid ${isDesktop ? 'desktop-two-cols' : ''}`}>
              <Form.Item name="full_name" label={t("Full name")} rules={[{ required: true, whitespace: true, message: t("Please enter the tenant name.") }]}>
                <Input placeholder={t("Tenant full name")} />
              </Form.Item>
              <Form.Item name="phone" label={t("Phone")} rules={[
                { required: true, message: t("Please enter the phone number.") },
                { pattern: /^[0-9+\-\s]{8,20}$/, message: t("Please enter a valid phone number.") },
              ]}>
                <Input placeholder={t("Phone number")} />
              </Form.Item>
              <Form.Item name="email" label={t("Email")} rules={[
                { required: true, message: t("Please enter the email address.") },
                { type: 'email', message: t("Please enter a valid email address.") },
              ]}>
                <Input placeholder={t("Email address")} />
              </Form.Item>
              <Form.Item name="gender" label={t("Gender")}>
                <Radio.Group options={[
                  { label: t("Male"), value: 'MALE' },
                  { label: t("Female"), value: 'FEMALE' },
                  { label: t("Other"), value: 'OTHER' },
                ]} />
              </Form.Item>
              <Form.Item name="dob" label={t("Date of birth")}><Input type="date" /></Form.Item>
              <Form.Item name="identity_number" label={t("Citizen ID number")} rules={[
                { required: true, whitespace: true, message: t("Please enter the citizen ID number.") },
                { pattern: /^[A-Za-z0-9]{6,20}$/, message: t("Please enter a valid citizen ID number.") },
              ]}>
                <Input placeholder={t("Citizen ID number")} />
              </Form.Item>
              <Form.Item name="identity_issued_date" label={t("Issue date")}><Input type="date" /></Form.Item>
              <Form.Item name="identity_issued_place" label={t("Place of issue")}><Input placeholder={t("Place of issue")} /></Form.Item>
              <Form.Item name="status" label={t("Status")} rules={[{ required: true, message: t("Please select a status.") }]}>
                <Select options={statusOptions.map((item) => ({ label: item.label, value: item.value }))} />
              </Form.Item>
              <Form.Item name="permanent_address" label={t("Permanent address")} className="tenant-tab-full-row">
                <Input.TextArea rows={3} placeholder={t("Permanent address")} />
              </Form.Item>
              <Form.Item name="identity_front" label={t("Citizen ID - Front")} className="tenant-identity-form-item">
                <IdentityDocumentInput disabled={saveLoading} />
              </Form.Item>
              <Form.Item name="identity_back" label={t("Citizen ID - Back")} className="tenant-identity-form-item">
                <IdentityDocumentInput disabled={saveLoading} />
              </Form.Item>
              {drawerMode === 'create' ? (
                <Form.Item
                  name="privacy_consent"
                  valuePropName="checked"
                  className="tenant-tab-full-row"
                  rules={[{
                    validator: (_, value) => value
                      ? Promise.resolve()
                      : Promise.reject(new Error('Confirm that the tenant agreed to the privacy policy.')),
                  }]}
                >
                  <Checkbox>{t("The tenant agreed to the privacy policy and use of personal data.")}</Checkbox>
                </Form.Item>
              ) : null}
              <Form.Item name="note" label={t("Note")} className="tenant-tab-full-row">
                <Input.TextArea rows={3} placeholder={t("Tenant note")} />
              </Form.Item>
            </div>

            <div className="tenant-drawer-actions">
              <Space style={{ width: '100%', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
                <Button size={isMobile ? 'large' : 'middle'} onClick={requestCloseDrawer}>{t("Cancel")}</Button>
                <Button
                  size={isMobile ? 'large' : 'middle'}
                  type="primary"
                  htmlType="submit"
                  loading={saveLoading}
                  disabled={saveLoading}
                >
                  {t("Save")}
                </Button>
              </Space>
            </div>
          </Form>
        )}
      </Drawer>

      <Drawer
        open={detailOpen}
        title={t("Tenant Detail")}
        placement="right"
        width={screens.md ? 560 : '100%'}
        onClose={() => setDetailOpen(false)}
      >
        {detailLoading || !selectedTenant ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={20}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label={t("Full name")}>{selectedTenant.full_name}</Descriptions.Item>
              <Descriptions.Item label={t("Phone")}>{selectedTenant.phone}</Descriptions.Item>
              <Descriptions.Item label={t("Email")}>{selectedTenant.email ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Gender")}>{selectedTenant.gender ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Date of birth")}>{selectedTenant.dob ? dayjs(selectedTenant.dob).format('DD/MM/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Citizen ID number")}>{selectedTenant.identity_number}</Descriptions.Item>
              <Descriptions.Item label={t("Issue date")}>{selectedTenant.identity_issued_date ? dayjs(selectedTenant.identity_issued_date).format('DD/MM/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Place of issue")}>{selectedTenant.identity_issued_place ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Status")}>{selectedTenant.status}</Descriptions.Item>
              <Descriptions.Item label={t("Account status")}>
                {selectedTenant.account_status ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t("Permanent address")}>{selectedTenant.permanent_address ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Note")}>{selectedTenant.note ?? '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Privacy consent")}>
                {selectedTenant.privacy_consent_granted
                  ? `Granted (${selectedTenant.privacy_policy_version ?? 'unknown version'})`
                  : 'Not recorded'}
              </Descriptions.Item>
              <Descriptions.Item label={t("Consent recorded")}>
                {selectedTenant.privacy_consent_recorded_at
                  ? dayjs(selectedTenant.privacy_consent_recorded_at).format('DD/MM/YYYY HH:mm')
                  : '-'}
              </Descriptions.Item>
            </Descriptions>
            <Button
              icon={<DownloadOutlined />}
              loading={exportingTenantId === selectedTenant.id}
              onClick={() => void handleExportTenantData(selectedTenant)}
            >
              {t("Export tenant data")}
            </Button>
            <div>
              <Typography.Title level={5}>{t("Citizen ID images")}</Typography.Title>
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
        title={t("Delete tenant data?")}
        onCancel={() => {
          setDeleteErrorMessage(null)
          setDeleteTarget(null)
        }}
        onOk={() => void confirmDeleteTenant()}
        okText={t("Delete")}
        okButtonProps={{ danger: true, loading: Boolean(deletingTenantId) }}
        cancelText={t("Cancel")}
        maskClosable={!deletingTenantId}
        keyboard={!deletingTenantId}
        confirmLoading={Boolean(deletingTenantId)}
        zIndex={1200}
        getContainer={() => document.body}
      >
        {deleteErrorMessage ? (
          <Alert
            type="error"
            message={deleteErrorMessage}
            showIcon
            style={{ marginBottom: 16 }}
          />
        ) : null}
        {t("Login access and Citizen ID images will be removed. Personal data is anonymized immediately when no retained financial history exists; otherwise anonymization is scheduled after the retention period. Financial records are never deleted.")}
      </Modal>

      <Modal
        open={discardModalOpen}
        title={t("Discard unsaved changes?")}
        onCancel={() => setDiscardModalOpen(false)}
        onOk={() => {
          setDiscardModalOpen(false)
          setDrawerOpen(false)
        }}
        okText={t("Discard")}
        okButtonProps={{ danger: true }}
        cancelText={t("Keep editing")}
        zIndex={1200}
        getContainer={() => document.body}
      >
        {t("You have unsaved changes.")}
      </Modal>
    </div>
    </>
  )
}
