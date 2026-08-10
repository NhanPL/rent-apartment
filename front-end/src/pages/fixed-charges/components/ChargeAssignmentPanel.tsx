import type { ReactNode } from 'react'
import { Card, Space, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'

interface Props<T extends object> {
  filters: ReactNode
  loading: boolean
  items: T[]
  columns: ColumnsType<T>
  scrollWidth: number
}

export function ChargeAssignmentPanel<T extends { id: string }>({ filters, loading, items, columns, scrollWidth }: Props<T>) {
  return (
    <Card>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {filters}
        <Table<T> rowKey="id" columns={columns} dataSource={items} loading={loading} scroll={{ x: scrollWidth }} />
      </Space>
    </Card>
  )
}
