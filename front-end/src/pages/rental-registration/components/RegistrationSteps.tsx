import type { ReactNode } from 'react'
import { Button, Empty, Space, Steps, Table, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { ContractListItem } from '../../contracts/types'

export function ReserveRegistrationStep({ compact, roomSelected, children }: { compact: boolean; roomSelected: boolean; children: ReactNode }) {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Steps size={compact ? 'small' : 'default'} direction={compact ? 'vertical' : 'horizontal'} items={[
        { title: 'Available room', status: roomSelected ? 'finish' : 'process' },
        { title: 'Tenant', status: roomSelected ? 'process' : 'wait' },
        { title: 'Reserve room', status: 'wait' },
      ]} />
      {children}
    </Space>
  )
}

interface QueueProps {
  title: string
  description: string
  emptyText: string
  loading: boolean
  items: ContractListItem[]
  columns: ColumnsType<ContractListItem>
  onReload: () => void
}

export function RegistrationQueueStep(props: QueueProps) {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="registration-toolbar">
        <div><Typography.Title level={5} style={{ margin: 0 }}>{props.title}</Typography.Title><Typography.Text type="secondary">{props.description}</Typography.Text></div>
        <Button icon={<ReloadOutlined />} loading={props.loading} onClick={props.onReload}>Reload</Button>
      </div>
      <Table<ContractListItem> rowKey="id" loading={props.loading} columns={props.columns} dataSource={props.items} pagination={{ pageSize: 10 }} scroll={{ x: 820 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={props.emptyText} /> }} />
    </Space>
  )
}
