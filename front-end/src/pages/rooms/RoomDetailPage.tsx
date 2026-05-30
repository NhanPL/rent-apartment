import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons'
import { Button, Card, Descriptions, Empty, Grid, Modal, Skeleton, Space, Table, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteRoom,
  getRoomDetail,
  listMonthlyBillsByRoomId,
  listTenantsByRoomId,
  updateRoom,
} from '../buildings/components/roomService'
import { RoomsUpsertDrawer } from '../buildings/components/RoomsUpsertDrawer'
import type { MonthlyBill, Room, TenantSummary } from '../buildings/components/roomTypes'

interface RoomDetailPageProps {
  roomId: string
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

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

export function RoomDetailPage({ roomId }: RoomDetailPageProps) {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const [loading, setLoading] = useState(true)
  const [roomSaving, setRoomSaving] = useState(false)
  const [room, setRoom] = useState<(Room & { building_name: string }) | null>(null)
  const [tenants, setTenants] = useState<TenantSummary[]>([])
  const [bills, setBills] = useState<MonthlyBill[]>([])

  const [roomDrawerOpen, setRoomDrawerOpen] = useState(false)

  const [deleteRoomModalOpen, setDeleteRoomModalOpen] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [roomData, tenantsData, billsData] = await Promise.all([
        getRoomDetail(roomId),
        listTenantsByRoomId(roomId),
        listMonthlyBillsByRoomId(roomId),
      ])
      setRoom(roomData)
      setTenants(tenantsData)
      setBills(billsData)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to load room detail')
      setRoom(null)
      setTenants([])
      setBills([])
    } finally {
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const query = useMemo(() => new URLSearchParams(window.location.search), [])
  const buildingId = query.get('buildingId')

  const openInvoiceDetail = useCallback((invoiceId: string) => {
    window.history.pushState(null, '', `/invoices?invoiceId=${encodeURIComponent(invoiceId)}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])

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
            <Descriptions.Item label="Price">{currency.format(room.base_rent)}</Descriptions.Item>
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

        <Card title="Invoices">
          <Table<MonthlyBill>
            rowKey="id"
            dataSource={bills}
            scroll={{ x: 1480 }}
            columns={[
              { title: 'Month', dataIndex: 'month', render: (value: string) => value.slice(0, 7) },
              { title: 'Rent', dataIndex: 'rent_amount', align: 'right', render: (value: number) => currency.format(value) },
              { title: 'Electric old/new', render: (_, record) => `${record.electricity_prev} / ${record.electricity_curr}` },
              { title: 'Electric amount', dataIndex: 'electric_amount', align: 'right', render: (value: number) => currency.format(value) },
              { title: 'Water old/new', render: (_, record) => `${record.water_prev} / ${record.water_curr}` },
              { title: 'Water amount', dataIndex: 'water_amount', align: 'right', render: (value: number) => currency.format(value) },
              { title: 'Other fees', dataIndex: 'other_fees', align: 'right', render: (value: number) => currency.format(value) },
              { title: 'Total', dataIndex: 'total_bill_amount', align: 'right', render: (value: number) => currency.format(value) },
              {
                title: 'Status',
                dataIndex: 'invoice_status',
                render: (value: MonthlyBill['invoice_status']) => <Tag color={billStatusColor[value]}>{value}</Tag>,
              },
              {
                title: 'Actions',
                fixed: 'right',
                width: 90,
                render: (_, record) => (
                  <Button size="small" icon={<EyeOutlined />} onClick={() => openInvoiceDetail(record.id)} />
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
            } catch (error) {
              message.error(error instanceof Error ? error.message : 'Unable to update room')
              throw error
            } finally {
              setRoomSaving(false)
            }
          }}
        />
      </Space>

      <Modal
        open={deleteRoomModalOpen}
        title="Delete this room?"
        onCancel={() => setDeleteRoomModalOpen(false)}
        onOk={async () => {
          try {
            await deleteRoom(room.id)
            message.success('Room deleted successfully')
            setDeleteRoomModalOpen(false)
            const destination = buildingId ? `/buildings?buildingId=${buildingId}` : '/buildings'
            window.history.pushState(null, '', destination)
            window.dispatchEvent(new PopStateEvent('popstate'))
          } catch (error) {
            message.error(error instanceof Error ? error.message : 'Unable to delete room')
          }
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
