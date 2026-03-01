export interface Building {
  id: string
  code: string
  name: string
  address: string
  note?: string
}

export type BuildingPayload = Omit<Building, 'id'>
