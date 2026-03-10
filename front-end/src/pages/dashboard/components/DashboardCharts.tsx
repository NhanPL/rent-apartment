import { Card, Col, Empty, Grid, Row, Skeleton, Space, Typography } from 'antd'
import type {
  DashboardBuildingDistributionPoint,
  DashboardMonthlyRevenuePoint,
  DashboardRoomStatusPoint,
} from '../types'

interface DashboardChartsProps {
  loading: boolean
  roomStatusData: DashboardRoomStatusPoint[]
  monthlyRevenueData: DashboardMonthlyRevenuePoint[]
  buildingDistributionData: DashboardBuildingDistributionPoint[]
  currencyFormatter: (value: number) => string
}

function maxOf(values: number[]) {
  return values.length === 0 ? 0 : Math.max(...values)
}

function ratio(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0
}

export function DashboardCharts({
  loading,
  roomStatusData,
  monthlyRevenueData,
  buildingDistributionData,
  currencyFormatter,
}: DashboardChartsProps) {
  const screens = Grid.useBreakpoint()
  const compact = !screens.md
  const occupancyTotal = roomStatusData.reduce((sum, item) => sum + item.value, 0)
  const monthlyMax = maxOf(monthlyRevenueData.map((item) => item.billed))
  const buildingMax = maxOf(buildingDistributionData.map((item) => item.totalRooms))

  if (loading) {
    return (
      <Row gutter={[16, 16]}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Col key={index} xs={24} lg={index === 2 ? 24 : 12}>
            <Card>
              <Skeleton active paragraph={{ rows: 6 }} title={false} />
            </Card>
          </Col>
        ))}
      </Row>
    )
  }

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card title="Room occupancy / status" className="dashboard-card" bordered={false}>
          {roomStatusData.length === 0 ? (
            <Empty description="No room status data" />
          ) : (
            <div className="dashboard-donut-wrap">
              <div
                className="dashboard-donut"
                style={{
                  background: `conic-gradient(${roomStatusData
                    .map((item, index) => {
                      const previous = roomStatusData
                        .slice(0, index)
                        .reduce((sum, current) => sum + (occupancyTotal ? current.value / occupancyTotal : 0), 0)
                      const size = occupancyTotal ? item.value / occupancyTotal : 0
                      return `${item.color} ${Math.round(previous * 100)}% ${Math.round((previous + size) * 100)}%`
                    })
                    .join(', ')})`,
                }}
              >
                <span>{occupancyTotal}</span>
                <Typography.Text type="secondary">rooms</Typography.Text>
              </div>
              <Space direction="vertical" size={10} className="dashboard-donut-legend">
                {roomStatusData.map((item) => (
                  <div key={item.label} className="dashboard-legend-row">
                    <span className="dashboard-legend-dot" style={{ background: item.color }} />
                    <Typography.Text>{item.label}</Typography.Text>
                    <Typography.Text strong>{item.value}</Typography.Text>
                  </div>
                ))}
              </Space>
            </div>
          )}
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card title="Monthly billing trend" className="dashboard-card" bordered={false}>
          {monthlyRevenueData.length === 0 ? (
            <Empty description="No invoice data" />
          ) : (
            <Space direction="vertical" size={12} className="dashboard-bar-chart">
              {monthlyRevenueData.map((item) => (
                <div key={item.month} className="dashboard-bar-group">
                  <div className="dashboard-bar-label-row">
                    <Typography.Text strong>{item.month}</Typography.Text>
                    <Typography.Text type="secondary">Billed: {currencyFormatter(item.billed)}</Typography.Text>
                  </div>
                  <div className="dashboard-bar-track">
                    <div className="dashboard-bar-segment billed" style={{ width: `${ratio(item.billed, monthlyMax)}%` }} />
                    <div className="dashboard-bar-segment collected" style={{ width: `${ratio(item.collected, monthlyMax)}%` }} />
                    <div className="dashboard-bar-segment unpaid" style={{ width: `${ratio(item.unpaid, monthlyMax)}%` }} />
                  </div>
                  {!compact ? (
                    <Typography.Text type="secondary" className="dashboard-bar-meta">
                      Collected {currencyFormatter(item.collected)} · Unpaid {currencyFormatter(item.unpaid)}
                    </Typography.Text>
                  ) : null}
                </div>
              ))}
            </Space>
          )}
        </Card>
      </Col>

      <Col xs={24}>
        <Card title="Rooms by building" className="dashboard-card" bordered={false}>
          {buildingDistributionData.length === 0 ? (
            <Empty description="No building distribution" />
          ) : (
            <Space direction="vertical" size={12} className="dashboard-horizontal-bars">
              {buildingDistributionData.map((item) => (
                <div key={item.buildingId} className="dashboard-horizontal-row">
                  <div className="dashboard-horizontal-header">
                    <Typography.Text strong>{item.buildingName}</Typography.Text>
                    <Typography.Text type="secondary">
                      {item.occupiedRooms}/{item.totalRooms} occupied
                    </Typography.Text>
                  </div>
                  <div className="dashboard-horizontal-track">
                    <div className="dashboard-horizontal-total" style={{ width: `${ratio(item.totalRooms, buildingMax)}%` }}>
                      <div
                        className="dashboard-horizontal-occupied"
                        style={{ width: `${ratio(item.occupiedRooms, item.totalRooms)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </Space>
          )}
        </Card>
      </Col>
    </Row>
  )
}
