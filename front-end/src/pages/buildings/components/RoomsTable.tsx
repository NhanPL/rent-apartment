import { DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons'
import { Button, Grid, List, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Room, RoomInvoiceStatus, RoomUtilityReadingStatus } from './roomTypes'

interface RoomsTableProps {
  loading: boolean
  data: Room[]
  onView: (room: Room) => void
  onEdit: (room: Room) => void
  onDelete: (room: Room) => void
}

const statusColors: Record<Room['status'], string> = {
  ACTIVE: 'green',
  MAINTENANCE: 'orange',
  INACTIVE: 'default',
}

const invoiceStatusColors: Record<RoomInvoiceStatus, string> = {
  DRAFT: 'default',
  ISSUED: 'processing',
  PAID: 'green',
  VOID: 'red',
  OVERDUE: 'orange',
}

const readingStatusColors: Record<RoomUtilityReadingStatus, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  APPROVED: 'green',
  REJECTED: 'red',
  INVOICED: 'purple',
}

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
const formatMonth = (value?: string | null) => (value ? value.slice(0, 7) : '-')

function InvoiceTag({ room }: { room: Room }) {
  if (!room.latest_invoice_status) {
    return <Tag>NO_INVOICE</Tag>
  }

  return (
    <Space size={4} wrap>
      <Tag color={invoiceStatusColors[room.latest_invoice_status]}>{room.latest_invoice_status}</Tag>
      <Typography.Text type="secondary">{formatMonth(room.latest_invoice_month)}</Typography.Text>
    </Space>
  )
}

function ReadingTag({ room }: { room: Room }) {
  if (!room.latest_reading_status) {
    return <Tag>NO_READING</Tag>
  }

  return (
    <Space size={4} wrap>
      <Tag color={readingStatusColors[room.latest_reading_status]}>{room.latest_reading_status}</Tag>
      <Typography.Text type="secondary">{formatMonth(room.latest_reading_month)}</Typography.Text>
    </Space>
  )
}

function RoomActions({ room, onView, onEdit, onDelete }: Pick<RoomsTableProps, 'onView' | 'onEdit' | 'onDelete'> & { room: Room }) {
  return (
    <Space wrap size={4}>
      <Tooltip title="View room">
        <Button aria-label={`View room ${room.code}`} icon={<EyeOutlined />} onClick={() => onView(room)} />
      </Tooltip>
      <Tooltip title="Edit room">
        <Button aria-label={`Edit room ${room.code}`} icon={<EditOutlined />} onClick={() => onEdit(room)} />
      </Tooltip>
      <Tooltip title="Delete room">
        <Button aria-label={`Delete room ${room.code}`} icon={<DeleteOutlined />} danger onClick={() => onDelete(room)} />
      </Tooltip>
    </Space>
  )
}

export function RoomsTable({ loading, data, onView, onEdit, onDelete }: RoomsTableProps) {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const columns: ColumnsType<Room> = [
    {
      title: 'Room Code',
      dataIndex: 'code',
      width: 140,
      fixed: 'left',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 140,
      render: (status: Room['status']) => <Tag color={statusColors[status]}>{status}</Tag>,
    },
    {
      title: 'Price',
      dataIndex: 'base_rent',
      width: 150,
      align: 'right',
      render: (value: number) => currency.format(value),
    },
    {
      title: 'Occupancy',
      width: 120,
      render: (_value, record) => `${record.occupants_count ?? 0}/${record.max_occupants}`,
    },
    {
      title: 'Latest invoice',
      width: 220,
      render: (_value, record) => <InvoiceTag room={record} />,
    },
    {
      title: 'Latest reading',
      width: 220,
      render: (_value, record) => <ReadingTag room={record} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_value, record) => <RoomActions room={record} onView={onView} onEdit={onEdit} onDelete={onDelete} />,
    },
  ]

  if (isMobile) {
    return (
      <List
        loading={loading}
        dataSource={data}
        pagination={{ pageSize: 6 }}
        locale={{ emptyText: 'No rooms found' }}
        renderItem={(room) => (
          <List.Item className="rooms-mobile-list-item">
            <div className="rooms-mobile-card">
              <div className="rooms-mobile-card__header">
                <Space direction="vertical" size={2}>
                  <Typography.Text strong>Room {room.code}</Typography.Text>
                  <Typography.Text type="secondary">
                    {currency.format(room.base_rent)} - {room.occupants_count ?? 0}/{room.max_occupants} occupants
                  </Typography.Text>
                </Space>
                <Tag color={statusColors[room.status]}>{room.status}</Tag>
              </div>
              <div className="rooms-mobile-card__meta">
                <Typography.Text type="secondary">Invoice</Typography.Text>
                <InvoiceTag room={room} />
                <Typography.Text type="secondary">Reading</Typography.Text>
                <ReadingTag room={room} />
              </div>
              <div className="rooms-mobile-card__actions">
                <RoomActions room={room} onView={onView} onEdit={onEdit} onDelete={onDelete} />
              </div>
            </div>
          </List.Item>
        )}
      />
    )
  }

  return <Table rowKey="id" loading={loading} dataSource={data} columns={columns} scroll={{ x: 1120 }} pagination={{ pageSize: 6 }} />
}
