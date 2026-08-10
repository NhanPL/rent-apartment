import { ReloadOutlined } from '@ant-design/icons'
import { Button, Input, Select } from 'antd'
import type {
  BuildingOption,
  ContractBusinessStage,
  ContractStatus,
  RoomOption,
  TenantOption,
} from '../types'

interface Props {
  search: string
  status?: ContractStatus
  businessStage?: ContractBusinessStage
  buildingId?: string
  roomId?: string
  tenantId?: string
  buildings: BuildingOption[]
  rooms: RoomOption[]
  tenants: TenantOption[]
  statusOptions: Array<{ label: string; value: ContractStatus }>
  businessStageOptions: Array<{ label: string; value: ContractBusinessStage }>
  onSearchChange: (value: string) => void
  onStatusChange: (value?: ContractStatus) => void
  onBusinessStageChange: (value?: ContractBusinessStage) => void
  onBuildingChange: (value?: string) => void
  onRoomChange: (value?: string) => void
  onTenantChange: (value?: string) => void
  onRefresh: () => void
}

export function ContractFilters(props: Props) {
  return (
    <div className="contracts-filters">
      <Input.Search placeholder="Search code, room, building, tenant" value={props.search} allowClear onChange={(event) => props.onSearchChange(event.target.value)} />
      <Select value={props.status} placeholder="Status" allowClear options={props.statusOptions} onChange={props.onStatusChange} />
      <Select value={props.businessStage} placeholder="Business stage" allowClear options={props.businessStageOptions} onChange={props.onBusinessStageChange} />
      <Select value={props.buildingId} placeholder="Building" allowClear options={props.buildings.map((item) => ({ label: item.name, value: item.id }))} onChange={props.onBuildingChange} />
      <Select value={props.roomId} placeholder="Room" allowClear options={props.rooms.map((item) => ({ label: item.code, value: item.id }))} onChange={props.onRoomChange} />
      <Select value={props.tenantId} placeholder="Tenant" allowClear showSearch optionFilterProp="label" options={props.tenants.map((item) => ({ label: item.full_name, value: item.id }))} onChange={props.onTenantChange} />
      <Button icon={<ReloadOutlined />} onClick={props.onRefresh}>Refresh</Button>
    </div>
  )
}
