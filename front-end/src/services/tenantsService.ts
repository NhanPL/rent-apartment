import type {
  BuildingOption,
  Contract,
  ContractUpsertPayload,
  RentalContractExportData,
  RoomOption,
  Tenant,
  TenantCurrentRoom,
  TenantDetail,
  TenantFormPayload,
  TenantListItem,
  TenantListParams,
} from '../pages/tenants/types'

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

interface BuildingRecord extends BuildingOption {
  manager_user_id: string
  address: string
}

interface RoomRecord extends RoomOption {
  floor: number | null
  area_m2: number | null
}

interface AppUserRecord {
  id: string
  phone: string | null
}

interface ManagerProfileRecord {
  user_id: string
  full_name: string
}

const managerUsers: AppUserRecord[] = [{ id: 'm-1', phone: '0909009009' }]

const managerProfiles: ManagerProfileRecord[] = [{ user_id: 'm-1', full_name: 'Le Quoc Tuan' }]

const buildings: BuildingRecord[] = [
  { id: 'b-1', name: 'Sunrise Riverside', manager_user_id: 'm-1', address: '12 Nguyen Huu Tho, Nha Be, TP.HCM' },
  { id: 'b-2', name: 'Lotus Garden', manager_user_id: 'm-1', address: '120 Le Dai Hanh, Hai Chau, Da Nang' },
]

const rooms: RoomRecord[] = [
  { id: 'r-101', building_id: 'b-1', code: 'A-101', floor: 1, area_m2: 22 },
  { id: 'r-202', building_id: 'b-2', code: 'B-202', floor: 2, area_m2: 28 },
  { id: 'r-203', building_id: 'b-2', code: 'B-203', floor: 2, area_m2: 26 },
]

let contractsDb: Contract[] = [
  {
    id: 'c-1',
    room_id: 'r-101',
    contract_code: 'HD-001',
    status: 'ACTIVE',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
    move_in_date: '2025-01-01',
    move_out_date: null,
    rent_price: 5500000,
    deposit_amount: 5500000,
    billing_day: 5,
    note: '1 main tenant',
  },
  {
    id: 'c-2',
    room_id: 'r-202',
    contract_code: 'HD-002',
    status: 'ACTIVE',
    start_date: '2025-02-01',
    end_date: null,
    move_in_date: '2025-02-01',
    move_out_date: null,
    rent_price: 6200000,
    deposit_amount: 6200000,
    billing_day: 10,
    note: null,
  },
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

function findRoom(roomId: string) {
  return rooms.find((room) => room.id === roomId) ?? null
}

function findBuilding(buildingId: string) {
  return buildings.find((building) => building.id === buildingId) ?? null
}

function toCurrentRoom(tenantId: string, contract: Contract | null): TenantCurrentRoom | null {
  if (!contract || contract.status !== 'ACTIVE') {
    return null
  }

  const room = findRoom(contract.room_id)
  if (!room) {
    return null
  }

  const building = findBuilding(room.building_id)
  if (!building) {
    return null
  }

  return {
    tenant_id: tenantId,
    room_id: room.id,
    room_code: room.code,
    building_id: building.id,
    building_name: building.name,
    contract_id: contract.id,
    start_date: contract.start_date,
  }
}

function withCurrentRoom(tenant: Tenant): TenantListItem {
  return {
    ...tenant,
    current_room: currentRooms.get(tenant.id) ?? null,
  }
}

function setTenantContract(tenantId: string, contractPayload: ContractUpsertPayload | null) {
  if (
    !contractPayload?.room_id ||
    !contractPayload.start_date ||
    contractPayload.rent_price === null ||
    contractPayload.deposit_amount === null ||
    contractPayload.billing_day === null
  ) {
    currentRooms.delete(tenantId)
    return
  }

  const existingId = currentRooms.get(tenantId)?.contract_id
  const contractId = existingId ?? crypto.randomUUID()

  const contract: Contract = {
    id: contractId,
    room_id: contractPayload.room_id,
    contract_code: contractPayload.contract_code,
    status: contractPayload.status,
    start_date: contractPayload.start_date,
    end_date: contractPayload.end_date,
    move_in_date: contractPayload.move_in_date,
    move_out_date: contractPayload.move_out_date,
    rent_price: contractPayload.rent_price,
    deposit_amount: contractPayload.deposit_amount,
    billing_day: contractPayload.billing_day,
    note: contractPayload.note,
  }

  contractsDb = [...contractsDb.filter((item) => item.id !== contractId), contract]

  const currentRoom = toCurrentRoom(tenantId, contract)
  if (currentRoom) {
    currentRooms.set(tenantId, currentRoom)
    return
  }

  currentRooms.delete(tenantId)
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

export async function getTenant(id: string): Promise<TenantDetail> {
  await wait(240)

  const found = tenantsDb.find((tenant) => tenant.id === id)
  if (!found) {
    throw new Error('Tenant not found')
  }

  const listItem = withCurrentRoom(found)
  const currentContract = listItem.current_room
    ? contractsDb.find((contract) => contract.id === listItem.current_room?.contract_id) ?? null
    : null

  return {
    ...listItem,
    current_contract: currentContract,
  }
}

export async function getTenantContractExportData(tenantId: string): Promise<RentalContractExportData> {
  const tenant = await getTenant(tenantId)

  if (!tenant.current_room) {
    throw new Error('Tenant does not have an active room assignment.')
  }

  if (!tenant.current_contract) {
    throw new Error('Tenant does not have an active contract.')
  }

  if (!tenant.current_contract.start_date) {
    throw new Error('Contract start date is missing.')
  }

  const room = rooms.find((item) => item.id === tenant.current_room?.room_id)
  if (!room) {
    throw new Error('Assigned room data is missing.')
  }

  const building = buildings.find((item) => item.id === room.building_id)
  if (!building) {
    throw new Error('Assigned building data is missing.')
  }

  const managerProfile = managerProfiles.find((item) => item.user_id === building.manager_user_id)
  if (!managerProfile) {
    throw new Error('Landlord profile is missing.')
  }

  const managerUser = managerUsers.find((item) => item.id === building.manager_user_id) ?? null

  return {
    landlord: {
      full_name: managerProfile.full_name,
      phone: managerUser?.phone ?? null,
      address: building.address,
    },
    tenant: {
      full_name: tenant.full_name,
      phone: tenant.phone,
      email: tenant.email,
      identity_number: tenant.identity_number,
      permanent_address: tenant.permanent_address,
    },
    building: {
      name: building.name,
      address: building.address,
    },
    room: {
      code: room.code,
      floor: room.floor,
      area_m2: room.area_m2,
    },
    contract: {
      contract_code: tenant.current_contract.contract_code,
      start_date: tenant.current_contract.start_date,
      end_date: tenant.current_contract.end_date,
      rent_price: tenant.current_contract.rent_price,
      deposit_amount: tenant.current_contract.deposit_amount,
      billing_day: tenant.current_contract.billing_day,
      note: tenant.current_contract.note,
    },
  }
}

export async function createTenant(payload: TenantFormPayload): Promise<TenantListItem> {
  await wait(350)

  const now = new Date().toISOString()
  const created: Tenant = {
    id: crypto.randomUUID(),
    user_id: null,
    created_at: now,
    updated_at: now,
    ...payload.tenant,
  }

  tenantsDb = [created, ...tenantsDb]
  setTenantContract(created.id, payload.contract)

  return withCurrentRoom(created)
}

export async function updateTenant(id: string, payload: TenantFormPayload): Promise<TenantListItem> {
  await wait(350)

  let updatedTenant: Tenant | null = null
  tenantsDb = tenantsDb.map((tenant) => {
    if (tenant.id !== id) {
      return tenant
    }

    updatedTenant = {
      ...tenant,
      ...payload.tenant,
      updated_at: new Date().toISOString(),
    }

    return updatedTenant
  })

  if (!updatedTenant) {
    throw new Error('Tenant not found')
  }

  setTenantContract(id, payload.contract)

  return withCurrentRoom(updatedTenant)
}

export async function deleteTenant(id: string): Promise<void> {
  await wait(280)
  tenantsDb = tenantsDb.filter((tenant) => tenant.id !== id)

  const contractId = currentRooms.get(id)?.contract_id
  if (contractId) {
    contractsDb = contractsDb.filter((contract) => contract.id !== contractId)
  }

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
