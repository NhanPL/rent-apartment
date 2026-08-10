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
    <Card title="Room information">
      <Descriptions bordered column={1} size={compact ? 'small' : 'default'}>
        <Descriptions.Item label="Building">{context.building.name}</Descriptions.Item>
        <Descriptions.Item label="Room code">{context.room.code}</Descriptions.Item>
        <Descriptions.Item label="Status"><Tag color={context.room.status === 'ACTIVE' ? 'green' : 'default'}>{context.room.status}</Tag></Descriptions.Item>
        <Descriptions.Item label="Contract rent">{formatCurrency(context.contract.rent_price)}</Descriptions.Item>
        <Descriptions.Item label="Capacity">{context.room.max_occupants} people</Descriptions.Item>
        <Descriptions.Item label="Floor">{context.room.floor ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="Area">{context.room.area_m2 ? `${context.room.area_m2} m2` : '-'}</Descriptions.Item>
        <Descriptions.Item label="Note">{context.room.note ?? '-'}</Descriptions.Item>
      </Descriptions>
    </Card>
  )
}
