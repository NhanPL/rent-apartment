import { Card, Descriptions, Tag } from 'antd'
import type { getMyRoomContext } from '../../../services/tenantRoomService'

type RoomContext = NonNullable<Awaited<ReturnType<typeof getMyRoomContext>>>

interface Props {
  context: RoomContext
  compact: boolean
  formatCurrency: (value: number) => string
}

export function RoomContractSummary({ context, compact, formatCurrency }: Props) {
  return (
    <Card title="Thong tin phong">
      <Descriptions bordered column={1} size={compact ? 'small' : 'default'}>
        <Descriptions.Item label="Toa nha">{context.building.name}</Descriptions.Item>
        <Descriptions.Item label="Ma phong">{context.room.code}</Descriptions.Item>
        <Descriptions.Item label="Trang thai"><Tag color={context.room.status === 'ACTIVE' ? 'green' : 'default'}>{context.room.status}</Tag></Descriptions.Item>
        <Descriptions.Item label="Gia thue hop dong">{formatCurrency(context.contract.rent_price)}</Descriptions.Item>
        <Descriptions.Item label="Suc chua">{context.room.max_occupants} nguoi</Descriptions.Item>
        <Descriptions.Item label="Tang">{context.room.floor ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="Dien tich">{context.room.area_m2 ? `${context.room.area_m2} m2` : '-'}</Descriptions.Item>
        <Descriptions.Item label="Ghi chu">{context.room.note ?? '-'}</Descriptions.Item>
      </Descriptions>
    </Card>
  )
}
