import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import {
  listBuildings,
  listContracts,
  listRooms,
  listTenants,
} from '../../../services/contractsService'
import { getUserErrorMessage } from '../../../services/errorMessage'
import type {
  BuildingOption,
  ContractBusinessStage,
  ContractListItem,
  ContractStatus,
  RoomOption,
  TenantOption,
} from '../types'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ContractListItem[]>([])
  const [total, setTotal] = useState(0)
  const [buildings, setBuildings] = useState<BuildingOption[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])

  const loadOptions = useCallback(async () => {
    try {
      const [buildingRows, roomRows, tenantRows] = await Promise.all([
        listBuildings(), listRooms(), listTenants(),
      ])
      setBuildings(buildingRows)
      setRooms(roomRows)
      setTenants(tenantRows)
    } catch (loadError) {
      message.error(getUserErrorMessage(loadError, 'Unable to load contract filters.'))
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await listContracts({
        search: query.search,
        status: query.status,
        business_stage: query.businessStage,
        building_id: query.buildingId,
        room_id: query.roomId,
        tenant_id: query.tenantId,
        page: query.page,
        pageSize: query.pageSize,
      })
      setItems(response.items)
      setTotal(response.total)
    } catch (loadError) {
      setError(getUserErrorMessage(loadError, 'Unable to load contracts.'))
    } finally {
      setLoading(false)
    }
  }, [query.buildingId, query.businessStage, query.page, query.pageSize, query.roomId, query.search, query.status, query.tenantId])

  useEffect(() => { void loadOptions() }, [loadOptions])
  useEffect(() => { void reload() }, [reload])

  return { loading, error, items, total, buildings, rooms, tenants, reload }
}
