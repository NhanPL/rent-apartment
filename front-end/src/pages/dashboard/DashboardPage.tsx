import { ReloadOutlined } from '@ant-design/icons'
import { Badge, Button, DatePicker, Select, Space, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { dashboardFormatters, getDashboardData, listDashboardBuildings } from '../../services/dashboardService'
import { getUserErrorMessage } from '../../services/errorMessage'
import { useI18n } from '../../i18n'
import { DashboardCharts } from './components/DashboardCharts'
import { DashboardRecentActivity } from './components/DashboardRecentActivity'
import { DashboardSummaryCards } from './components/DashboardSummaryCards'
import type { DashboardBuildingOption, DashboardData } from './types'
import './DashboardPage.css'

interface DashboardPageProps {
  onNavigate: (path: string) => void
}

export const DASHBOARD_REFRESH_INTERVAL_MS = 15_000

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'))
  const [buildingId, setBuildingId] = useState<string | undefined>()
  const [buildings, setBuildings] = useState<DashboardBuildingOption[]>([])
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [liveRefreshFailed, setLiveRefreshFailed] = useState(false)

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }

    try {
      const result = await getDashboardData({
        month: month.format('YYYY-MM'),
        buildingId,
      })
      setData(result)
      setLastUpdatedAt(new Date())
      setLiveRefreshFailed(false)
    } catch (requestError) {
      if (silent) setLiveRefreshFailed(true)
      else setError(getUserErrorMessage(requestError, 'Khong tai duoc du lieu tong quan.'))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [buildingId, month])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void loadDashboard(true)
    }
    const intervalId = window.setInterval(refreshIfVisible, DASHBOARD_REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
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
    <>
    <Space direction="vertical" size={16} className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {t("Portfolio Overview")}
          </Typography.Title>
          <Typography.Text type="secondary">
            {t("Metrics are derived from building, room, contract, tenant, invoice, and payment entities.")}
          </Typography.Text>
          <Space size={8} className="dashboard-live-status">
            <Badge status={liveRefreshFailed ? 'warning' : 'processing'} />
            <Typography.Text type="secondary">
              {liveRefreshFailed
                ? t('Live update paused. Retrying automatically.')
                : lastUpdatedAt
                  ? `${t('Live')} | ${t('Last updated')} ${lastUpdatedAt.toLocaleTimeString()}`
                  : t('Connecting live updates...')}
            </Typography.Text>
          </Space>
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
            placeholder={t("All buildings")}
            value={buildingId}
            onChange={(value) => setBuildingId(value)}
            options={buildings.map((building) => ({ value: building.id, label: building.name }))}
            className="dashboard-building-filter"
          />
          <Button icon={<ReloadOutlined />} onClick={() => void loadDashboard(false)}>
            {t("Refresh")}
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
        onRetry={() => void loadDashboard(false)}
        onNavigate={onNavigate}
      />
    </Space>
    </>
  )
}
