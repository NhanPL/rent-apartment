import { useI18n } from '../../i18n'
import {
  DownloadOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Alert,
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
import {
  exportReportsCsv,
  getReportDetails,
  getReportsData,
  listReportBuildings,
  listReportRooms,
  listReportTenants,
} from '../../services/reportsService'
import { getUserErrorMessage } from '../../services/errorMessage'
import { vndCurrency } from '../../i18n'
import type {
  DebtReportRow,
  OccupancyReportRow,
  ReportBuildingOption,
  ReportRoomOption,
  ReportTenantOption,
  ReportFilters,
  ReportDetailItem,
  ReportInvoiceStatus,
  ReportSection,
  ReportsData,
  RevenueBuildingRow,
  RevenueMonthRow,
  ReconciliationReportRow,
} from './types'
import './ReportsPage.css'

const invoiceStatusOptions: { label: string; value: ReportInvoiceStatus; color: string }[] = [
  { label: 'Draft', value: 'DRAFT', color: 'default' },
  { label: 'Issued', value: 'ISSUED', color: 'blue' },
  { label: 'Partially paid', value: 'PARTIALLY_PAID', color: 'gold' },
  { label: 'Paid', value: 'PAID', color: 'green' },
  { label: 'Void', value: 'VOID', color: 'default' },
]

const currency = vndCurrency

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
  const { t } = useI18n()
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => defaultRange())
  const [buildingId, setBuildingId] = useState<string | undefined>()
  const [roomId, setRoomId] = useState<string | undefined>()
  const [tenantId, setTenantId] = useState<string | undefined>()
  const [status, setStatus] = useState<ReportInvoiceStatus | undefined>()
  const [buildings, setBuildings] = useState<ReportBuildingOption[]>([])
  const [rooms, setRooms] = useState<ReportRoomOption[]>([])
  const [tenants, setTenants] = useState<ReportTenantOption[]>([])
  const [data, setData] = useState<ReportsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<ReportSection>('revenue')
  const [exporting, setExporting] = useState(false)
  const [detailItems, setDetailItems] = useState<ReportDetailItem[]>([])
  const [detailLoading, setDetailLoading] = useState(true)
  const [detailPage, setDetailPage] = useState(1)
  const [detailPageSize, setDetailPageSize] = useState(20)
  const [detailTotal, setDetailTotal] = useState(0)

  const filters = useMemo<ReportFilters>(() => ({
    monthFrom: range[0].format('YYYY-MM'),
    monthTo: range[1].format('YYYY-MM'),
    buildingId,
    roomId,
    tenantId,
    status,
  }), [buildingId, range, roomId, status, tenantId])

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      setData(await getReportsData(filters))
    } catch (requestError) {
      setError(getUserErrorMessage(requestError, 'Khong tai duoc bao cao.'))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  const loadDetails = useCallback(async () => {
    setDetailLoading(true)
    try {
      const response = await getReportDetails(filters, activeSection, {
        page: detailPage,
        pageSize: detailPageSize,
        sortOrder: 'desc',
      })
      setDetailItems(response.items)
      setDetailTotal(response.total)
    } catch (requestError) {
      setError(getUserErrorMessage(requestError, 'Unable to load report details.'))
    } finally {
      setDetailLoading(false)
    }
  }, [activeSection, detailPage, detailPageSize, filters])

  useEffect(() => {
    void loadDetails()
  }, [loadDetails])

  useEffect(() => {
    let active = true

    Promise.all([listReportBuildings(), listReportRooms(), listReportTenants()])
      .then(([buildingItems, roomItems, tenantItems]) => {
        if (active) {
          setBuildings(buildingItems)
          setRooms(roomItems)
          setTenants(tenantItems)
        }
      })
      .catch(() => {
        if (active) {
          setBuildings([])
          setRooms([])
          setTenants([])
        }
      })

    return () => {
      active = false
    }
  }, [])

  const roomOptions = useMemo(
    () => rooms.filter((room) => !buildingId || room.buildingId === buildingId),
    [buildingId, rooms],
  )

  const downloadCsv = useCallback(async () => {
    setExporting(true)

    try {
      const content = await exportReportsCsv(filters, activeSection)
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `reports-${activeSection}-${filters.monthFrom}-${filters.monthTo}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (requestError) {
      message.error(getUserErrorMessage(requestError, 'Khong the xuat bao cao CSV.'))
    } finally {
      setExporting(false)
    }
  }, [activeSection, filters])

  const monthlyRevenueColumns: ColumnsType<RevenueMonthRow> = [
    { title: t("Month"), dataIndex: 'month', width: 120, render: (value: string) => formatMonth(value) },
    { title: t("Invoices"), dataIndex: 'invoiceCount', width: 110, align: 'right' },
    { title: t("Billed"), dataIndex: 'billed', width: 160, align: 'right', render: formatCurrency },
    { title: t("Payments"), dataIndex: 'grossPayments', width: 160, align: 'right', render: formatCurrency },
    { title: t("Reversals"), dataIndex: 'reversals', width: 160, align: 'right', render: formatCurrency },
    { title: t("Net payments"), dataIndex: 'collected', width: 160, align: 'right', render: formatCurrency },
    { title: t("Unpaid"), dataIndex: 'unpaid', width: 160, align: 'right', render: formatCurrency },
    { title: t("Void amount"), dataIndex: 'voidAmount', width: 160, align: 'right', render: formatCurrency },
  ]

  const buildingRevenueColumns: ColumnsType<RevenueBuildingRow> = [
    { title: t("Building"), dataIndex: 'buildingName', width: 220 },
    { title: t("Invoices"), dataIndex: 'invoiceCount', width: 110, align: 'right' },
    { title: t("Billed"), dataIndex: 'billed', width: 160, align: 'right', render: formatCurrency },
    { title: t("Payments"), dataIndex: 'grossPayments', width: 160, align: 'right', render: formatCurrency },
    { title: t("Reversals"), dataIndex: 'reversals', width: 160, align: 'right', render: formatCurrency },
    { title: t("Net payments"), dataIndex: 'collected', width: 160, align: 'right', render: formatCurrency },
    { title: t("Unpaid"), dataIndex: 'unpaid', width: 160, align: 'right', render: formatCurrency },
    { title: t("Void amount"), dataIndex: 'voidAmount', width: 160, align: 'right', render: formatCurrency },
  ]

  const debtColumns: ColumnsType<DebtReportRow> = [
    { title: t("Building"), dataIndex: 'buildingName', width: 190 },
    { title: t("Room"), dataIndex: 'roomCode', width: 100 },
    { title: t("Tenant"), dataIndex: 'tenantName', width: 180 },
    { title: t("Month"), dataIndex: 'month', width: 110, render: (value: string) => formatMonth(value) },
    {
      title: t("Status"),
      dataIndex: 'status',
      width: 150,
      render: (value: ReportInvoiceStatus, row) => (
        <Space size={4}>{statusTag(value)}{row.isOverdue ? <Tag color="red">{t("Overdue")}</Tag> : null}</Space>
      ),
    },
    { title: t("Due date"), dataIndex: 'dueDate', width: 120, render: formatDate },
    { title: t("Total"), dataIndex: 'total', width: 150, align: 'right', render: formatCurrency },
    { title: t("Paid"), dataIndex: 'paidAmount', width: 150, align: 'right', render: formatCurrency },
    { title: t("Outstanding"), dataIndex: 'outstandingAmount', width: 160, align: 'right', render: formatCurrency },
  ]

  const occupancyColumns: ColumnsType<OccupancyReportRow> = [
    { title: t("Building"), dataIndex: 'buildingName', width: 220 },
    { title: t("Rooms"), dataIndex: 'totalRooms', width: 100, align: 'right' },
    { title: t("Occupied"), dataIndex: 'occupiedRooms', width: 110, align: 'right' },
    { title: t("Vacant"), dataIndex: 'vacantRooms', width: 100, align: 'right' },
    { title: t("Maintenance"), dataIndex: 'maintenanceRooms', width: 130, align: 'right' },
    { title: t("Inactive"), dataIndex: 'inactiveRooms', width: 110, align: 'right' },
    { title: t("Tenants"), dataIndex: 'activeTenants', width: 100, align: 'right' },
    {
      title: t("Occupancy"),
      dataIndex: 'occupancyRate',
      width: 180,
      render: (value: number) => <Progress percent={value} size="small" strokeColor="#1677ff" />,
    },
  ]

  const reconciliationColumns: ColumnsType<ReconciliationReportRow> = [
    { title: t("Paid at (UTC)"), dataIndex: 'paidAt', width: 180, render: (value: string) => `${new Date(value).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC` },
    { title: t("Building"), dataIndex: 'buildingName', width: 180 },
    { title: t("Room"), dataIndex: 'roomCode', width: 100 },
    { title: t("Tenant"), dataIndex: 'tenantName', width: 180 },
    { title: t("Month"), dataIndex: 'month', width: 110, render: (value: string) => formatMonth(value) },
    { title: t("Invoice status"), dataIndex: 'invoiceStatus', width: 150, render: statusTag },
    { title: t("Entry type"), dataIndex: 'entryType', width: 120, render: (value: ReconciliationReportRow['entryType']) => <Tag color={value === 'REVERSAL' ? 'red' : 'green'}>{t(value === 'REVERSAL' ? 'Reversal' : 'Payment')}</Tag> },
    { title: t("Amount"), dataIndex: 'amount', width: 150, align: 'right', render: formatCurrency },
    { title: t("Net amount"), dataIndex: 'signedAmount', width: 150, align: 'right', render: (value: number) => <Typography.Text type={value < 0 ? 'danger' : undefined}>{formatCurrency(value)}</Typography.Text> },
    { title: t("Reference"), dataIndex: 'referenceCode', width: 160, render: (value: string | null) => value ?? '-' },
    { title: t("Reversal reason"), dataIndex: 'reversalReason', width: 220, render: (value: string | null) => value ?? '-' },
  ]

  const tabItems = [
    {
      key: 'revenue',
      label: t("Revenue"),
      children: (
        <Space direction="vertical" size={16} className="reports-tab-content">
          <Alert
            showIcon
            type="info"
            message={t("Financial definitions")}
            description={data ? `${t(data.definitions.billed)} ${t(data.definitions.collected)} ${t(data.definitions.void)} ${t("Currency")}: ${data.definitions.currency}. ${t("Timezone")}: ${data.definitions.timezone}.` : undefined}
          />
          <Card title={t("Revenue by month")}>
            <Table<RevenueMonthRow>
              rowKey="month"
              columns={monthlyRevenueColumns}
              dataSource={data?.revenueByMonth ?? []}
              pagination={false}
              scroll={{ x: 690 }}
              locale={{ emptyText: <Empty description={t("No revenue data")} /> }}
            />
          </Card>
          <Card title={t("Revenue by building")}>
            <Table<RevenueBuildingRow>
              rowKey="buildingId"
              columns={buildingRevenueColumns}
              dataSource={activeSection === 'revenue' ? detailItems as RevenueBuildingRow[] : []}
              loading={detailLoading}
              pagination={{
                current: detailPage,
                pageSize: detailPageSize,
                total: detailTotal,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50, 100],
                onChange: (page, pageSize) => {
                  setDetailPage(pageSize === detailPageSize ? page : 1)
                  setDetailPageSize(pageSize)
                },
              }}
              scroll={{ x: 850 }}
              locale={{ emptyText: <Empty description={t("No building revenue")} /> }}
            />
          </Card>
        </Space>
      ),
    },
    {
      key: 'debt',
      label: data?.debtSummary.overdueInvoices ? `Debt (${data.debtSummary.overdueInvoices})` : 'Debt',
      children: (
        <Card title={t("Unpaid and overdue invoices")}>
          <Table<DebtReportRow>
            rowKey="invoiceId"
            columns={debtColumns}
            dataSource={activeSection === 'debt' ? detailItems as DebtReportRow[] : []}
            loading={detailLoading}
            pagination={{
              current: detailPage,
              pageSize: detailPageSize,
              total: detailTotal,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              onChange: (page, pageSize) => {
                setDetailPage(pageSize === detailPageSize ? page : 1)
                setDetailPageSize(pageSize)
              },
            }}
            scroll={{ x: 1370 }}
            locale={{ emptyText: <Empty description={t("No unpaid invoices")} /> }}
          />
        </Card>
      ),
    },
    {
      key: 'reconciliation',
      label: t("Payment reconciliation"),
      children: (
        <Card title={t("Immutable payment ledger")}>
          <Table<ReconciliationReportRow>
            rowKey="paymentId"
            columns={reconciliationColumns}
            dataSource={activeSection === 'reconciliation' ? detailItems as ReconciliationReportRow[] : []}
            loading={detailLoading}
            pagination={{
              current: detailPage,
              pageSize: detailPageSize,
              total: detailTotal,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              onChange: (page, pageSize) => {
                setDetailPage(pageSize === detailPageSize ? page : 1)
                setDetailPageSize(pageSize)
              },
            }}
            scroll={{ x: 1550 }}
            locale={{ emptyText: <Empty description={t("No payment ledger entries")} /> }}
          />
        </Card>
      ),
    },
    {
      key: 'occupancy',
      label: t("Occupancy"),
      children: (
        <Card title={t("Occupancy by building")}>
          <Table<OccupancyReportRow>
            rowKey="buildingId"
            columns={occupancyColumns}
            dataSource={activeSection === 'occupancy' ? detailItems as OccupancyReportRow[] : []}
            loading={detailLoading}
            pagination={{
              current: detailPage,
              pageSize: detailPageSize,
              total: detailTotal,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              onChange: (page, pageSize) => {
                setDetailPage(pageSize === detailPageSize ? page : 1)
                setDetailPageSize(pageSize)
              },
            }}
            scroll={{ x: 1050 }}
            locale={{ emptyText: <Empty description={t("No occupancy data")} /> }}
          />
        </Card>
      ),
    },
  ]

  return (
    <>
    <Space direction="vertical" size={16} className="reports-page">
      <div className="reports-header">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {t("Reports")}
          </Typography.Title>
          <Typography.Text type="secondary">
            {t("Track revenue, unpaid balances, and room occupancy across the portfolio.")}
          </Typography.Text>
        </div>
        <Space wrap className="reports-header-actions">
          <Button icon={<ReloadOutlined />} onClick={() => void loadReports()}>
            {t("Refresh")}
          </Button>
          <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={() => void downloadCsv()}>
            {t("Export CSV")}
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
                setDetailPage(1)
              }
            }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t("All buildings")}
            value={buildingId}
            onChange={(value) => {
              setBuildingId(value)
              if (roomId && !rooms.some((room) => room.id === roomId && (!value || room.buildingId === value))) setRoomId(undefined)
              setDetailPage(1)
            }}
            options={buildings.map((building) => ({ label: building.name, value: building.id }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t("All rooms")}
            value={roomId}
            onChange={(value) => { setRoomId(value); setDetailPage(1) }}
            options={roomOptions.map((room) => ({ label: room.code, value: room.id }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t("All tenants")}
            value={tenantId}
            onChange={(value) => { setTenantId(value); setDetailPage(1) }}
            options={tenants.map((tenant) => ({ label: tenant.fullName, value: tenant.id }))}
          />
          <Select
            allowClear
            placeholder={t("Invoice status")}
            value={status}
            onChange={(value) => { setStatus(value); setDetailPage(1) }}
            options={invoiceStatusOptions.map((item) => ({ label: item.label, value: item.value }))}
          />
        </div>
      </Card>

      <div className="reports-summary-grid">
        <Card><Statistic title={t("Billed")} value={data?.summary.billed ?? 0} formatter={(value) => formatCurrency(Number(value))} /></Card>
        <Card><Statistic title={t("Net payments")} value={data?.summary.collected ?? 0} formatter={(value) => formatCurrency(Number(value))} /></Card>
        <Card><Statistic title={t("Unpaid")} value={data?.summary.unpaidAmount ?? 0} formatter={(value) => formatCurrency(Number(value))} /></Card>
        <Card><Statistic title={t("Void amount")} value={data?.summary.voidAmount ?? 0} formatter={(value) => formatCurrency(Number(value))} /></Card>
        <Card><Statistic title={t("Occupancy")} value={data?.summary.occupancyRate ?? 0} suffix="%" /></Card>
      </div>

      {loading ? (
        <Card><Skeleton active paragraph={{ rows: 10 }} /></Card>
      ) : error ? (
        <Card>
          <Empty description={error}>
            <Button type="primary" onClick={() => void loadReports()}>{t("Retry")}</Button>
          </Empty>
        </Card>
      ) : (
        <Tabs
          activeKey={activeSection}
          onChange={(key) => { setActiveSection(key as ReportSection); setDetailPage(1) }}
          items={tabItems}
        />
      )}
    </Space>
    </>
  )
}
