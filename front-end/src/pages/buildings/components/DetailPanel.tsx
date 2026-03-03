import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Descriptions, Empty, Grid, Input, Modal, Select, Skeleton, Space, Tabs, Tag, Timeline, Typography, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { createRoom, deleteRoom, listRoomsByBuildingId, listTenantsByRoomId, updateRoom } from './roomService'
import { RoomsTable } from './RoomsTable'
import { RoomsUpsertDrawer } from './RoomsUpsertDrawer'
import type { Room } from './roomTypes'
import type { BuildingEntity } from './types'

interface DetailPanelProps {
  loading: boolean
  item: BuildingEntity | null
  onEdit: (item: BuildingEntity) => void
  onDelete: (id: string) => void
}

const statusColor: Record<BuildingEntity['status'], string> = {
  active: 'green',
  inactive: 'default',
}

export function DetailPanel({ loading, item, onEdit, onDelete }: DetailPanelProps) {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const isTablet = Boolean(screens.md) && !screens.lg

  const [roomsLoading, setRoomsLoading] = useState(false)
  const [roomsData, setRoomsData] = useState<Room[]>([])
  const [roomsSearchInput, setRoomsSearchInput] = useState('')
  const [roomsSearch, setRoomsSearch] = useState('')
  const [roomsFilter, setRoomsFilter] = useState<Room['status'] | 'ALL'>('ALL')
  const [tenantCountByRoomId, setTenantCountByRoomId] = useState<Record<string, number>>({})

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create')
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [savingRoom, setSavingRoom] = useState(false)

  const [deleteBuildingModalOpen, setDeleteBuildingModalOpen] = useState(false)
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setRoomsSearch(roomsSearchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [roomsSearchInput])

  const loadRooms = async (buildingId: string) => {
    setRoomsLoading(true)
    try {
      const rooms = await listRoomsByBuildingId({ building_id: buildingId, search: roomsSearch, status: roomsFilter })
      setRoomsData(rooms)
      const entries = await Promise.all(
        rooms.map(async (room) => {
          const tenants = await listTenantsByRoomId(room.id)
          return [room.id, tenants.length] as const
        }),
      )
      setTenantCountByRoomId(Object.fromEntries(entries))
    } finally {
      setRoomsLoading(false)
    }
  }

  useEffect(() => {
    if (!item) {
      setRoomsData([])
      setRoomsSearchInput('')
      setRoomsSearch('')
      setRoomsFilter('ALL')
      setEditingRoom(null)
      setRoomToDelete(null)
      setDeleteBuildingModalOpen(false)
      return
    }
    void loadRooms(item.id)
  }, [item?.id, roomsSearch, roomsFilter])

  if (!item && !loading) {
    return <Empty description="Select an item from the list to see details" style={{ marginTop: 90 }} />
  }

  if (loading || !item) {
    return <Skeleton active paragraph={{ rows: 10 }} />
  }

  const existingRoomCodes = roomsData
    .filter((room) => (drawerMode === 'edit' && editingRoom ? room.id !== editingRoom.id : true))
    .map((room) => room.code)

  return (
    <>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Typography.Title level={isMobile ? 5 : isTablet ? 4 : 3} style={{ margin: 0 }}>
              {item.name}
            </Typography.Title>
            <Tag color={statusColor[item.status]}>{item.status.toUpperCase()}</Tag>
          </Space>
          <Space wrap>
            <Button size={isMobile ? 'large' : 'middle'} icon={<EditOutlined />} onClick={() => onEdit(item)}>
              Edit
            </Button>
            <Button size={isMobile ? 'large' : 'middle'} danger icon={<DeleteOutlined />} onClick={() => setDeleteBuildingModalOpen(true)}>
              Delete
            </Button>
          </Space>
        </Space>

        <Tabs
          defaultActiveKey="overview"
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <Descriptions bordered column={isMobile ? 1 : 2}>
                  <Descriptions.Item label="Code">{item.code}</Descriptions.Item>
                  <Descriptions.Item label="Status">{item.status}</Descriptions.Item>
                  <Descriptions.Item label="Manager">{item.manager}</Descriptions.Item>
                  <Descriptions.Item label="Units">{item.units}</Descriptions.Item>
                  <Descriptions.Item label="Address" span={isMobile ? 1 : 2}>
                    {item.address}
                  </Descriptions.Item>
                  <Descriptions.Item label="Note" span={isMobile ? 1 : 2}>
                    {item.note || '-'}
                  </Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'related',
              label: 'Related',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    Rooms in this building
                  </Typography.Title>
                  <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space wrap>
                      <Input.Search
                        value={roomsSearchInput}
                        placeholder="Search room code"
                        allowClear
                        onChange={(event) => setRoomsSearchInput(event.target.value)}
                        style={{ width: isMobile ? '100%' : 260 }}
                      />
                      <Select
                        value={roomsFilter}
                        onChange={setRoomsFilter}
                        style={{ width: 180 }}
                        options={[
                          { label: 'All statuses', value: 'ALL' },
                          { label: 'Active', value: 'ACTIVE' },
                          { label: 'Maintenance', value: 'MAINTENANCE' },
                          { label: 'Inactive', value: 'INACTIVE' },
                        ]}
                      />
                    </Space>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setDrawerMode('create')
                        setEditingRoom(null)
                        setDrawerOpen(true)
                      }}
                    >
                      Add Room
                    </Button>
                  </Space>

                  <RoomsTable
                    loading={roomsLoading}
                    data={roomsData}
                    tenantCountByRoomId={tenantCountByRoomId}
                    onView={(room) => {
                      window.history.pushState(null, '', `/rooms/${room.id}?buildingId=${item.id}`)
                      window.dispatchEvent(new PopStateEvent('popstate'))
                    }}
                    onEdit={(room) => {
                      setDrawerMode('edit')
                      setEditingRoom(room)
                      setDrawerOpen(true)
                    }}
                    onDelete={(room) => {
                      setRoomToDelete(room)
                    }}
                  />
                </Space>
              ),
            },
            {
              key: 'history',
              label: 'History',
              children: (
                <Timeline
                  items={[
                    { children: `${item.name} updated by admin` },
                    { children: `${item.name} synced with billing` },
                    { children: `${item.name} was created` },
                  ]}
                />
              ),
            },
          ]}
        />

        <RoomsUpsertDrawer
          open={drawerOpen}
          mode={drawerMode}
          room={editingRoom}
          building_id={item.id}
          existingCodes={existingRoomCodes}
          loading={savingRoom}
          onClose={() => setDrawerOpen(false)}
          onSubmit={async (payload) => {
            setSavingRoom(true)
            try {
              if (drawerMode === 'create') {
                await createRoom(payload)
                message.success('Room created successfully')
              } else if (editingRoom) {
                await updateRoom(editingRoom.id, payload)
                message.success('Room updated successfully')
              }
              await loadRooms(item.id)
            } finally {
              setSavingRoom(false)
            }
          }}
        />
      </Space>

      <Modal
        open={deleteBuildingModalOpen}
        title="Delete this building?"
        onCancel={() => setDeleteBuildingModalOpen(false)}
        onOk={() => {
          onDelete(item.id)
          setDeleteBuildingModalOpen(false)
        }}
        okText="Delete"
        okButtonProps={{ danger: true }}
        cancelText="Cancel"
        maskClosable
      >
        This action cannot be undone.
      </Modal>

      <Modal
        open={Boolean(roomToDelete)}
        title={roomToDelete ? `Delete room ${roomToDelete.code}?` : 'Delete room'}
        onCancel={() => setRoomToDelete(null)}
        onOk={async () => {
          if (!roomToDelete) return
          const id = roomToDelete.id
          setRoomToDelete(null)
          await deleteRoom(id)
          await loadRooms(item.id)
          message.success('Room deleted successfully')
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
