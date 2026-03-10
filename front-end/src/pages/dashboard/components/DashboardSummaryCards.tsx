import {
  BankOutlined,
  DollarOutlined,
  HomeOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Card, Col, Grid, Row, Skeleton, Space, Statistic, Typography } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import type { DashboardSummary } from '../types'

interface DashboardSummaryCardsProps {
  loading: boolean
  summary: DashboardSummary | null
  currencyFormatter: (value: number) => string
}

interface SummaryCardItem {
  key: string
  label: string
  value: number | string
  icon: ReactNode
  iconBg: string
  iconColor: string
  subtitle?: string
}

const ICON_CONTAINER_SIZE = 56
const ICON_SIZE_DESKTOP = 30
const ICON_SIZE_MOBILE = 26

const subtitleStyle: CSSProperties = {
  display: 'block',
  marginTop: 8,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const cardBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
}

export function DashboardSummaryCards({ loading, summary, currencyFormatter }: DashboardSummaryCardsProps) {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.sm
  const iconSize = isMobile ? ICON_SIZE_MOBILE : ICON_SIZE_DESKTOP

  if (loading || !summary) {
    return (
      <Row gutter={[16, 16]}>
        {Array.from({ length: 8 }).map((_, index) => (
          <Col key={index} xs={24} sm={12} xl={6}>
            <Card style={{ height: '100%' }}>
              <Skeleton active paragraph={{ rows: 1 }} title={false} />
            </Card>
          </Col>
        ))}
      </Row>
    )
  }

  const items: SummaryCardItem[] = [
    {
      key: 'total-buildings',
      label: 'Total Buildings',
      value: summary.totalBuildings,
      icon: <BankOutlined style={{ fontSize: iconSize }} />,
      iconBg: '#E6F4FF',
      iconColor: '#1677FF',
    },
    {
      key: 'total-rooms',
      label: 'Total Rooms',
      value: summary.totalRooms,
      icon: <HomeOutlined style={{ fontSize: iconSize }} />,
      iconBg: '#F6FFED',
      iconColor: '#52C41A',
    },
    {
      key: 'occupied-rooms',
      label: 'Occupied Rooms',
      value: summary.occupiedRooms,
      icon: <HomeOutlined style={{ fontSize: iconSize }} />,
      iconBg: '#FFF7E6',
      iconColor: '#FA8C16',
    },
    {
      key: 'vacant-rooms',
      label: 'Vacant Rooms',
      value: summary.vacantRooms,
      icon: <HomeOutlined style={{ fontSize: iconSize }} />,
      iconBg: '#F9F0FF',
      iconColor: '#722ED1',
    },
    {
      key: 'total-tenants',
      label: 'Total Tenants',
      value: summary.totalTenants,
      icon: <TeamOutlined style={{ fontSize: iconSize }} />,
      iconBg: '#FFF1F0',
      iconColor: '#F5222D',
    },
    {
      key: 'overdue-bills',
      label: 'Overdue Bills',
      value: summary.overdueInvoices,
      icon: <WarningOutlined style={{ fontSize: iconSize }} />,
      iconBg: '#FFFBE6',
      iconColor: '#D48806',
    },
    {
      key: 'monthly-revenue',
      label: 'Monthly Revenue',
      value: currencyFormatter(summary.monthlyRevenue),
      icon: <DollarOutlined style={{ fontSize: iconSize }} />,
      iconBg: '#E6FFFB',
      iconColor: '#13C2C2',
      subtitle: 'Collected from successful payments this month',
    },
    {
      key: 'occupancy-rate',
      label: 'Occupancy Rate',
      value: `${summary.occupancyRate}%`,
      icon: <TeamOutlined style={{ fontSize: iconSize }} />,
      iconBg: '#F0F5FF',
      iconColor: '#2F54EB',
      subtitle: `${summary.occupiedRooms}/${summary.totalRooms} rooms occupied`,
    },
  ]

  return (
    <Row gutter={[16, 16]}>
      {items.map((item) => (
        <Col key={item.key} xs={24} sm={12} xl={6}>
          <Card className="dashboard-kpi-card" bordered={false} style={{ height: '100%' }} bodyStyle={cardBodyStyle}>
            <Space size={12} align="start">
              <span
                className="dashboard-kpi-icon"
                style={{
                  width: ICON_CONTAINER_SIZE,
                  height: ICON_CONTAINER_SIZE,
                  borderRadius: 12,
                  color: item.iconColor,
                  background: item.iconBg,
                }}
              >
                {item.icon}
              </span>
              <Statistic title={item.label} value={item.value} valueStyle={{ fontSize: 24 }} />
            </Space>
            <Typography.Text type="secondary" style={subtitleStyle}>
              {item.subtitle ?? '\u00A0'}
            </Typography.Text>
          </Card>
        </Col>
      ))}
    </Row>
  )
}
