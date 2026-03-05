import type { BuildingEntity } from './components/types'

export const mockBuildings: BuildingEntity[] = [
  {
    id: '1',
    code: 'BLD-001',
    name: 'Sunrise Riverside',
    address: '12 Nguyễn Văn Cừ, Quận 5, TP.HCM',
    note: 'Near downtown district',
    status: 'active',
    units: 56,
    manager: 'Thanh Nguyen',
    createdAt: '2024-01-10',
  },
  {
    id: '2',
    code: 'BLD-002',
    name: 'Green Valley',
    address: '88 Phạm Văn Đồng, TP. Thủ Đức',
    note: 'High occupancy rate',
    status: 'inactive',
    units: 42,
    manager: 'Minh Tran',
    createdAt: '2024-02-05',
  },
]
