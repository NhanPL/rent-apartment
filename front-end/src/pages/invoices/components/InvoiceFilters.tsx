import { ReloadOutlined } from '@ant-design/icons'
import { Button, Input, Select } from 'antd'
import type { InvoiceStatus, PaymentStatus } from '../types'
import { useI18n } from '../../../i18n'

interface Option { id: string; name?: string; code?: string; full_name?: string }

interface Props {
  search: string
  month: string
  invoiceStatus?: InvoiceStatus
  paymentStatus?: PaymentStatus
  buildingId?: string
  roomId?: string
  tenantId?: string
  buildings: Option[]
  rooms: Option[]
  tenants: Option[]
  invoiceStatuses: { label: string; value: InvoiceStatus }[]
  paymentStatuses: { label: string; value: PaymentStatus }[]
  onSearchChange: (value: string) => void
  onMonthChange: (value: string) => void
  onInvoiceStatusChange: (value?: InvoiceStatus) => void
  onPaymentStatusChange: (value?: PaymentStatus) => void
  onBuildingChange: (value?: string) => void
  onRoomChange: (value?: string) => void
  onTenantChange: (value?: string) => void
  onRefresh: () => void
}

export function InvoiceFilters(props: Props) {
  const { t } = useI18n()
  return (
    <div className="invoices-filters">
      <Input aria-label={t("Search invoices")} placeholder={t("Search building, room, tenant")} value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} allowClear />
      <Input aria-label={t("Invoice month")} type="month" value={props.month} onChange={(event) => props.onMonthChange(event.target.value)} />
      <Select aria-label={t("Invoice status")} allowClear placeholder={t("Invoice status")} value={props.invoiceStatus} onChange={props.onInvoiceStatusChange} options={props.invoiceStatuses} />
      <Select aria-label={t("Payment status")} allowClear placeholder={t("Payment status")} value={props.paymentStatus} onChange={props.onPaymentStatusChange} options={props.paymentStatuses} />
      <Select aria-label={t("Building filter")} allowClear placeholder={t("Building")} value={props.buildingId} onChange={props.onBuildingChange} options={props.buildings.map((item) => ({ label: item.name, value: item.id }))} />
      <Select aria-label={t("Room filter")} allowClear placeholder={t("Room")} value={props.roomId} onChange={props.onRoomChange} options={props.rooms.map((item) => ({ label: item.code, value: item.id }))} />
      <Select aria-label={t("Tenant filter")} allowClear placeholder={t("Tenant")} value={props.tenantId} onChange={props.onTenantChange} options={props.tenants.map((item) => ({ label: item.full_name, value: item.id }))} />
      <Button icon={<ReloadOutlined />} onClick={props.onRefresh}>{t("Refresh")}</Button>
    </div>
  )
}
