import { useCallback, useEffect } from 'react'
import { message } from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getInvoicesSummary, listBuildings, listContracts, listInvoices, listRooms, listTenants } from '../../../services/invoicesService'
import { getUserErrorMessage } from '../../../services/errorMessage'
import { queryKeys } from '../../../query/queryClient'
import type { Contract, InvoiceStatus, PaymentStatus } from '../types'

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

const emptyReferences: InvoiceReferenceData = { buildings: [], rooms: [], tenants: [], contracts: [] }

export function useInvoicesData(filters: InvoiceFilters, page: number, pageSize: number) {
  const queryClient = useQueryClient()
  const request = { ...filters, page, pageSize }
  const referencesQuery = useQuery({
    queryKey: queryKeys.invoices.references,
    queryFn: async () => {
      const [buildings, rooms, tenants, contracts] = await Promise.all([listBuildings(), listRooms(), listTenants(), listContracts()])
      return { buildings, rooms, tenants, contracts }
    },
    staleTime: 5 * 60_000,
  })
  const listQuery = useQuery({
    queryKey: queryKeys.invoices.list(request),
    queryFn: () => listInvoices({
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
    placeholderData: (previous) => previous,
  })
  const summaryQuery = useQuery({
    queryKey: queryKeys.invoices.summary(filters.month),
    queryFn: () => getInvoicesSummary(filters.month),
  })

  useEffect(() => {
    if (referencesQuery.error) message.error(getUserErrorMessage(referencesQuery.error, 'Unable to load the invoice form options.'))
  }, [referencesQuery.error])
  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all })
  }, [queryClient])
  const reloadOptions = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.references })
  }, [queryClient])

  return {
    loading: listQuery.isLoading,
    error: listQuery.error ? getUserErrorMessage(listQuery.error, 'Unable to load invoices.') : null,
    items: listQuery.data?.items ?? [],
    total: listQuery.data?.total ?? 0,
    summary: summaryQuery.data ?? { totalInvoices: 0, paidInvoices: 0, unpaidInvoices: 0, totalRevenue: 0 },
    references: referencesQuery.data ?? emptyReferences,
    reload,
    reloadOptions,
  }
}
