import { DeleteOutlined, EditOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { Button, Descriptions, Empty, Grid, Modal, Skeleton, Space, Table, Tabs, Tag, Timeline, Typography } from 'antd'
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

  if (!item && !loading) {
    return <Empty description="Select an item from the list to see details" style={{ marginTop: 90 }} />
  }

  if (loading || !item) {
    return <Skeleton active paragraph={{ rows: 10 }} />
  }

  return (
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
          <Button
            size={isMobile ? 'large' : 'middle'}
            danger
            icon={<DeleteOutlined />}
            onClick={() =>
              Modal.confirm({
                title: 'Delete this building?',
                icon: <ExclamationCircleOutlined />,
                content: 'This action cannot be undone.',
                okText: 'Delete',
                okButtonProps: { danger: true },
                onOk: () => onDelete(item.id),
              })
            }
          >
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
              <Table
                pagination={false}
                rowKey="key"
                scroll={{ x: 640 }}
                columns={[
                  { title: 'Unit', dataIndex: 'unit' },
                  { title: 'Tenant', dataIndex: 'tenant' },
                  { title: 'Amount', dataIndex: 'amount' },
                ]}
                dataSource={[
                  { key: '1', unit: 'A-101', tenant: 'Nguyen Van A', amount: '$420' },
                  { key: '2', unit: 'B-203', tenant: 'Tran Thi B', amount: '$510' },
                ]}
              />
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
    </Space>
  )
}
