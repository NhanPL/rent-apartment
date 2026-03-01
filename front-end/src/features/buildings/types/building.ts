export type BuildingStatus = 'active' | 'maintenance'

export interface Building {
  id: string
  name: string
  code: string
  address: string
  totalFloors: number
  totalApartments: number
  managerName: string
  status: BuildingStatus
  description: string
}

export interface BuildingFormValues {
  name: string
  code: string
  address: string
  totalFloors: string
  totalApartments: string
  managerName: string
  status: BuildingStatus
  description: string
}
