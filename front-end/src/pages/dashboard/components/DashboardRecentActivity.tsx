import { Alert, Button, Card, Col, Empty, Row, Skeleton, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { DashboardRecentActivityItem, DashboardUnpaidInvoiceItem } from '../types'

interface DashboardRecentActivityProps {
  loading: boolean
  error: string | null
  tenants: DashboardRecentActivityItem[]
  unpaidInvoices: DashboardUnpaidInvoiceItem[]
  currencyFormatter: (value: number) => string
  onRetry: () => void
  onNavigate: (path: string) => void
}

const tenantColumns: ColumnsType<DashboardRecentActivityItem> = [
  { title: 'Tenant', dataIndex: 'tenantName', key: 'tenantName', ellipsis: true },
  { title: 'Building', dataIndex: 'buildingName', key: 'buildingName', ellipsis: true },
  { title: 'Room', dataIndex: 'roomCode', key: 'roomCode', width: 96 },
  { title: 'Contract', dataIndex: 'contractCode', key: 'contractCode', width: 120 },
  {
    title: 'Created',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 140,
    render: (value: string) => dayjs(value).format('DD/MM/YYYY'),
  },
]

export function DashboardRecentActivity({
  loading,
  error,
  tenants,
  unpaidInvoices,
  currencyFormatter,
  onRetry,
  onNavigate,
}: DashboardRecentActivityProps) {
  const invoiceColumns: ColumnsType<DashboardUnpaidInvoiceItem> = [
    { title: 'Room', dataIndex: 'roomCode', key: 'roomCode', width: 90 },
    { title: 'Building', dataIndex: 'buildingName', key: 'buildingName', ellipsis: true },
    {
      title: 'Month',
      dataIndex: 'month',
      key: 'month',
      width: 110,
      render: (value: string) => dayjs(value).format('MM/YYYY'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: string) => <Tag color={value === 'OVERDUE' ? 'red' : 'gold'}>{value}</Tag>,
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      width: 150,
      render: (value: number) => currencyFormatter(value),
    },
  ]

  return (
    <Space direction="vertical" size={16} className="dashboard-recent-wrap">
      <Card bordered={false} className="dashboard-card">
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Typography.Title level={5} style={{ margin: 0 }}>
              Quick actions
            </Typography.Title>
          </Col>
          <Col>
            <Space wrap>
              <Button onClick={() => onNavigate('/buildings')}>Add Building</Button>
              <Button onClick={() => onNavigate('/rooms')}>Add Room</Button>
              <Button onClick={() => onNavigate('/tenants')}>Add Tenant</Button>
              <Button onClick={() => onNavigate('/payments')}>View Bills</Button>
              <Button onClick={() => onNavigate('/reports')}>View Reports</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {error ? (
        <Alert
          type="error"
          message="Dashboard data could not be loaded"
          description={error}
          action={
            <Button size="small" onClick={onRetry}>
              Retry
            </Button>
          }
          showIcon
        />
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card title="Recent tenants" className="dashboard-card" bordered={false}>
            {loading ? (
              <Skeleton active paragraph={{ rows: 6 }} title={false} />
            ) : tenants.length === 0 ? (
              <Empty description="No recent tenants" />
            ) : (
              <Table rowKey="id" pagination={false} size="small" columns={tenantColumns} dataSource={tenants} scroll={{ x: 680 }} />
            )}
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card title="Recent unpaid bills" className="dashboard-card" bordered={false}>
            {loading ? (
              <Skeleton active paragraph={{ rows: 6 }} title={false} />
            ) : unpaidInvoices.length === 0 ? (
              <Empty description="No unpaid invoices" />
            ) : (
              <Table
                rowKey="id"
                pagination={false}
                size="small"
                columns={invoiceColumns}
                dataSource={unpaidInvoices}
                scroll={{ x: 500 }}
              />
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  )
}
