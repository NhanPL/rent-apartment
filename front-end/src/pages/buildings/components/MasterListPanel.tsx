import { BankOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Empty, Input, List, Select, Skeleton, Space, Tag, Typography } from 'antd'
import type { ChangeEvent } from 'react'
import type { BuildingEntity, StatusFilter } from './types'

interface MasterListPanelProps {
  loading: boolean
  items: BuildingEntity[]
  selectedId?: string
  searchValue: string
  statusFilter: StatusFilter
  onSearchChange: (value: string) => void
  onStatusFilterChange: (value: StatusFilter) => void
  onSelect: (id: string) => void
  onAdd: () => void
}

const statusColor: Record<BuildingEntity['status'], string> = {
  active: 'green',
  inactive: 'default',
}

export function MasterListPanel({
  loading,
  items,
  selectedId,
  searchValue,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onSelect,
  onAdd,
}: MasterListPanelProps) {
  return (
    <div>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Buildings
        </Typography.Title>
        <Typography.Text type="secondary">Manage all buildings in one place.</Typography.Text>
        <Input.Search placeholder="Search by code or name" value={searchValue} onChange={(event: ChangeEvent<HTMLInputElement>) => onSearchChange(event.target.value)} />
        <Select
          value={statusFilter}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Active', value: 'active' },
            { label: 'Inactive', value: 'inactive' },
          ]}
          onChange={onStatusFilterChange}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
          Add
        </Button>
      </Space>

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Skeleton active paragraph={{ rows: 1 }} title={false} />
            <Skeleton active paragraph={{ rows: 1 }} title={false} />
            <Skeleton active paragraph={{ rows: 1 }} title={false} />
          </Space>
        ) : items.length === 0 ? (
          <Empty description="No buildings found" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Button type="primary" onClick={onAdd}>
              Add Building
            </Button>
          </Empty>
        ) : (
          <List<BuildingEntity>
            itemLayout="horizontal"
            dataSource={items}
            renderItem={(item) => (
              <List.Item
                style={{
                  borderRadius: 10,
                  padding: 12,
                  cursor: 'pointer',
                  background: item.id === selectedId ? '#e6f4ff' : '#fff',
                  border: '1px solid #f0f0f0',
                  marginBottom: 8,
                }}
                onClick={() => onSelect(item.id)}
              >
                <List.Item.Meta
                  avatar={<BankOutlined style={{ fontSize: 18, marginTop: 4 }} />}
                  title={<Typography.Text strong>{item.name}</Typography.Text>}
                  description={`${item.code} • ${item.address}`}
                />
                <Tag color={statusColor[item.status]}>{item.status.toUpperCase()}</Tag>
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  )
}
