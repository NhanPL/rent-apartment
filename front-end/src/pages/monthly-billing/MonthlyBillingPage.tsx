import { useI18n } from '../../i18n'
import { FileAddOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listBuildings } from '../../services/invoicesService'
import { generateMonthlyInvoices, listMonthlyBilling, type MonthlyBillingAction, type MonthlyBillingItem } from '../../services/monthlyBillingService'
import { getUserErrorMessage } from '../../services/errorMessage'
import { vndCurrency } from '../../i18n'
import './MonthlyBillingPage.css'

const currency = vndCurrency
const actionLabels: Record<MonthlyBillingAction, string> = {
  ENTER_READING: 'Enter reading', REVIEW_READING: 'Review reading', CORRECT_READING: 'Correct reading', GENERATE_INVOICE: 'Generate invoice', REPLACE_VOID_INVOICE: 'Create replacement', REVIEW_DRAFT: 'Review draft', WAITING_PAYMENT: 'Awaiting payment', RECONCILE_PAYMENT: 'Reconcile payment', PAID: 'Paid',
}

const navigate = (path: string) => {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function MonthlyBillingPage() {
  const { t } = useI18n()
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))
  const [buildingId, setBuildingId] = useState<string>()
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([])
  const [items, setItems] = useState<MonthlyBillingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [buildingRows, result] = await Promise.all([listBuildings(), listMonthlyBilling(buildingId, month)])
      setBuildings(buildingRows)
      setItems(result.items)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Unable to load monthly billing.'))
    } finally { setLoading(false) }
  }, [buildingId, month])

  useEffect(() => { void load() }, [load])

  const openNextStep = useCallback((row: MonthlyBillingItem) => {
    const sharedFilters = `month=${encodeURIComponent(month)}${buildingId ? `&buildingId=${encodeURIComponent(buildingId)}` : ''}`
    if (['ENTER_READING', 'REVIEW_READING', 'CORRECT_READING'].includes(row.next_action)) return navigate(`/utilities?${sharedFilters}`)
    if (row.next_action === 'REVIEW_DRAFT') return navigate(`/invoices?invoiceId=${encodeURIComponent(row.invoice_id ?? '')}`)
    if (row.next_action === 'REPLACE_VOID_INVOICE') return navigate(`/invoices?invoiceId=${encodeURIComponent(row.voided_invoice_id ?? '')}`)
    if (row.next_action === 'WAITING_PAYMENT' || row.next_action === 'RECONCILE_PAYMENT') return navigate(`/payments?${sharedFilters}`)
    if (row.next_action === 'PAID') return navigate(`/invoices?invoiceId=${encodeURIComponent(row.invoice_id ?? '')}`)
  }, [buildingId, month])

  const readyCount = useMemo(() => items.filter((item) => item.next_action === 'GENERATE_INVOICE').length, [items])

  const generateReadyInvoices = useCallback(async () => {
    setGenerating(true)
    try {
      const result = await generateMonthlyInvoices(buildingId, month)
      message.success(`Generated ${result.generated.length} invoice(s).`)
      await load()
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Unable to generate monthly invoices.'))
    } finally {
      setGenerating(false)
    }
  }, [buildingId, load, month])

  const columns = useMemo<ColumnsType<MonthlyBillingItem>>(() => [
    { title: t("Room"), render: (_, row) => <Space direction="vertical" size={0}><Typography.Text strong>{row.room_code}</Typography.Text><Typography.Text type="secondary">{row.building_name}</Typography.Text></Space> },
    { title: t("Primary tenant"), dataIndex: 'primary_tenant', render: (value) => value ?? '-' },
    { title: t("Reading"), dataIndex: 'reading_status', render: (value) => <Tag>{value ?? 'NOT_ENTERED'}</Tag> },
    { title: t("Invoice"), dataIndex: 'invoice_status', render: (value) => <Tag color={value === 'DRAFT' ? 'gold' : value === 'PAID' ? 'green' : 'blue'}>{value ?? 'NOT_CREATED'}</Tag> },
    { title: t("Payment request"), dataIndex: 'payment_request_status', responsive: ['lg'], render: (value) => value ?? '-' },
    { title: t("Paid"), dataIndex: 'paid_amount', align: 'right', render: (value) => currency.format(value) },
    { title: t("Outstanding"), dataIndex: 'outstanding_amount', align: 'right', render: (value) => currency.format(value) },
    { title: t("Next action"), dataIndex: 'next_action', render: (value: MonthlyBillingAction) => <Tag color={value === 'PAID' ? 'green' : value === 'GENERATE_INVOICE' ? 'cyan' : 'processing'}>{t(actionLabels[value])}</Tag> },
    { title: t("Continue"), fixed: 'right', width: 170, render: (_, row) => row.next_action === 'GENERATE_INVOICE' ? <Typography.Text type="secondary">{t("Ready for batch generation")}</Typography.Text> : <Button icon={<RightOutlined />} onClick={() => openNextStep(row)}>{t(actionLabels[row.next_action])}</Button> },
  ], [openNextStep, t])

  return <><Space direction="vertical" size={16} className="monthly-billing-page">
    <div className="monthly-billing-toolbar"><div><Typography.Title level={3}>{t("Monthly billing")}</Typography.Title><Typography.Text type="secondary">{t("Prepare and generate monthly draft invoices from approved utility readings.")}</Typography.Text></div><Space wrap><Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>{t("Reload")}</Button><Button type="primary" icon={<FileAddOutlined />} loading={generating} disabled={readyCount === 0} onClick={() => void generateReadyInvoices()}>{t("Generate ready invoices")} ({readyCount})</Button></Space></div>
    <div className="monthly-billing-filters"><Select allowClear placeholder={t("All buildings")} value={buildingId} onChange={setBuildingId} options={buildings.map((item) => ({ label: item.name, value: item.id }))} /><input aria-label={t("Billing month")} type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div>
    <Alert showIcon type="info" message={t("Approve utility readings first. Generated drafts continue in Invoices; issued invoice payments continue in Payments.")} />
    <Table rowKey="contract_id" loading={loading} columns={columns} dataSource={items} scroll={{ x: 1200 }} pagination={{ pageSize: 20 }} locale={{ emptyText: <Empty description={t("No active contracts found for this period")} /> }} />
  </Space></>
}
