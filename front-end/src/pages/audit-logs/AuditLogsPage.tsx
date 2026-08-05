import { EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Button, DatePicker, Descriptions, Drawer, Empty, Form, Grid, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Localized } from '../../shared/components/Localized'
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
].map((value) => ({ value, label: value }))
const entityOptions = ['CONTRACT', 'UTILITY_READING', 'INVOICE', 'PAYMENT_PROOF', 'PAYMENT', 'TENANT_DOCUMENT', 'APP_USER']
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
      title: 'Timestamp',
      dataIndex: 'created_at',
      width: 175,
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm:ss'),
    },
    { title: 'Action', dataIndex: 'action', width: 245, render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
    {
      title: 'Actor',
      width: 190,
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{row.actor_name ?? row.actor_user_id ?? 'System'}</Typography.Text>
          <Tag>{row.actor_role}</Tag>
        </Space>
      ),
    },
    {
      title: 'Entity',
      width: 210,
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{row.entity_type}</Typography.Text>
          <Typography.Text type="secondary" copyable={Boolean(row.entity_id)}>{row.entity_id ?? '-'}</Typography.Text>
        </Space>
      ),
    },
    { title: 'Request ID', dataIndex: 'request_id', width: 210, ellipsis: true, render: (value: string | null) => value ? <Typography.Text copyable>{value}</Typography.Text> : '-' },
    {
      title: 'Details',
      key: 'details',
      fixed: 'right',
      width: 72,
      align: 'center',
      render: (_: unknown, row) => (
        <Tooltip title="View audit detail">
          <Button type="text" icon={<EyeOutlined />} aria-label="View audit detail" onClick={() => setSelected(row)} />
        </Tooltip>
      ),
    },
  ], [])

  const changePage = (pagination: TablePaginationConfig) => {
    setFilters((current) => ({
      ...current,
      page: pagination.current ?? 1,
      pageSize: pagination.pageSize ?? 25,
    }))
  }

  return (
    <Localized>
      <Space direction="vertical" size={16} className="audit-page">
        <div className="audit-header">
          <div>
            <Typography.Title level={3}>Audit Log</Typography.Title>
            <Typography.Text type="secondary">Trace important changes and security-sensitive activity.</Typography.Text>
          </div>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>Refresh</Button>
        </div>

        {error ? <Alert type="error" showIcon message={error} /> : null}

        <Form form={form} layout="vertical" onFinish={applyFilters} className="audit-filters">
          <Form.Item name="period" label="Period"><RangePicker showTime allowClear /></Form.Item>
          <Form.Item name="action" label="Action"><Select allowClear showSearch options={actionOptions} placeholder="All actions" /></Form.Item>
          <Form.Item name="entityType" label="Entity type"><Select allowClear options={entityOptions} placeholder="All entity types" /></Form.Item>
          <Form.Item name="actorRole" label="Actor role"><Select allowClear options={actorRoleOptions.map((value) => ({ value, label: value }))} placeholder="All actor roles" /></Form.Item>
          <Form.Item name="requestId" label="Request ID"><Input allowClear placeholder="Request ID" /></Form.Item>
          <Form.Item name="search" label="Search"><Input allowClear prefix={<SearchOutlined />} placeholder="Action, entity, actor" /></Form.Item>
          <div className="audit-filter-actions">
            <Button htmlType="button" onClick={() => {
              form.resetFields()
              setFilters({ page: 1, pageSize: filters.pageSize })
            }}>Reset</Button>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>Apply filters</Button>
          </div>
        </Form>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          columns={columns}
          scroll={{ x: 1100 }}
          locale={{ emptyText: <Empty description="No audit events found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          pagination={{ current: filters.page, pageSize: filters.pageSize, total, showSizeChanger: true, pageSizeOptions: [25, 50, 100], showTotal: (value) => `${value} events` }}
          onChange={changePage}
        />

        <Drawer
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          title="Audit detail"
          width={screens.md ? 720 : '100%'}
        >
          {selected ? (
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              <Descriptions bordered size="small" column={screens.md ? 2 : 1}>
                <Descriptions.Item label="Timestamp">{dayjs(selected.created_at).format('DD/MM/YYYY HH:mm:ss')}</Descriptions.Item>
                <Descriptions.Item label="Action"><Typography.Text code>{selected.action}</Typography.Text></Descriptions.Item>
                <Descriptions.Item label="Actor">{selected.actor_name ?? selected.actor_user_id ?? 'System'}</Descriptions.Item>
                <Descriptions.Item label="Actor role">{selected.actor_role}</Descriptions.Item>
                <Descriptions.Item label="Entity type">{selected.entity_type}</Descriptions.Item>
                <Descriptions.Item label="Entity ID">{selected.entity_id ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="Request ID" span={2}>{selected.request_id ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="User agent" span={2}>{selected.user_agent ?? '-'}</Descriptions.Item>
              </Descriptions>
              <section><Typography.Title level={5}>Metadata</Typography.Title><pre className="audit-json">{formatJson(selected.metadata)}</pre></section>
              <section><Typography.Title level={5}>Before snapshot</Typography.Title><pre className="audit-json">{formatJson(selected.before_snapshot)}</pre></section>
              <section><Typography.Title level={5}>After snapshot</Typography.Title><pre className="audit-json">{formatJson(selected.after_snapshot)}</pre></section>
            </Space>
          ) : null}
        </Drawer>
      </Space>
    </Localized>
  )
}
