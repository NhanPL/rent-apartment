export type UtilityReadingStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'INVOICED'
export type UtilityEvidenceType = 'ELECTRIC' | 'WATER' | 'OTHER'

export interface BuildingOption {
  id: string
  name: string
}

export interface RoomOption {
  id: string
  building_id: string
  code: string
}

export interface UtilityEvidence {
  id: string
  utility_reading_id: string
  evidence_type: UtilityEvidenceType
  file_name: string | null
  file_url: string
  mime_type: string | null
  file_size: number | null
  uploaded_by_user_id: string | null
  uploaded_at: string
  note: string | null
  created_at: string
}

export interface UtilityReadingListItem {
  id: string
  room_id: string
  room_code: string
  building_id: string
  building_name: string
  tenant_id: string | null
  tenant_name: string | null
  month: string
  electricity_prev: number | null
  electricity_curr: number | null
  water_prev: number | null
  water_curr: number | null
  status: UtilityReadingStatus
  reported_by_user_id: string | null
  reported_at: string | null
  submitted_at: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  manager_note: string | null
  note: string | null
  evidence_count: number
  created_at: string
  updated_at: string
}

export interface UtilityReadingDetail extends UtilityReadingListItem {
  evidence: UtilityEvidence[]
}

export interface UtilityReadingListParams {
  building_id?: string
  room_id?: string
  month?: string
  status?: UtilityReadingStatus
}

export interface UtilityEvidencePayload {
  evidence_type: UtilityEvidenceType
  file_name?: string | null
  file_url: string
  mime_type: string
  file_size: number
  note?: string | null
}

export interface UtilityRate {
  id: string
  building_id: string
  building_name: string
  effective_from: string
  electricity_unit_price: number
  water_unit_price: number
  note: string | null
  created_at: string
  updated_at: string
}

export interface UtilityRatePayload {
  building_id: string
  effective_from: string
  electricity_unit_price: number
  water_unit_price: number
  note?: string | null
}
