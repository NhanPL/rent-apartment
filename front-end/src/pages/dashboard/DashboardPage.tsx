import { ReloadOutlined } from '@ant-design/icons'
import { Button, Space, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { dashboardFormatters, getDashboardData } from '../../services/dashboardService'
import { DashboardCharts } from './components/DashboardCharts'
import { DashboardRecentActivity } from './components/DashboardRecentActivity'
import { DashboardSummaryCards } from './components/DashboardSummaryCards'
import type { DashboardData } from './types'
import './DashboardPage.css'

interface DashboardPageProps {
  onNavigate: (path: string) => void
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await getDashboardData()
      setData(result)
    } catch {
      setError('Please try again in a moment.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  return (
    <Space direction="vertical" size={16} className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Portfolio Overview
          </Typography.Title>
          <Typography.Text type="secondary">
            Metrics are derived from building, room, contract, tenant, invoice, and payment entities.
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void loadDashboard()}>
          Refresh
        </Button>
      </div>

      <DashboardSummaryCards
        loading={loading}
        summary={data?.summary ?? null}
        currencyFormatter={dashboardFormatters.currency}
      />

      <DashboardCharts
        loading={loading}
        roomStatusData={data?.roomStatusChart ?? []}
        monthlyRevenueData={data?.monthlyRevenueChart ?? []}
        buildingDistributionData={data?.buildingDistributionChart ?? []}
        currencyFormatter={dashboardFormatters.currency}
      />

      <DashboardRecentActivity
        loading={loading}
        error={error}
        tenants={data?.recentTenants ?? []}
        unpaidInvoices={data?.recentUnpaidInvoices ?? []}
        currencyFormatter={dashboardFormatters.currency}
        onRetry={() => void loadDashboard()}
        onNavigate={onNavigate}
      />
    </Space>
  )
}
