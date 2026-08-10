import { useCallback, useEffect } from 'react'
import { message } from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listBuildings, listContracts, listRooms, listTenants } from '../../../services/contractsService'
import { getUserErrorMessage } from '../../../services/errorMessage'
import { queryKeys } from '../../../query/queryClient'
import type { ContractBusinessStage, ContractStatus } from '../types'

interface ContractQuery {
  search: string
  status?: ContractStatus
  businessStage?: ContractBusinessStage
  buildingId?: string
  roomId?: string
  tenantId?: string
  page: number
  pageSize: number
}

export function useContractsData(query: ContractQuery) {
  const queryClient = useQueryClient()
  const referencesQuery = useQuery({
    queryKey: queryKeys.contracts.references,
    queryFn: async () => {
      const [buildings, rooms, tenants] = await Promise.all([listBuildings(), listRooms(), listTenants()])
      return { buildings, rooms, tenants }
    },
    staleTime: 5 * 60_000,
  })
  const listQuery = useQuery({
    queryKey: queryKeys.contracts.list(query),
    queryFn: () => listContracts({
      search: query.search,
      status: query.status,
      business_stage: query.businessStage,
      building_id: query.buildingId,
      room_id: query.roomId,
      tenant_id: query.tenantId,
      page: query.page,
      pageSize: query.pageSize,
    }),
    placeholderData: (previous) => previous,
  })

  useEffect(() => {
    if (referencesQuery.error) message.error(getUserErrorMessage(referencesQuery.error, 'Unable to load contract filters.'))
  }, [referencesQuery.error])
  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.contracts.all })
  }, [queryClient])

  return {
    loading: listQuery.isLoading,
    error: listQuery.error ? getUserErrorMessage(listQuery.error, 'Unable to load contracts.') : null,
    items: listQuery.data?.items ?? [],
    total: listQuery.data?.total ?? 0,
    buildings: referencesQuery.data?.buildings ?? [],
    rooms: referencesQuery.data?.rooms ?? [],
    tenants: referencesQuery.data?.tenants ?? [],
    reload,
  }
}
