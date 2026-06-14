import { API_ROUTES } from '../../../services/apiRoutes'
import { apiRequest } from '../../../services/apiClient'
import { listInvoices } from '../../../services/invoicesService'
import type { TenantListResponse } from '../../../services/tenantsService'
import type { InvoiceListItem } from '../../invoices/types'
import type { MonthlyBill, Room, RoomUpsertPayload, TenantSummary } from './roomTypes'

interface BuildingRow {
  id: string
  manager_user_id: string
  code: string
  name: string
  address: string
  note: string | null
  units?: number
  active_units?: number
  has_active_rooms?: boolean
  manager_name?: string | null
  created_at: string
  updated_at: string
}

export interface BuildingEntity {
  id: string
  code: string
  name: string
  address: string
  note: string
  units: number
  activeUnits: number
  manager: string
  createdAt: string
}

export interface BuildingFormValues {
  code: string
  name: string
  address: string
  note: string
}

interface RoomInvoiceGenerationResponse {
  month: string
  generated: Array<{ id: string }>
  skipped: Array<{ contract_id?: string; room_id?: string; reason?: string }>
  total: number
}

const toNumber = (value: unknown): number => Number(value ?? 0)

const mapBuilding = (row: BuildingRow): BuildingEntity => ({
  id: row.id,
  code: row.code,
  name: row.name,
  address: row.address,
  note: row.note ?? '',
  units: Number(row.units ?? 0),
  activeUnits: Number(row.active_units ?? 0),
  manager: row.manager_name ?? 'Unassigned manager',
  createdAt: row.created_at,
})

const mapRoom = (row: Room): Room => ({
  ...row,
  floor: row.floor === null ? null : toNumber(row.floor),
  area_m2: row.area_m2 === null ? null : toNumber(row.area_m2),
  base_rent: toNumber(row.base_rent),
  deposit_default: toNumber(row.deposit_default),
  max_occupants: toNumber(row.max_occupants),
  occupants_count: toNumber(row.occupants_count),
  latest_invoice_total:
    row.latest_invoice_total === null || row.latest_invoice_total === undefined ? null : toNumber(row.latest_invoice_total),
})

const mapInvoiceToMonthlyBill = (invoice: InvoiceListItem): MonthlyBill => ({
  id: invoice.id,
  room_id: invoice.room_id,
  contract_id: invoice.contract_id,
  month: invoice.month,
  electricity_prev: toNumber(invoice.electricity_prev),
  electricity_curr: toNumber(invoice.electricity_curr),
  water_prev: toNumber(invoice.water_prev),
  water_curr: toNumber(invoice.water_curr),
  electric_unit_price: toNumber(invoice.electric_unit_price),
  water_unit_price: toNumber(invoice.water_unit_price),
  rent_amount: toNumber(invoice.rent_amount),
  other_fees: toNumber(invoice.other_fees),
  discount: toNumber(invoice.discount),
  electric_usage: toNumber(invoice.electric_usage),
  water_usage: toNumber(invoice.water_usage),
  electric_amount: toNumber(invoice.electric_amount),
  water_amount: toNumber(invoice.water_amount),
  total_bill_amount: toNumber(invoice.total),
  invoice_status: invoice.status,
  issued_at: invoice.issued_at,
  due_date: invoice.due_date,
  note: invoice.note,
})

export async function listBuildings(): Promise<BuildingEntity[]> {
  const rows = await apiRequest<BuildingRow[]>(API_ROUTES.buildings.list)
  return rows.map(mapBuilding)
}

export async function getBuilding(id: string): Promise<BuildingEntity> {
  const row = await apiRequest<BuildingRow>(API_ROUTES.buildings.detail(id))
  return mapBuilding(row)
}

export function createBuilding(payload: BuildingFormValues): Promise<BuildingRow> {
  return apiRequest<BuildingRow>(API_ROUTES.buildings.list, { method: 'POST', body: payload })
}

export function updateBuilding(id: string, payload: BuildingFormValues): Promise<BuildingRow> {
  return apiRequest<BuildingRow>(API_ROUTES.buildings.detail(id), { method: 'PUT', body: payload })
}

export function deleteBuilding(id: string): Promise<void> {
  return apiRequest<void>(API_ROUTES.buildings.detail(id), { method: 'DELETE' })
}

export async function listRoomsByBuildingId(params: {
  building_id: string
  search?: string
  status?: Room['status'] | 'ALL'
}): Promise<Room[]> {
  const query = new URLSearchParams({ building_id: params.building_id })
  const rooms = await apiRequest<Room[]>(`${API_ROUTES.rooms.list}?${query.toString()}`)
  const normalized = params.search?.trim().toLowerCase() ?? ''

  return rooms
    .map(mapRoom)
    .filter((room) => !normalized || room.code.toLowerCase().includes(normalized))
    .filter((room) => params.status === 'ALL' || !params.status || room.status === params.status)
}

export function createRoom(payload: RoomUpsertPayload): Promise<Room> {
  return apiRequest<Room>(API_ROUTES.rooms.list, { method: 'POST', body: payload }).then(mapRoom)
}

export function updateRoom(roomId: string, payload: RoomUpsertPayload): Promise<Room> {
  return apiRequest<Room>(API_ROUTES.rooms.detail(roomId), { method: 'PUT', body: payload }).then(mapRoom)
}

export function deleteRoom(roomId: string): Promise<void> {
  return apiRequest<void>(API_ROUTES.rooms.detail(roomId), { method: 'DELETE' })
}

export function getRoomDetail(roomId: string): Promise<Room & { building_name: string }> {
  return apiRequest<Room & { building_name: string }>(API_ROUTES.rooms.detail(roomId)).then((room) => ({
    ...mapRoom(room),
    building_name: room.building_name,
  }))
}

export async function listTenantsByRoomId(room_id: string): Promise<TenantSummary[]> {
  const query = new URLSearchParams({ room_id, status: 'ACTIVE', pageSize: '100' })
  const response = await apiRequest<TenantListResponse>(`${API_ROUTES.tenants.list}?${query.toString()}`)

  return response.items.map((tenant) => ({
    id: tenant.id,
    full_name: tenant.full_name,
    email: tenant.email,
    phone: tenant.phone,
    status: tenant.status === 'DELETED' ? 'MOVED_OUT' : tenant.status,
    contract_start_date: tenant.current_room?.start_date ?? null,
  }))
}

export async function listMonthlyBillsByRoomId(room_id: string): Promise<MonthlyBill[]> {
  const invoices = await listInvoices({ room_id })
  return invoices.map(mapInvoiceToMonthlyBill)
}

export function generateMonthlyInvoiceForRoom(room_id: string, month: string): Promise<RoomInvoiceGenerationResponse> {
  return apiRequest<RoomInvoiceGenerationResponse>(API_ROUTES.invoices.generateRoom, {
    method: 'POST',
    body: { room_id, month },
  })
}
