import { API_ROUTES } from '../../../services/apiRoutes'
import { apiRequest } from '../../../services/apiClient'
import type { TenantListResponse } from '../../../services/tenantsService'
import type { Invoice, InvoiceItem } from '../../invoices/types'
import type { MonthlyBill, Room, RoomUpsertPayload, TenantSummary } from './roomTypes'

interface BuildingRow {
  id: string
  manager_user_id: string
  code: string
  name: string
  address: string
  note: string | null
  units?: number
  has_active_rooms?: boolean
  created_at: string
  updated_at: string
}

export interface BuildingEntity {
  id: string
  code: string
  name: string
  address: string
  note: string
  status: 'active' | 'inactive'
  units: number
  manager: string
  createdAt: string
}

export interface BuildingFormValues {
  code: string
  name: string
  address: string
  note: string
}

const toNumber = (value: unknown): number => Number(value ?? 0)

const mapBuilding = (row: BuildingRow): BuildingEntity => ({
  id: row.id,
  code: row.code,
  name: row.name,
  address: row.address,
  note: row.note ?? '',
  status: row.has_active_rooms ? 'active' : 'inactive',
  units: Number(row.units ?? 0),
  manager: 'Current manager',
  createdAt: row.created_at,
})

interface InvoiceDetail extends Invoice {
  items: Array<InvoiceItem & { meta?: { prev?: number | string | null; curr?: number | string | null } | null }>
}

const getInvoiceItem = (invoice: InvoiceDetail, code: string) => invoice.items.find((item) => item.code === code)

const mapInvoiceToMonthlyBill = (invoice: InvoiceDetail): MonthlyBill => {
  const rent = getInvoiceItem(invoice, 'ROOM_RENT')
  const electricity = getInvoiceItem(invoice, 'ELECTRICITY')
  const water = getInvoiceItem(invoice, 'WATER')
  const other = getInvoiceItem(invoice, 'OTHER')

  return {
    id: invoice.id,
    room_id: invoice.room_id,
    contract_id: invoice.contract_id,
    month: invoice.month,
    electricity_prev: toNumber(electricity?.meta?.prev),
    electricity_curr: toNumber(electricity?.meta?.curr),
    water_prev: toNumber(water?.meta?.prev),
    water_curr: toNumber(water?.meta?.curr),
    electric_unit_price: toNumber(electricity?.unit_price),
    water_unit_price: toNumber(water?.unit_price),
    rent_amount: toNumber(rent?.amount),
    other_fees: toNumber(other?.amount),
    discount: toNumber(invoice.discount),
    electric_usage: toNumber(electricity?.quantity),
    water_usage: toNumber(water?.quantity),
    electric_amount: toNumber(electricity?.amount),
    water_amount: toNumber(water?.amount),
    total_bill_amount: toNumber(invoice.total),
    invoice_status: invoice.status,
    issued_at: invoice.issued_at,
    due_date: invoice.due_date,
    note: invoice.note,
  }
}

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
    .filter((room) => !normalized || room.code.toLowerCase().includes(normalized))
    .filter((room) => params.status === 'ALL' || !params.status || room.status === params.status)
}

export function createRoom(payload: RoomUpsertPayload): Promise<Room> {
  return apiRequest<Room>(API_ROUTES.rooms.list, { method: 'POST', body: payload })
}

export function updateRoom(roomId: string, payload: RoomUpsertPayload): Promise<Room> {
  return apiRequest<Room>(API_ROUTES.rooms.detail(roomId), { method: 'PUT', body: payload })
}

export function deleteRoom(roomId: string): Promise<void> {
  return apiRequest<void>(API_ROUTES.rooms.detail(roomId), { method: 'DELETE' })
}

export function getRoomDetail(roomId: string): Promise<Room & { building_name: string }> {
  return apiRequest<Room & { building_name: string }>(API_ROUTES.rooms.detail(roomId))
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
  const invoices = await apiRequest<Invoice[]>(API_ROUTES.invoices.list)
  const roomInvoices = invoices
    .filter((invoice) => invoice.room_id === room_id)
    .sort((a, b) => b.month.localeCompare(a.month))

  const details = await Promise.all(
    roomInvoices.map((invoice) => apiRequest<InvoiceDetail>(API_ROUTES.invoices.detail(invoice.id))),
  )

  return details.map(mapInvoiceToMonthlyBill)
}
