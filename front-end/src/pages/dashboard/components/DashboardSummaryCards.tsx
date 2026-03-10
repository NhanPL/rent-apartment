import {
  BankOutlined,
  DollarOutlined,
  HomeOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Card, Col, Row, Skeleton, Space, Statistic, Typography } from 'antd'
import type { DashboardSummary } from '../types'

interface DashboardSummaryCardsProps {
  loading: boolean
  summary: DashboardSummary | null
  currencyFormatter: (value: number) => string
}

export function DashboardSummaryCards({ loading, summary, currencyFormatter }: DashboardSummaryCardsProps) {
  if (loading || !summary) {
    return (
      <Row gutter={[16, 16]}>
        {Array.from({ length: 8 }).map((_, index) => (
          <Col key={index} xs={24} sm={12} xl={6}>
            <Card>
              <Skeleton active paragraph={{ rows: 1 }} title={false} />
            </Card>
          </Col>
        ))}
      </Row>
    )
  }

  const items = [
    { label: 'Total Buildings', value: summary.totalBuildings, icon: <BankOutlined /> },
    { label: 'Total Rooms', value: summary.totalRooms, icon: <HomeOutlined /> },
    { label: 'Occupied Rooms', value: summary.occupiedRooms, icon: <HomeOutlined /> },
    { label: 'Vacant Rooms', value: summary.vacantRooms, icon: <HomeOutlined /> },
    { label: 'Total Tenants', value: summary.totalTenants, icon: <TeamOutlined /> },
    { label: 'Overdue Bills', value: summary.overdueInvoices, icon: <WarningOutlined /> },
    {
      label: 'Monthly Revenue',
      value: currencyFormatter(summary.monthlyRevenue),
      icon: <DollarOutlined />,
      subtitle: 'Collected from successful payments this month',
    },
    {
      label: 'Occupancy Rate',
      value: `${summary.occupancyRate}%`,
      icon: <TeamOutlined />,
      subtitle: `${summary.occupiedRooms}/${summary.totalRooms} rooms occupied`,
    },
  ]

  return (
    <Row gutter={[16, 16]}>
      {items.map((item) => (
        <Col key={item.label} xs={24} sm={12} xl={6}>
          <Card className="dashboard-kpi-card" bordered={false}>
            <Space className="dashboard-kpi-header" align="start">
              <span className="dashboard-kpi-icon">{item.icon}</span>
              <Statistic title={item.label} value={item.value} valueStyle={{ fontSize: 24 }} />
            </Space>
            {item.subtitle ? (
              <Typography.Text type="secondary" className="dashboard-kpi-subtitle">
                {item.subtitle}
              </Typography.Text>
            ) : null}
          </Card>
        </Col>
      ))}
    </Row>
  )
}
