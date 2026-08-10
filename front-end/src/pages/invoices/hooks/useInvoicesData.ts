import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import {
  getInvoicesSummary,
  listBuildings,
  listContracts,
  listInvoices,
  listRooms,
  listTenants,
} from '../../../services/invoicesService'
import { getUserErrorMessage } from '../../../services/errorMessage'
import type { Contract, InvoiceListItem, InvoiceStatus, PaymentStatus } from '../types'

export interface InvoiceFilters {
  search: string
  month: string
  invoiceStatus?: InvoiceStatus
  paymentStatus?: PaymentStatus
  buildingId?: string
  roomId?: string
  tenantId?: string
}

export interface InvoiceReferenceData {
  buildings: { id: string; name: string }[]
  rooms: { id: string; building_id: string; code: string; base_rent: number }[]
  tenants: { id: string; full_name: string }[]
  contracts: Contract[]
}

const emptyReferences: InvoiceReferenceData = {
  buildings: [],
  rooms: [],
  tenants: [],
  contracts: [],
}

export function useInvoicesData(filters: InvoiceFilters, page: number, pageSize: number) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<InvoiceListItem[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState({ totalInvoices: 0, paidInvoices: 0, unpaidInvoices: 0, totalRevenue: 0 })
  const [references, setReferences] = useState<InvoiceReferenceData>(emptyReferences)

  const reloadOptions = useCallback(async () => {
    try {
      const [buildings, rooms, tenants, contracts] = await Promise.all([
        listBuildings(),
        listRooms(),
        listTenants(),
        listContracts(),
      ])
      setReferences({ buildings, rooms, tenants, contracts })
    } catch (cause) {
      message.error(getUserErrorMessage(cause, 'Unable to load the invoice form options.'))
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [invoicePage, summaryRows] = await Promise.all([
        listInvoices({
          search: filters.search,
          month: filters.month,
          invoice_status: filters.invoiceStatus,
          payment_status: filters.paymentStatus,
          building_id: filters.buildingId,
          room_id: filters.roomId,
          tenant_id: filters.tenantId,
          page,
          pageSize,
          sortBy: 'month',
          sortOrder: 'desc',
        }),
        getInvoicesSummary(filters.month),
      ])
      setItems(invoicePage.items)
      setTotal(invoicePage.total)
      setSummary(summaryRows)
    } catch (cause) {
      setError(getUserErrorMessage(cause, 'Unable to load invoices.'))
    } finally {
      setLoading(false)
    }
  }, [filters, page, pageSize])

  useEffect(() => {
    void reloadOptions()
  }, [reloadOptions])

  useEffect(() => {
    void reload()
  }, [reload])

  return { loading, error, items, total, summary, references, reload, reloadOptions }
}
