import type { BuildingEntity } from './types'
import type { MonthlyBill, MonthlyBillUpsertPayload, Room, RoomUpsertPayload, TenantSummary } from './roomTypes'

const wait = (ms = 220) => new Promise((resolve) => window.setTimeout(resolve, ms))

let roomsStore: Room[] = [
  {
    id: 'r-101',
    building_id: '1',
    code: 'A-101',
    floor: 1,
    area_m2: 28,
    status: 'ACTIVE',
    base_rent: 420,
    deposit_default: 840,
    max_occupants: 2,
    note: 'Near window',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'r-102',
    building_id: '1',
    code: 'A-102',
    floor: 1,
    area_m2: 30,
    status: 'MAINTENANCE',
    base_rent: 450,
    deposit_default: 900,
    max_occupants: 2,
    note: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'r-201',
    building_id: '2',
    code: 'B-201',
    floor: 2,
    area_m2: 32,
    status: 'ACTIVE',
    base_rent: 510,
    deposit_default: 1020,
    max_occupants: 3,
    note: 'City view',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

const roomTenantsStore: Record<string, TenantSummary[]> = {
  'r-101': [
    {
      id: 't-1',
      full_name: 'Nguyen Van A',
      email: 'nguyenvana@gmail.com',
      phone: '0901000101',
      status: 'ACTIVE',
      contract_start_date: '2024-02-01',
    },
  ],
  'r-102': [],
  'r-201': [
    {
      id: 't-2',
      full_name: 'Tran Thi B',
      email: 'tranthib@gmail.com',
      phone: '0902000202',
      status: 'ACTIVE',
      contract_start_date: '2024-05-01',
    },
    {
      id: 't-3',
      full_name: 'Le Van C',
      email: null,
      phone: '0903000303',
      status: 'ACTIVE',
      contract_start_date: '2024-05-01',
    },
  ],
}

function computeBill(payload: MonthlyBillUpsertPayload) {
  const electric_usage = Math.max(0, payload.electricity_curr - payload.electricity_prev)
  const water_usage = Math.max(0, payload.water_curr - payload.water_prev)
  const electric_amount = electric_usage * payload.electric_unit_price
  const water_amount = water_usage * payload.water_unit_price
  const subtotal = payload.rent_amount + electric_amount + water_amount + payload.other_fees
  const total_bill_amount = Math.max(0, subtotal - payload.discount)

  return {
    electric_usage,
    water_usage,
    electric_amount,
    water_amount,
    total_bill_amount,
  }
}

let monthlyBillsStore: MonthlyBill[] = [
  {
    id: 'b-1',
    room_id: 'r-101',
    contract_id: 'c-1',
    month: '2025-01-01',
    electricity_prev: 1200,
    electricity_curr: 1250,
    water_prev: 350,
    water_curr: 362,
    electric_unit_price: 0.8,
    water_unit_price: 0.5,
    rent_amount: 420,
    other_fees: 15,
    discount: 0,
    electric_usage: 50,
    water_usage: 12,
    electric_amount: 40,
    water_amount: 6,
    total_bill_amount: 481,
    invoice_status: 'PAID',
    issued_at: '2025-01-02',
    due_date: '2025-01-10',
    note: null,
  },
]

export async function listRoomsByBuildingId(params: {
  building_id: string
  search?: string
  status?: Room['status'] | 'ALL'
}): Promise<Room[]> {
  await wait()
  const normalized = params.search?.trim().toLowerCase() ?? ''
  return roomsStore
    .filter((room) => room.building_id === params.building_id)
    .filter((room) => !normalized || room.code.toLowerCase().includes(normalized))
    .filter((room) => params.status === 'ALL' || !params.status || room.status === params.status)
}

export async function createRoom(payload: RoomUpsertPayload): Promise<Room> {
  await wait()
  const room: Room = {
    ...payload,
    id: `r-${Date.now()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  roomsStore = [room, ...roomsStore]
  roomTenantsStore[room.id] = []
  return room
}

export async function updateRoom(roomId: string, payload: RoomUpsertPayload): Promise<Room> {
  await wait()
  const nextRoom: Room = {
    ...payload,
    id: roomId,
    created_at: roomsStore.find((room) => room.id === roomId)?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  roomsStore = roomsStore.map((room) => (room.id === roomId ? nextRoom : room))
  return nextRoom
}

export async function deleteRoom(roomId: string): Promise<void> {
  await wait()
  roomsStore = roomsStore.filter((room) => room.id !== roomId)
  monthlyBillsStore = monthlyBillsStore.filter((bill) => bill.room_id !== roomId)
  delete roomTenantsStore[roomId]
}

export async function getRoomDetail(roomId: string, buildings: BuildingEntity[]): Promise<(Room & { building_name: string }) | null> {
  await wait()
  const room = roomsStore.find((item) => item.id === roomId)
  if (!room) return null
  const building = buildings.find((item) => item.id === room.building_id)
  return { ...room, building_name: building?.name ?? 'Unknown Building' }
}

export async function listTenantsByRoomId(room_id: string): Promise<TenantSummary[]> {
  await wait(180)
  return roomTenantsStore[room_id] ?? []
}

export async function listMonthlyBillsByRoomId(room_id: string): Promise<MonthlyBill[]> {
  await wait(180)
  return monthlyBillsStore
    .filter((bill) => bill.room_id === room_id)
    .sort((a, b) => b.month.localeCompare(a.month))
}

export async function createMonthlyBill(payload: MonthlyBillUpsertPayload): Promise<MonthlyBill> {
  await wait()
  const computed = computeBill(payload)
  const bill: MonthlyBill = {
    ...payload,
    ...computed,
    id: `bill-${Date.now()}`,
  }
  monthlyBillsStore = [bill, ...monthlyBillsStore.filter((item) => !(item.room_id === payload.room_id && item.month === payload.month))]
  return bill
}

export async function updateMonthlyBill(billId: string, payload: MonthlyBillUpsertPayload): Promise<MonthlyBill> {
  await wait()
  const computed = computeBill(payload)
  const bill: MonthlyBill = { ...payload, ...computed, id: billId }
  monthlyBillsStore = monthlyBillsStore.map((item) => (item.id === billId ? bill : item))
  return bill
}

export async function deleteMonthlyBill(billId: string): Promise<void> {
  await wait()
  monthlyBillsStore = monthlyBillsStore.filter((item) => item.id !== billId)
}
