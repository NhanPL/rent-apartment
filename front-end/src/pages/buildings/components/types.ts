import type { Building } from '../../../types/building'

export type BuildingStatus = 'active' | 'inactive'

export interface BuildingEntity extends Building {
  status: BuildingStatus
  units: number
  manager: string
  createdAt: string
}

export interface BuildingFormValues {
  code: string
  name: string
  address: string
  note: string
  status: BuildingStatus
  manager: string
}

export type StatusFilter = 'all' | BuildingStatus
