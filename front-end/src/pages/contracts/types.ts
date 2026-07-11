export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
export type ContractBusinessStage = 'RESERVED' | 'WAITING_SIGNATURE' | 'WAITING_HANDOVER' | 'ACTIVE' | 'CANCELLED' | 'ENDED'

export interface BuildingOption {
  id: string
  name: string
}

export interface RoomOption {
  id: string
  building_id: string
  code: string
  base_rent: number
  deposit_default: number
  max_occupants: number
}

export interface TenantOption {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  identity_number?: string | null
  status?: string | null
}

export interface ContractTenant {
  contract_id: string
  tenant_id: string
  is_primary: boolean
  joined_at: string
  left_at: string | null
  full_name: string
  phone: string | null
  email: string | null
  identity_number: string | null
}

export type ContractDocumentType = 'SIGNED_SCAN' | 'ADDENDUM' | 'TERMINATION' | 'OTHER'

export interface ContractDocument {
  id: string
  contract_id: string
  doc_type: ContractDocumentType
  file_name: string | null
  file_url: string | null
  mime_type: string | null
  file_size: number | null
  uploaded_by_user_id: string | null
  uploaded_at: string | null
  note: string | null
  created_at: string
}

export interface ContractListItem {
  id: string
  room_id: string
  room_code: string
  building_id: string
  building_name: string
  contract_code: string | null
  status: ContractStatus
  business_stage?: ContractBusinessStage
  start_date: string
  end_date: string | null
  move_in_date: string | null
  move_out_date: string | null
  rent_price: number
  deposit_amount: number
  billing_day: number
  note: string | null
  tenant_id: string | null
  tenant_name: string | null
  tenant_names: string
  active_tenants_count: number
  created_at: string
  updated_at: string
}

export interface ContractDetail extends ContractListItem {
  max_occupants: number
  tenants: ContractTenant[]
  documents: ContractDocument[]
}

export interface ContractDocumentPayload {
  doc_type: ContractDocumentType
  file_name?: string | null
  file_url: string
  mime_type: string
  file_size: number
  note?: string | null
}

export interface ContractListParams {
  search?: string
  building_id?: string
  room_id?: string
  tenant_id?: string
  status?: ContractStatus
  business_stage?: ContractBusinessStage
  page?: number
  pageSize?: number
}

export interface PaginatedContractsResponse {
  items: ContractListItem[]
  page: number
  pageSize: number
  total: number
}

export interface ContractTenantPayload {
  tenant_id?: string
  is_primary?: boolean
  joined_at?: string
  left_at?: string | null
}

export interface ContractCreatePayload {
  room_id: string
  contract_code?: string | null
  status?: ContractStatus
  start_date: string
  end_date?: string | null
  move_in_date?: string | null
  move_out_date?: string | null
  rent_price?: number | null
  deposit_amount?: number | null
  billing_day?: number | null
  note?: string | null
  tenants?: Array<Required<Pick<ContractTenantPayload, 'tenant_id'>> & Omit<ContractTenantPayload, 'tenant_id'>>
}

export type ContractUpdatePayload = Partial<Omit<ContractCreatePayload, 'status' | 'tenants'>>

export interface ContractClosePayload {
  end_date?: string | null
  move_out_date?: string | null
  note?: string | null
}
