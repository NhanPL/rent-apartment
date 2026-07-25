import { ReloadOutlined } from '@ant-design/icons'
import { Button, DatePicker, Select, Space, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { dashboardFormatters, getDashboardData, listDashboardBuildings } from '../../services/dashboardService'
import { getUserErrorMessage } from '../../services/errorMessage'
import { Localized } from '../../shared/components/Localized'
import { useI18n } from '../../i18n'
import { DashboardCharts } from './components/DashboardCharts'
import { DashboardRecentActivity } from './components/DashboardRecentActivity'
import { DashboardSummaryCards } from './components/DashboardSummaryCards'
import type { DashboardBuildingOption, DashboardData } from './types'
import './DashboardPage.css'

interface DashboardPageProps {
  onNavigate: (path: string) => void
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { language } = useI18n()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'))
  const [buildingId, setBuildingId] = useState<string | undefined>()
  const [buildings, setBuildings] = useState<DashboardBuildingOption[]>([])

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await getDashboardData({
        month: month.format('YYYY-MM'),
        buildingId,
      })
      setData(result)
    } catch (requestError) {
      setError(getUserErrorMessage(requestError, 'Khong tai duoc du lieu tong quan.'))
    } finally {
      setLoading(false)
    }
  }, [buildingId, language, month])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    let active = true

    listDashboardBuildings()
      .then((items) => {
        if (active) setBuildings(items)
      })
      .catch(() => {
        if (active) setBuildings([])
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <Localized>
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
        <Space wrap className="dashboard-page-actions">
          <DatePicker
            picker="month"
            allowClear={false}
            value={month}
            onChange={(value) => setMonth((value ?? dayjs()).startOf('month'))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="All buildings"
            value={buildingId}
            onChange={(value) => setBuildingId(value)}
            options={buildings.map((building) => ({ value: building.id, label: building.name }))}
            className="dashboard-building-filter"
          />
          <Button icon={<ReloadOutlined />} onClick={() => void loadDashboard()}>
            Refresh
          </Button>
        </Space>
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
    </Localized>
  )
}
