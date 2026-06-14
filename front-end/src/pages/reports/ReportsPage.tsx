import {
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Progress,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { exportReportsCsv, getReportsData, listReportBuildings } from '../../services/reportsService'
import type {
  DebtReportRow,
  OccupancyReportRow,
  ReportBuildingOption,
  ReportFilters,
  ReportInvoiceStatus,
  ReportSection,
  ReportsData,
  RevenueBuildingRow,
  RevenueMonthRow,
} from './types'
import './ReportsPage.css'

const invoiceStatusOptions: { label: string; value: ReportInvoiceStatus; color: string }[] = [
  { label: 'Draft', value: 'DRAFT', color: 'default' },
  { label: 'Issued', value: 'ISSUED', color: 'blue' },
  { label: 'Paid', value: 'PAID', color: 'green' },
  { label: 'Overdue', value: 'OVERDUE', color: 'red' },
  { label: 'Void', value: 'VOID', color: 'default' },
]

const currency = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

const formatCurrency = (value: number) => currency.format(value)
const formatMonth = (value: string) => dayjs(`${value.slice(0, 7)}-01`).format('MM/YYYY')
const formatDate = (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY') : '-')

const statusTag = (status: ReportInvoiceStatus) => {
  const option = invoiceStatusOptions.find((item) => item.value === status)
  return <Tag color={option?.color}>{option?.label ?? status}</Tag>
}

const defaultRange = (): [Dayjs, Dayjs] => [
  dayjs().subtract(5, 'month').startOf('month'),
  dayjs().startOf('month'),
]

export function ReportsPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => defaultRange())
  const [buildingId, setBuildingId] = useState<string | undefined>()
  const [status, setStatus] = useState<ReportInvoiceStatus | undefined>()
  const [buildings, setBuildings] = useState<ReportBuildingOption[]>([])
  const [data, setData] = useState<ReportsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<ReportSection>('revenue')
  const [exporting, setExporting] = useState(false)

  const filters = useMemo<ReportFilters>(() => ({
    monthFrom: range[0].format('YYYY-MM'),
    monthTo: range[1].format('YYYY-MM'),
    buildingId,
    status,
  }), [buildingId, range, status])

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      setData(await getReportsData(filters))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load reports.')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  useEffect(() => {
    let active = true

    listReportBuildings()
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

  const downloadCsv = useCallback(async () => {
    setExporting(true)

    try {
      const content = await exportReportsCsv(filters, activeSection)
      const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `reports-${activeSection}-${filters.monthFrom}-${filters.monthTo}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (requestError) {
      message.error(requestError instanceof Error ? requestError.message : 'Unable to export CSV.')
    } finally {
      setExporting(false)
    }
  }, [activeSection, filters])

  const monthlyRevenueColumns: ColumnsType<RevenueMonthRow> = [
    { title: 'Month', dataIndex: 'month', width: 120, render: (value: string) => formatMonth(value) },
    { title: 'Invoices', dataIndex: 'invoiceCount', width: 110, align: 'right' },
    { title: 'Billed', dataIndex: 'billed', width: 160, align: 'right', render: formatCurrency },
    { title: 'Collected', dataIndex: 'collected', width: 160, align: 'right', render: formatCurrency },
    { title: 'Unpaid', dataIndex: 'unpaid', width: 160, align: 'right', render: formatCurrency },
  ]

  const buildingRevenueColumns: ColumnsType<RevenueBuildingRow> = [
    { title: 'Building', dataIndex: 'buildingName', width: 220 },
    { title: 'Invoices', dataIndex: 'invoiceCount', width: 110, align: 'right' },
    { title: 'Billed', dataIndex: 'billed', width: 160, align: 'right', render: formatCurrency },
    { title: 'Collected', dataIndex: 'collected', width: 160, align: 'right', render: formatCurrency },
    { title: 'Unpaid', dataIndex: 'unpaid', width: 160, align: 'right', render: formatCurrency },
  ]

  const debtColumns: ColumnsType<DebtReportRow> = [
    { title: 'Building', dataIndex: 'buildingName', width: 190 },
    { title: 'Room', dataIndex: 'roomCode', width: 100 },
    { title: 'Tenant', dataIndex: 'tenantName', width: 180 },
    { title: 'Month', dataIndex: 'month', width: 110, render: (value: string) => formatMonth(value) },
    { title: 'Status', dataIndex: 'status', width: 110, render: (value: ReportInvoiceStatus) => statusTag(value) },
    { title: 'Due date', dataIndex: 'dueDate', width: 120, render: formatDate },
    { title: 'Total', dataIndex: 'total', width: 150, align: 'right', render: formatCurrency },
    { title: 'Paid', dataIndex: 'paidAmount', width: 150, align: 'right', render: formatCurrency },
    { title: 'Outstanding', dataIndex: 'outstandingAmount', width: 160, align: 'right', render: formatCurrency },
  ]

  const occupancyColumns: ColumnsType<OccupancyReportRow> = [
    { title: 'Building', dataIndex: 'buildingName', width: 220 },
    { title: 'Rooms', dataIndex: 'totalRooms', width: 100, align: 'right' },
    { title: 'Occupied', dataIndex: 'occupiedRooms', width: 110, align: 'right' },
    { title: 'Vacant', dataIndex: 'vacantRooms', width: 100, align: 'right' },
    { title: 'Maintenance', dataIndex: 'maintenanceRooms', width: 130, align: 'right' },
    { title: 'Inactive', dataIndex: 'inactiveRooms', width: 110, align: 'right' },
    { title: 'Tenants', dataIndex: 'activeTenants', width: 100, align: 'right' },
    {
      title: 'Occupancy',
      dataIndex: 'occupancyRate',
      width: 180,
      render: (value: number) => <Progress percent={value} size="small" strokeColor="#1677ff" />,
    },
  ]

  const tabItems = [
    {
      key: 'revenue',
      label: 'Revenue',
      children: (
        <Space direction="vertical" size={16} className="reports-tab-content">
          <Card title="Revenue by month">
            <Table<RevenueMonthRow>
              rowKey="month"
              columns={monthlyRevenueColumns}
              dataSource={data?.revenueByMonth ?? []}
              pagination={false}
              scroll={{ x: 690 }}
              locale={{ emptyText: <Empty description="No revenue data" /> }}
            />
          </Card>
          <Card title="Revenue by building">
            <Table<RevenueBuildingRow>
              rowKey="buildingId"
              columns={buildingRevenueColumns}
              dataSource={data?.revenueByBuilding ?? []}
              pagination={false}
              scroll={{ x: 850 }}
              locale={{ emptyText: <Empty description="No building revenue" /> }}
            />
          </Card>
        </Space>
      ),
    },
    {
      key: 'debt',
      label: data?.debtSummary.overdueInvoices ? `Debt (${data.debtSummary.overdueInvoices})` : 'Debt',
      children: (
        <Card title="Unpaid and overdue invoices">
          <Table<DebtReportRow>
            rowKey="invoiceId"
            columns={debtColumns}
            dataSource={data?.debtItems ?? []}
            scroll={{ x: 1370 }}
            locale={{ emptyText: <Empty description="No unpaid invoices" /> }}
          />
        </Card>
      ),
    },
    {
      key: 'occupancy',
      label: 'Occupancy',
      children: (
        <Card title="Occupancy by building">
          <Table<OccupancyReportRow>
            rowKey="buildingId"
            columns={occupancyColumns}
            dataSource={data?.occupancyByBuilding ?? []}
            pagination={false}
            scroll={{ x: 1050 }}
            locale={{ emptyText: <Empty description="No occupancy data" /> }}
          />
        </Card>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} className="reports-page">
      <div className="reports-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Reports
          </Typography.Title>
          <Typography.Text type="secondary">
            Track revenue, unpaid balances, and room occupancy across the portfolio.
          </Typography.Text>
        </div>
        <Space wrap className="reports-header-actions">
          <Button icon={<ReloadOutlined />} onClick={() => void loadReports()}>
            Refresh
          </Button>
          <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={() => void downloadCsv()}>
            Export CSV
          </Button>
        </Space>
      </div>

      <Card>
        <div className="reports-filters">
          <DatePicker.RangePicker
            picker="month"
            allowClear={false}
            value={range}
            onChange={(value) => {
              if (value?.[0] && value[1]) {
                setRange([value[0].startOf('month'), value[1].startOf('month')])
              }
            }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="All buildings"
            value={buildingId}
            onChange={setBuildingId}
            options={buildings.map((building) => ({ label: building.name, value: building.id }))}
          />
          <Select
            allowClear
            placeholder="Invoice status"
            value={status}
            onChange={setStatus}
            options={invoiceStatusOptions.map((item) => ({ label: item.label, value: item.value }))}
          />
        </div>
      </Card>

      <div className="reports-summary-grid">
        <Card><Statistic title="Billed" value={data?.summary.billed ?? 0} formatter={(value) => formatCurrency(Number(value))} /></Card>
        <Card><Statistic title="Collected" value={data?.summary.collected ?? 0} formatter={(value) => formatCurrency(Number(value))} /></Card>
        <Card><Statistic title="Unpaid" value={data?.summary.unpaidAmount ?? 0} formatter={(value) => formatCurrency(Number(value))} /></Card>
        <Card><Statistic title="Occupancy" value={data?.summary.occupancyRate ?? 0} suffix="%" /></Card>
      </div>

      {loading ? (
        <Card><Skeleton active paragraph={{ rows: 10 }} /></Card>
      ) : error ? (
        <Card>
          <Empty description={error}>
            <Button type="primary" onClick={() => void loadReports()}>Retry</Button>
          </Empty>
        </Card>
      ) : (
        <Tabs
          activeKey={activeSection}
          onChange={(key) => setActiveSection(key as ReportSection)}
          items={tabItems}
        />
      )}
    </Space>
  )
}
