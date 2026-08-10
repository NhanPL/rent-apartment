import type { ContractDocumentType } from '../types'

export interface ContractFormValues {
  building_id?: string
  room_id?: string
  contract_code?: string
  start_date?: string
  end_date?: string
  move_in_date?: string
  move_out_date?: string
  rent_price?: number
  deposit_amount?: number
  billing_day?: number
  note?: string
  primary_tenant_id?: string
  co_tenant_ids?: string[]
}

export interface AddTenantFormValues {
  tenant_id: string
  joined_at?: string
  is_primary?: boolean
}

export interface CloseContractFormValues {
  close_date: string
  note?: string
}

export interface ContractDocumentFormValues {
  doc_type: ContractDocumentType
  file_name?: string
  file_url?: string
  mime_type?: string
  file_size?: number
  note?: string
}
