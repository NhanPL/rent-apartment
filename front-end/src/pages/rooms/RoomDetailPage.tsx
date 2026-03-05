import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Descriptions, Empty, Grid, Modal, Skeleton, Space, Table, Tag, Typography, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import {
  createMonthlyBill,
  deleteMonthlyBill,
  deleteRoom,
  getRoomDetail,
  listMonthlyBillsByRoomId,
  listTenantsByRoomId,
  updateMonthlyBill,
  updateRoom,
} from '../buildings/components/roomService'
import { RoomsUpsertDrawer } from '../buildings/components/RoomsUpsertDrawer'
import type { MonthlyBill, Room, TenantSummary } from '../buildings/components/roomTypes'
import type { BuildingEntity } from '../buildings/components/types'
import { BillUpsertDrawer } from './components/BillUpsertDrawer'

interface RoomDetailPageProps {
  roomId: string
  buildings: BuildingEntity[]
}

const roomStatusColor = {
  ACTIVE: 'green',
  MAINTENANCE: 'orange',
  INACTIVE: 'default',
}

const billStatusColor: Record<MonthlyBill['invoice_status'], string> = {
  DRAFT: 'default',
  ISSUED: 'processing',
  PAID: 'green',
  VOID: 'red',
  OVERDUE: 'orange',
}

export function RoomDetailPage({ roomId, buildings }: RoomDetailPageProps) {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const [loading, setLoading] = useState(true)
  const [roomSaving, setRoomSaving] = useState(false)
  const [room, setRoom] = useState<(Room & { building_name: string }) | null>(null)
  const [tenants, setTenants] = useState<TenantSummary[]>([])
  const [bills, setBills] = useState<MonthlyBill[]>([])

  const [roomDrawerOpen, setRoomDrawerOpen] = useState(false)
  const [billDrawerOpen, setBillDrawerOpen] = useState(false)
  const [billDrawerMode, setBillDrawerMode] = useState<'create' | 'edit'>('create')
  const [editingBill, setEditingBill] = useState<MonthlyBill | null>(null)
  const [savingBill, setSavingBill] = useState(false)

  const [deleteRoomModalOpen, setDeleteRoomModalOpen] = useState(false)
  const [billToDelete, setBillToDelete] = useState<MonthlyBill | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const roomData = await getRoomDetail(roomId, buildings)
      const tenantsData = await listTenantsByRoomId(roomId)
      const billsData = await listMonthlyBillsByRoomId(roomId)
      setRoom(roomData)
      setTenants(tenantsData)
      setBills(billsData)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [roomId])

  const query = useMemo(() => new URLSearchParams(window.location.search), [])
  const buildingId = query.get('buildingId')

  if (loading) {
    return <Skeleton active paragraph={{ rows: 12 }} />
  }

  if (!room) {
    return <Empty description="Room not found" />
  }

  return (
    <>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => {
            const destination = buildingId ? `/buildings?buildingId=${buildingId}` : '/buildings'
            window.history.pushState(null, '', destination)
            window.dispatchEvent(new PopStateEvent('popstate'))
          }}
        >
          Back to Buildings
        </Button>

        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space direction="vertical" size={4}>
            <Typography.Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
              Room {room.code}
            </Typography.Title>
            <Typography.Text type="secondary">Building: {room.building_name}</Typography.Text>
          </Space>
          <Space wrap>
            <Tag color={roomStatusColor[room.status]}>{room.status}</Tag>
            <Button icon={<EditOutlined />} onClick={() => setRoomDrawerOpen(true)}>
              Edit Room
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={() => setDeleteRoomModalOpen(true)}>
              Delete Room
            </Button>
          </Space>
        </Space>

        <Card title="Room information">
          <Descriptions bordered column={isMobile ? 1 : 2}>
            <Descriptions.Item label="Code">{room.code}</Descriptions.Item>
            <Descriptions.Item label="Status">{room.status}</Descriptions.Item>
            <Descriptions.Item label="Price">${room.base_rent.toFixed(0)}</Descriptions.Item>
            <Descriptions.Item label="Floor">{room.floor ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Area (m²)">{room.area_m2 ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Max occupants">{room.max_occupants}</Descriptions.Item>
            <Descriptions.Item label="Notes" span={isMobile ? 1 : 2}>
              {room.note ?? '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="Current tenants">
          <Table<TenantSummary>
            rowKey="id"
            dataSource={tenants}
            locale={{ emptyText: 'No current tenants in this room' }}
            scroll={{ x: 760 }}
            pagination={false}
            columns={[
              { title: 'Tenant name', dataIndex: 'full_name' },
              { title: 'Contact', render: (_, record) => record.email ?? record.phone },
              { title: 'Contract start', dataIndex: 'contract_start_date' },
              {
                title: 'Status',
                dataIndex: 'status',
                render: (value: TenantSummary['status']) => <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value}</Tag>,
              },
            ]}
          />
        </Card>

        <Card
          title="Monthly bills"
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setBillDrawerMode('create')
                setEditingBill(null)
                setBillDrawerOpen(true)
              }}
            >
              Add Bill
            </Button>
          }
        >
          <Table<MonthlyBill>
            rowKey="id"
            dataSource={bills}
            scroll={{ x: 980 }}
            columns={[
              { title: 'Month', dataIndex: 'month', render: (value: string) => value.slice(0, 7) },
              { title: 'Electric old/new', render: (_, record) => `${record.electricity_prev ?? '-'} / ${record.electricity_curr ?? '-'}` },
              { title: 'Water old/new', render: (_, record) => `${record.water_prev ?? '-'} / ${record.water_curr ?? '-'}` },
              { title: 'Total', dataIndex: 'total_bill_amount', render: (value: number) => `$${value.toFixed(2)}` },
              {
                title: 'Status',
                dataIndex: 'invoice_status',
                render: (value: MonthlyBill['invoice_status']) => <Tag color={billStatusColor[value]}>{value}</Tag>,
              },
              {
                title: 'Actions',
                render: (_, record) => (
                  <Space>
                    <Button
                      onClick={() => {
                        setBillDrawerMode('edit')
                        setEditingBill(record)
                        setBillDrawerOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                    <Button danger onClick={() => setBillToDelete(record)}>
                      Delete
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Card>

        <RoomsUpsertDrawer
          open={roomDrawerOpen}
          mode="edit"
          room={room}
          building_id={room.building_id}
          existingCodes={[]}
          loading={roomSaving}
          onClose={() => setRoomDrawerOpen(false)}
          onSubmit={async (payload) => {
            setRoomSaving(true)
            try {
              await updateRoom(room.id, payload)
              await refresh()
              message.success('Room updated successfully')
            } finally {
              setRoomSaving(false)
            }
          }}
        />

        <BillUpsertDrawer
          open={billDrawerOpen}
          mode={billDrawerMode}
          room_id={room.id}
          bill={editingBill}
          loading={savingBill}
          onClose={() => setBillDrawerOpen(false)}
          onSubmit={async (payload) => {
            setSavingBill(true)
            try {
              if (billDrawerMode === 'create') {
                await createMonthlyBill(payload)
                message.success('Bill added successfully')
              } else if (editingBill) {
                await updateMonthlyBill(editingBill.id, payload)
                message.success('Bill updated successfully')
              }
              await refresh()
            } finally {
              setSavingBill(false)
            }
          }}
        />
      </Space>

      <Modal
        open={deleteRoomModalOpen}
        title="Delete this room?"
        onCancel={() => setDeleteRoomModalOpen(false)}
        onOk={async () => {
          await deleteRoom(room.id)
          message.success('Room deleted successfully')
          setDeleteRoomModalOpen(false)
          const destination = buildingId ? `/buildings?buildingId=${buildingId}` : '/buildings'
          window.history.pushState(null, '', destination)
          window.dispatchEvent(new PopStateEvent('popstate'))
        }}
        okText="Delete"
        okButtonProps={{ danger: true }}
        cancelText="Cancel"
        maskClosable
      >
        This action cannot be undone.
      </Modal>

      <Modal
        open={Boolean(billToDelete)}
        title="Delete this bill entry?"
        onCancel={() => setBillToDelete(null)}
        onOk={async () => {
          if (!billToDelete) return
          const id = billToDelete.id
          setBillToDelete(null)
          await deleteMonthlyBill(id)
          await refresh()
          message.success('Bill deleted successfully')
        }}
        okText="Delete"
        okButtonProps={{ danger: true }}
        cancelText="Cancel"
        maskClosable
      >
        This action cannot be undone.
      </Modal>
    </>
  )
}
