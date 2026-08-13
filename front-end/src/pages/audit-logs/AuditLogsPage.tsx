import { useI18n } from '../../i18n'
import { EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Button, DatePicker, Descriptions, Drawer, Empty, Form, Grid, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getUserErrorMessage } from '../../services/errorMessage'
import { listAuditLogs, type AuditActorRole, type AuditLogFilters, type AuditLogItem } from '../../services/auditLogsService'
import './AuditLogsPage.css'

const { RangePicker } = DatePicker
const actionOptions = [
  'CONTRACT_CREATED', 'CONTRACT_UPDATED', 'CONTRACT_ACTIVATED', 'CONTRACT_ENDED', 'CONTRACT_CANCELLED',
  'UTILITY_READING_SUBMITTED', 'UTILITY_READING_APPROVED', 'UTILITY_READING_REJECTED',
  'INVOICE_CREATED', 'INVOICE_UPDATED', 'INVOICE_ISSUED', 'INVOICE_VOIDED',
  'PAYMENT_PROOF_SUBMITTED', 'PAYMENT_PROOF_APPROVED', 'PAYMENT_PROOF_REJECTED', 'PAYMENT_REVERSED',
  'TENANT_IDENTITY_DOCUMENT_CREATED', 'TENANT_IDENTITY_DOCUMENT_VIEWED', 'TENANT_IDENTITY_DOCUMENT_DOWNLOADED', 'TENANT_IDENTITY_DOCUMENT_DELETED',
  'USER_ACTIVATED', 'USER_DEACTIVATED', 'USER_PASSWORD_CHANGED',
  'MANAGER_TWO_FACTOR_SETUP_STARTED', 'MANAGER_TWO_FACTOR_ENABLED', 'MANAGER_TWO_FACTOR_DISABLED',
  'DATA_IMPORTED',
].map((value) => ({ value, label: value }))
const entityOptions = ['BUILDING', 'ROOM', 'TENANT', 'CONTRACT', 'UTILITY_READING', 'INVOICE', 'PAYMENT_PROOF', 'PAYMENT', 'TENANT_DOCUMENT', 'APP_USER']
  .map((value) => ({ value, label: value }))
const actorRoleOptions: AuditActorRole[] = ['MANAGER', 'TENANT', 'SYSTEM', 'ANONYMOUS']

interface FilterFormValues {
  period?: [Dayjs, Dayjs]
  actorRole?: AuditActorRole
  action?: string
  entityType?: string
  search?: string
  requestId?: string
}

const formatJson = (value: Record<string, unknown> | null): string => (
  value ? JSON.stringify(value, null, 2) : 'No snapshot'
)

export function AuditLogsPage() {
  const { t } = useI18n()
  const screens = Grid.useBreakpoint()
  const [form] = Form.useForm<FilterFormValues>()
  const [items, setItems] = useState<AuditLogItem[]>([])
  const [filters, setFilters] = useState<AuditLogFilters>({ page: 1, pageSize: 25 })
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AuditLogItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await listAuditLogs(filters)
      setItems(response.items)
      setTotal(response.pagination.total)
    } catch (loadError) {
      setError(getUserErrorMessage(loadError, 'Unable to load audit logs.'))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void load()
  }, [load])

  const applyFilters = (values: FilterFormValues) => {
    setFilters({
      page: 1,
      pageSize: filters.pageSize,
      from: values.period?.[0].startOf('day').toISOString(),
      to: values.period?.[1].endOf('day').toISOString(),
      actorRole: values.actorRole,
      action: values.action,
      entityType: values.entityType,
      requestId: values.requestId?.trim() || undefined,
      search: values.search?.trim() || undefined,
    })
  }

  const columns = useMemo<ColumnsType<AuditLogItem>>(() => [
    {
      title: t("Timestamp"),
      dataIndex: 'created_at',
      width: 175,
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm:ss'),
    },
    { title: t("Action"), dataIndex: 'action', width: 245, render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
    {
      title: t("Actor"),
      width: 190,
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{row.actor_name ?? row.actor_user_id ?? 'System'}</Typography.Text>
          <Tag>{row.actor_role}</Tag>
        </Space>
      ),
    },
    {
      title: t("Entity"),
      width: 210,
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{row.entity_type}</Typography.Text>
          <Typography.Text type="secondary" copyable={Boolean(row.entity_id)}>{row.entity_id ?? '-'}</Typography.Text>
        </Space>
      ),
    },
    { title: t("Request ID"), dataIndex: 'request_id', width: 210, ellipsis: true, render: (value: string | null) => value ? <Typography.Text copyable>{value}</Typography.Text> : '-' },
    {
      title: t("Details"),
      key: 'details',
      fixed: 'right',
      width: 72,
      align: 'center',
      render: (_: unknown, row) => (
        <Tooltip title={t("View audit detail")}>
          <Button type="text" icon={<EyeOutlined />} aria-label={t("View audit detail")} onClick={() => setSelected(row)} />
        </Tooltip>
      ),
    },
  ], [t])

  const changePage = (pagination: TablePaginationConfig) => {
    setFilters((current) => ({
      ...current,
      page: pagination.current ?? 1,
      pageSize: pagination.pageSize ?? 25,
    }))
  }

  return (
    <>
      <Space direction="vertical" size={16} className="audit-page">
        <div className="audit-header">
          <div>
            <Typography.Title level={3}>{t("Audit Log")}</Typography.Title>
            <Typography.Text type="secondary">{t("Trace important changes and security-sensitive activity.")}</Typography.Text>
          </div>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>{t("Refresh")}</Button>
        </div>

        {error ? <Alert type="error" showIcon message={error} /> : null}

        <Form form={form} layout="vertical" onFinish={applyFilters} className="audit-filters">
          <Form.Item name="period" label={t("Period")}><RangePicker showTime allowClear /></Form.Item>
          <Form.Item name="action" label={t("Action")}><Select allowClear showSearch options={actionOptions} placeholder={t("All actions")} /></Form.Item>
          <Form.Item name="entityType" label={t("Entity type")}><Select allowClear options={entityOptions} placeholder={t("All entity types")} /></Form.Item>
          <Form.Item name="actorRole" label={t("Actor role")}><Select allowClear options={actorRoleOptions.map((value) => ({ value, label: value }))} placeholder={t("All actor roles")} /></Form.Item>
          <Form.Item name="requestId" label={t("Request ID")}><Input allowClear placeholder={t("Request ID")} /></Form.Item>
          <Form.Item name="search" label={t("Search")}><Input allowClear prefix={<SearchOutlined />} placeholder={t("Action, entity, actor")} /></Form.Item>
          <div className="audit-filter-actions">
            <Button htmlType="button" onClick={() => {
              form.resetFields()
              setFilters({ page: 1, pageSize: filters.pageSize })
            }}>{t("Reset")}</Button>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t("Apply filters")}</Button>
          </div>
        </Form>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          columns={columns}
          scroll={{ x: 1100 }}
          locale={{ emptyText: <Empty description={t("No audit events found")} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          pagination={{ current: filters.page, pageSize: filters.pageSize, total, showSizeChanger: true, pageSizeOptions: [25, 50, 100], showTotal: (value) => `${value} events` }}
          onChange={changePage}
        />

        <Drawer
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          title={t("Audit detail")}
          width={screens.md ? 720 : '100%'}
        >
          {selected ? (
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              <Descriptions bordered size="small" column={screens.md ? 2 : 1}>
                <Descriptions.Item label={t("Timestamp")}>{dayjs(selected.created_at).format('DD/MM/YYYY HH:mm:ss')}</Descriptions.Item>
                <Descriptions.Item label={t("Action")}><Typography.Text code>{selected.action}</Typography.Text></Descriptions.Item>
                <Descriptions.Item label={t("Actor")}>{selected.actor_name ?? selected.actor_user_id ?? 'System'}</Descriptions.Item>
                <Descriptions.Item label={t("Actor role")}>{selected.actor_role}</Descriptions.Item>
                <Descriptions.Item label={t("Entity type")}>{selected.entity_type}</Descriptions.Item>
                <Descriptions.Item label={t("Entity ID")}>{selected.entity_id ?? '-'}</Descriptions.Item>
                <Descriptions.Item label={t("Request ID")} span={2}>{selected.request_id ?? '-'}</Descriptions.Item>
                <Descriptions.Item label={t("User agent")} span={2}>{selected.user_agent ?? '-'}</Descriptions.Item>
              </Descriptions>
              <section><Typography.Title level={5}>{t("Metadata")}</Typography.Title><pre className="audit-json">{formatJson(selected.metadata)}</pre></section>
              <section><Typography.Title level={5}>{t("Before snapshot")}</Typography.Title><pre className="audit-json">{formatJson(selected.before_snapshot)}</pre></section>
              <section><Typography.Title level={5}>{t("After snapshot")}</Typography.Title><pre className="audit-json">{formatJson(selected.after_snapshot)}</pre></section>
            </Space>
          ) : null}
        </Drawer>
      </Space>
    </>
  )
}
