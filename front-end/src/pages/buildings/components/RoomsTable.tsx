import { useI18n } from '../../../i18n'
import { DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons'
import { Button, Grid, List, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Room, RoomInvoiceStatus, RoomUtilityReadingStatus } from './roomTypes'
import { vndCurrency } from '../../../i18n'

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
  PARTIALLY_PAID: 'gold',
  PAID: 'green',
  VOID: 'red',
}

const readingStatusColors: Record<RoomUtilityReadingStatus, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  APPROVED: 'green',
  REJECTED: 'red',
  INVOICED: 'purple',
}

const currency = vndCurrency
const formatMonth = (value?: string | null) => (value ? value.slice(0, 7) : '-')

function InvoiceTag({ room }: { room: Room }) {
  const { t } = useI18n()
  if (!room.latest_invoice_status) {
    return <><Tag>{t("NO_INVOICE")}</Tag></>
  }

  return (
    <>
    <Space size={4} wrap>
      <Tag color={invoiceStatusColors[room.latest_invoice_status]}>{room.latest_invoice_status}</Tag>
      <Typography.Text type="secondary">{formatMonth(room.latest_invoice_month)}</Typography.Text>
    </Space>
    </>
  )
}

function ReadingTag({ room }: { room: Room }) {
  const { t } = useI18n()
  if (!room.latest_reading_status) {
    return <><Tag>{t("NO_READING")}</Tag></>
  }

  return (
    <>
    <Space size={4} wrap>
      <Tag color={readingStatusColors[room.latest_reading_status]}>{room.latest_reading_status}</Tag>
      <Typography.Text type="secondary">{formatMonth(room.latest_reading_month)}</Typography.Text>
    </Space>
    </>
  )
}

function RoomActions({ room, onView, onEdit, onDelete }: Pick<RoomsTableProps, 'onView' | 'onEdit' | 'onDelete'> & { room: Room }) {
  const { t } = useI18n()
  return (
    <>
    <Space wrap size={4}>
      <Tooltip title={t("View room")}>
        <Button aria-label={`View room ${room.code}`} icon={<EyeOutlined />} onClick={() => onView(room)} />
      </Tooltip>
      <Tooltip title={t("Edit room")}>
        <Button aria-label={`Edit room ${room.code}`} icon={<EditOutlined />} onClick={() => onEdit(room)} />
      </Tooltip>
      <Tooltip title={t("Delete room")}>
        <Button aria-label={`Delete room ${room.code}`} icon={<DeleteOutlined />} danger onClick={() => onDelete(room)} />
      </Tooltip>
    </Space>
    </>
  )
}

export function RoomsTable({ loading, data, onView, onEdit, onDelete }: RoomsTableProps) {
  const { t } = useI18n()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const columns: ColumnsType<Room> = [
    {
      title: t("Room Code"),
      dataIndex: 'code',
      width: 140,
      fixed: 'left',
    },
    {
      title: t("Status"),
      dataIndex: 'status',
      width: 140,
      render: (status: Room['status']) => <Tag color={statusColors[status]}>{status}</Tag>,
    },
    {
      title: t("Price"),
      dataIndex: 'base_rent',
      width: 150,
      align: 'right',
      render: (value: number) => currency.format(value),
    },
    {
      title: t("Occupancy"),
      width: 120,
      render: (_value, record) => `${record.occupants_count ?? 0}/${record.max_occupants}`,
    },
    {
      title: t("Latest invoice"),
      width: 220,
      render: (_value, record) => <InvoiceTag room={record} />,
    },
    {
      title: t("Latest reading"),
      width: 220,
      render: (_value, record) => <ReadingTag room={record} />,
    },
    {
      title: t("Actions"),
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_value, record) => <RoomActions room={record} onView={onView} onEdit={onEdit} onDelete={onDelete} />,
    },
  ]

  if (isMobile) {
    return (
      <>
      <List
        loading={loading}
        dataSource={data}
        pagination={{ pageSize: 6 }}
        locale={{ emptyText: t("No rooms found") }}
        renderItem={(room) => (
          <List.Item className="rooms-mobile-list-item">
            <div className="rooms-mobile-card">
              <div className="rooms-mobile-card__header">
                <Space direction="vertical" size={2}>
                  <Typography.Text strong>{t("Room")} {room.code}</Typography.Text>
                  <Typography.Text type="secondary">
                    {currency.format(room.base_rent)} {t("-")} {room.occupants_count ?? 0}{t("/")}{room.max_occupants} {t("occupants")}
                  </Typography.Text>
                </Space>
                <Tag color={statusColors[room.status]}>{room.status}</Tag>
              </div>
              <div className="rooms-mobile-card__meta">
                <Typography.Text type="secondary">{t("Invoice")}</Typography.Text>
                <InvoiceTag room={room} />
                <Typography.Text type="secondary">{t("Reading")}</Typography.Text>
                <ReadingTag room={room} />
              </div>
              <div className="rooms-mobile-card__actions">
                <RoomActions room={room} onView={onView} onEdit={onEdit} onDelete={onDelete} />
              </div>
            </div>
          </List.Item>
        )}
      />
      </>
    )
  }

  return <><Table rowKey="id" loading={loading} dataSource={data} columns={columns} scroll={{ x: 1120 }} pagination={{ pageSize: 6 }} /></>
}
