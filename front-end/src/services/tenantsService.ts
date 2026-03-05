import type {
  BuildingOption,
  RoomOption,
  Tenant,
  TenantCurrentRoom,
  TenantListItem,
  TenantListParams,
  TenantUpsertPayload,
} from '../pages/tenants/types'

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const buildings: BuildingOption[] = [
  { id: 'b-1', name: 'Sunrise Riverside' },
  { id: 'b-2', name: 'Lotus Garden' },
]

const rooms: RoomOption[] = [
  { id: 'r-101', building_id: 'b-1', code: 'A-101' },
  { id: 'r-202', building_id: 'b-2', code: 'B-202' },
  { id: 'r-203', building_id: 'b-2', code: 'B-203' },
]

const currentRooms = new Map<string, TenantCurrentRoom>([
  [
    't-1',
    {
      tenant_id: 't-1',
      room_id: 'r-101',
      room_code: 'A-101',
      building_id: 'b-1',
      building_name: 'Sunrise Riverside',
      contract_id: 'c-1',
      start_date: '2025-01-01',
    },
  ],
  [
    't-2',
    {
      tenant_id: 't-2',
      room_id: 'r-202',
      room_code: 'B-202',
      building_id: 'b-2',
      building_name: 'Lotus Garden',
      contract_id: 'c-2',
      start_date: '2025-02-01',
    },
  ],
])

let tenantsDb: Tenant[] = [
  {
    id: 't-1',
    user_id: null,
    full_name: 'Nguyen Minh Anh',
    dob: '1998-06-12',
    gender: 'FEMALE',
    identity_number: '079123456789',
    identity_issued_date: '2022-01-15',
    identity_issued_place: 'TP.HCM',
    email: 'minhanh@gmail.com',
    phone: '0901234567',
    permanent_address: 'Quan 7, TP.HCM',
    status: 'ACTIVE',
    note: 'Primary tenant',
    created_at: '2025-01-01T08:00:00.000Z',
    updated_at: '2025-01-05T08:00:00.000Z',
  },
  {
    id: 't-2',
    user_id: null,
    full_name: 'Tran Gia Bao',
    dob: '1996-04-20',
    gender: 'MALE',
    identity_number: '079998887777',
    identity_issued_date: '2021-08-10',
    identity_issued_place: 'Da Nang',
    email: 'giabao@gmail.com',
    phone: '0912233445',
    permanent_address: 'Hai Chau, Da Nang',
    status: 'ACTIVE',
    note: null,
    created_at: '2025-02-01T09:30:00.000Z',
    updated_at: '2025-02-03T11:15:00.000Z',
  },
  {
    id: 't-3',
    user_id: null,
    full_name: 'Le Thanh Binh',
    dob: null,
    gender: null,
    identity_number: '079111222333',
    identity_issued_date: null,
    identity_issued_place: null,
    email: null,
    phone: '0988111222',
    permanent_address: null,
    status: 'MOVED_OUT',
    note: 'Moved out in March',
    created_at: '2024-12-11T11:10:00.000Z',
    updated_at: '2025-03-01T07:00:00.000Z',
  },
]

function withCurrentRoom(tenant: Tenant): TenantListItem {
  return {
    ...tenant,
    current_room: currentRooms.get(tenant.id) ?? null,
  }
}

export async function listTenants(params: TenantListParams): Promise<TenantListItem[]> {
  await wait(300)

  const normalizedSearch = params.search?.trim().toLowerCase() ?? ''

  return tenantsDb
    .map(withCurrentRoom)
    .filter((tenant) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        tenant.full_name.toLowerCase().includes(normalizedSearch) ||
        tenant.phone.toLowerCase().includes(normalizedSearch) ||
        (tenant.email?.toLowerCase().includes(normalizedSearch) ?? false) ||
        tenant.identity_number.toLowerCase().includes(normalizedSearch)

      const matchesStatus = !params.status || tenant.status === params.status
      const matchesBuilding = !params.building_id || tenant.current_room?.building_id === params.building_id
      const matchesRoom = !params.room_id || tenant.current_room?.room_id === params.room_id

      return matchesSearch && matchesStatus && matchesBuilding && matchesRoom
    })
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

export async function getTenant(id: string): Promise<TenantListItem> {
  await wait(240)

  const found = tenantsDb.find((tenant) => tenant.id === id)
  if (!found) {
    throw new Error('Tenant not found')
  }

  return withCurrentRoom(found)
}

export async function createTenant(payload: TenantUpsertPayload): Promise<TenantListItem> {
  await wait(350)

  const now = new Date().toISOString()
  const created: Tenant = {
    id: crypto.randomUUID(),
    user_id: null,
    created_at: now,
    updated_at: now,
    ...payload,
  }

  tenantsDb = [created, ...tenantsDb]
  return withCurrentRoom(created)
}

export async function updateTenant(id: string, payload: TenantUpsertPayload): Promise<TenantListItem> {
  await wait(350)

  let updatedTenant: Tenant | null = null
  tenantsDb = tenantsDb.map((tenant) => {
    if (tenant.id !== id) {
      return tenant
    }

    updatedTenant = {
      ...tenant,
      ...payload,
      updated_at: new Date().toISOString(),
    }

    return updatedTenant
  })

  if (!updatedTenant) {
    throw new Error('Tenant not found')
  }

  return withCurrentRoom(updatedTenant)
}

export async function deleteTenant(id: string): Promise<void> {
  await wait(280)
  tenantsDb = tenantsDb.filter((tenant) => tenant.id !== id)
  currentRooms.delete(id)
}

export async function listBuildings(): Promise<BuildingOption[]> {
  await wait(150)
  return buildings
}

export async function listRooms(buildingId?: string): Promise<RoomOption[]> {
  await wait(150)

  if (!buildingId) {
    return rooms
  }

  return rooms.filter((room) => room.building_id === buildingId)
}
