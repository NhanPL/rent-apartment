import { DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons'
import { Button, Popconfirm, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Room } from './roomTypes'

interface RoomsTableProps {
  loading: boolean
  data: Room[]
  tenantCountByRoomId: Record<string, number>
  onView: (room: Room) => void
  onEdit: (room: Room) => void
  onDelete: (room: Room) => void
}

const statusColors: Record<Room['status'], string> = {
  ACTIVE: 'green',
  MAINTENANCE: 'orange',
  INACTIVE: 'default',
}

export function RoomsTable({ loading, data, tenantCountByRoomId, onView, onEdit, onDelete }: RoomsTableProps) {
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
      width: 120,
      render: (value: number) => `$${value.toFixed(0)}`,
    },
    {
      title: 'Tenants',
      width: 120,
      render: (_value, record) => tenantCountByRoomId[record.id] ?? 0,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_value, record) => (
        <Space wrap>
          <Button icon={<EyeOutlined />} onClick={() => onView(record)}>
            View
          </Button>
          <Button icon={<EditOutlined />} onClick={() => onEdit(record)}>
            Edit
          </Button>
          <Popconfirm title="Delete this room?" description="This action cannot be undone." okButtonProps={{ danger: true }} onConfirm={() => onDelete(record)}>
            <Button icon={<DeleteOutlined />} danger>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return <Table rowKey="id" loading={loading} dataSource={data} columns={columns} scroll={{ x: 860 }} pagination={{ pageSize: 6 }} />
}
