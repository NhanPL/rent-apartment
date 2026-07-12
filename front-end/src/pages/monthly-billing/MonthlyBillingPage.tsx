import { CheckCircleOutlined, EyeOutlined, FileAddOutlined, ReloadOutlined, SendOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Button, Empty, Select, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listBuildings } from '../../services/invoicesService'
import { generateMonthlyInvoice, issueMonthlyInvoice, listMonthlyBilling, type MonthlyBillingAction, type MonthlyBillingItem } from '../../services/monthlyBillingService'
import { getUserErrorMessage } from '../../services/errorMessage'
import './MonthlyBillingPage.css'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
const actionLabels: Record<MonthlyBillingAction, string> = {
  ENTER_READING: 'Enter reading', REVIEW_READING: 'Review reading', CORRECT_READING: 'Correct reading', GENERATE_INVOICE: 'Generate invoice', REVIEW_DRAFT: 'Review draft', WAITING_PAYMENT: 'Awaiting payment', RECONCILE_PAYMENT: 'Reconcile payment', PAID: 'Paid',
}

const navigate = (path: string) => {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function MonthlyBillingPage() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))
  const [buildingId, setBuildingId] = useState<string>()
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string }>>([])
  const [items, setItems] = useState<MonthlyBillingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string>()

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

  const runAction = useCallback(async (row: MonthlyBillingItem) => {
    if (['ENTER_READING', 'REVIEW_READING', 'CORRECT_READING'].includes(row.next_action)) return navigate('/utilities')
    if (row.next_action === 'REVIEW_DRAFT') return navigate(`/invoices?invoiceId=${encodeURIComponent(row.invoice_id ?? '')}`)
    if (row.next_action === 'WAITING_PAYMENT' || row.next_action === 'RECONCILE_PAYMENT') return navigate('/payments')
    if (row.next_action === 'PAID') return navigate(`/invoices?invoiceId=${encodeURIComponent(row.invoice_id ?? '')}`)
    setActionId(row.room_id)
    try {
      await generateMonthlyInvoice(row.room_id, month)
      message.success('Draft invoice generated.')
      await load()
    } catch (error) { message.error(getUserErrorMessage(error, 'Unable to generate the invoice.')) }
    finally { setActionId(undefined) }
  }, [load, month])

  const issue = useCallback(async (row: MonthlyBillingItem) => {
    if (!row.invoice_id) return
    setActionId(row.invoice_id)
    try {
      await issueMonthlyInvoice(row.invoice_id)
      message.success('Invoice issued and payment request created.')
      await load()
    } catch (error) { message.error(getUserErrorMessage(error, 'Unable to issue the invoice.')) }
    finally { setActionId(undefined) }
  }, [load])

  const columns = useMemo<ColumnsType<MonthlyBillingItem>>(() => [
    { title: 'Room', render: (_, row) => <Space direction="vertical" size={0}><Typography.Text strong>{row.room_code}</Typography.Text><Typography.Text type="secondary">{row.building_name}</Typography.Text></Space> },
    { title: 'Primary tenant', dataIndex: 'primary_tenant', render: (value) => value ?? '-' },
    { title: 'Reading', dataIndex: 'reading_status', render: (value) => <Tag>{value ?? 'NOT_ENTERED'}</Tag> },
    { title: 'Invoice', dataIndex: 'invoice_status', render: (value) => <Tag color={value === 'DRAFT' ? 'gold' : value === 'PAID' ? 'green' : 'blue'}>{value ?? 'NOT_CREATED'}</Tag> },
    { title: 'Payment request', dataIndex: 'payment_request_status', responsive: ['lg'], render: (value) => value ?? '-' },
    { title: 'Paid', dataIndex: 'paid_amount', align: 'right', render: (value) => currency.format(value) },
    { title: 'Outstanding', dataIndex: 'outstanding_amount', align: 'right', render: (value) => currency.format(value) },
    { title: 'Next action', dataIndex: 'next_action', render: (value: MonthlyBillingAction) => <Tag color={value === 'PAID' ? 'green' : 'processing'}>{actionLabels[value]}</Tag> },
    { title: '', fixed: 'right', width: 180, render: (_, row) => row.next_action === 'REVIEW_DRAFT' ? <Space><Button icon={<EyeOutlined />} onClick={() => navigate(`/invoices?invoiceId=${encodeURIComponent(row.invoice_id ?? '')}`)} /><Button type="primary" icon={<SendOutlined />} loading={actionId === row.invoice_id} onClick={() => void issue(row)}>Issue</Button></Space> : <Button type={row.next_action === 'GENERATE_INVOICE' ? 'primary' : 'default'} icon={row.next_action === 'GENERATE_INVOICE' ? <FileAddOutlined /> : row.next_action === 'PAID' ? <CheckCircleOutlined /> : <ThunderboltOutlined />} loading={actionId === row.room_id} onClick={() => void runAction(row)}>{actionLabels[row.next_action]}</Button> },
  ], [actionId, issue, runAction])

  return <Space direction="vertical" size={16} className="monthly-billing-page">
    <div className="monthly-billing-toolbar"><div><Typography.Title level={3}>Monthly billing</Typography.Title><Typography.Text type="secondary">Close the billing cycle from readings through payment reconciliation.</Typography.Text></div><Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>Reload</Button></div>
    <div className="monthly-billing-filters"><Select allowClear placeholder="All buildings" value={buildingId} onChange={setBuildingId} options={buildings.map((item) => ({ label: item.name, value: item.id }))} /><input aria-label="Billing month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div>
    <Table rowKey="contract_id" loading={loading} columns={columns} dataSource={items} scroll={{ x: 1200 }} pagination={{ pageSize: 20 }} locale={{ emptyText: <Empty description="No active contracts found for this period" /> }} />
  </Space>
}
