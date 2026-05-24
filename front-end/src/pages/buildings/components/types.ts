import type { BuildingEntity, BuildingFormValues } from './roomService'

export type BuildingStatus = BuildingEntity['status']
export type { BuildingEntity, BuildingFormValues }
export type StatusFilter = 'all' | BuildingStatus
