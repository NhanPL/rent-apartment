export type TenantStatus = 'ACTIVE' | 'MOVED_OUT' | 'BLACKLIST' | 'DELETED'
export type AccountStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'DISABLED'

export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'CANCELLED'

export interface Tenant {
  id: string
  user_id: string | null
  full_name: string
  dob: string | null
  gender: string | null
  identity_number: string
  identity_issued_date: string | null
  identity_issued_place: string | null
  email: string | null
  phone: string
  permanent_address: string | null
  status: TenantStatus
  account_status: AccountStatus | null
  note: string | null
  created_at: string
  updated_at: string
  privacy_erasure_requested_at?: string | null
  privacy_erasure_eligible_at?: string | null
  anonymized_at?: string | null
}

export interface Contract {
  id: string
  room_id: string
  contract_code: string | null
  status: ContractStatus
  start_date: string
  end_date: string | null
  move_in_date: string | null
  move_out_date: string | null
  rent_price: number
  deposit_amount: number
  billing_day: number
  note: string | null
}

export interface TenantCurrentRoom {
  tenant_id: string
  room_id: string
  room_code: string
  building_id: string
  building_name: string
  contract_id: string
  start_date: string
}

export interface TenantListItem extends Tenant {
  current_room: TenantCurrentRoom | null
}

export interface TenantDetail extends TenantListItem {
  current_contract: Contract | null
  identity_documents: TenantIdentityDocuments
  privacy_policy_version: string | null
  privacy_consent_granted: boolean | null
  privacy_consent_recorded_at: string | null
}

export type TenantIdentityDocumentType = 'IDENTITY_FRONT' | 'IDENTITY_BACK'

export interface TenantIdentityDocument {
  id: string
  tenant_id: string
  doc_type: TenantIdentityDocumentType
  file_name: string | null
  file_url: string
  mime_type: string
  file_size: number
  uploaded_at: string
}

export interface TenantIdentityDocuments {
  front: TenantIdentityDocument | null
  back: TenantIdentityDocument | null
}

export interface TenantListParams {
  search?: string
  status?: TenantStatus
  building_id?: string
  room_id?: string
  page?: number
  pageSize?: number
}

export interface TenantUpsertPayload {
  full_name: string
  dob: string | null
  gender: string | null
  identity_number: string
  identity_issued_date: string | null
  identity_issued_place: string | null
  email: string | null
  phone: string
  permanent_address: string | null
  status: TenantStatus
  note: string | null
}

export interface ContractUpsertPayload {
  building_id: string | null
  room_id: string | null
  status: ContractStatus
  start_date: string | null
  end_date: string | null
  move_in_date: string | null
  move_out_date: string | null
  rent_price: number | null
  deposit_amount: number | null
  billing_day: number | null
  note: string | null
}

export interface TenantFormPayload {
  tenant: TenantUpsertPayload
  privacy_consent?: boolean
}

export interface TenantErasureResult {
  message: string
  status: 'ANONYMIZED' | 'SCHEDULED'
  eligibleAt: string
}

export interface TenantCreateResult {
  message: string
  tenantId: string
  userId: string
  emailSent: boolean
}

export interface TenantIdentityDocumentFilePayload {
  file_name: string
  file_url: string
  mime_type: string
  file_size: number
  resource_type: 'image'
}

export interface TenantIdentityDocumentUpdatePayload {
  front?: TenantIdentityDocumentFilePayload | null
  back?: TenantIdentityDocumentFilePayload | null
}

export interface BuildingOption {
  id: string
  name: string
}

export interface RoomOption {
  id: string
  building_id: string
  code: string
}
