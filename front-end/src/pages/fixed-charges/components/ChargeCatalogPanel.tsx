import { Button, Card, Empty, Skeleton, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { ChargeCatalog } from '../types'

interface Props {
  loading: boolean
  error: string | null
  items: ChargeCatalog[]
  columns: ColumnsType<ChargeCatalog>
  onRetry: () => void
}

export function ChargeCatalogPanel({ loading, error, items, columns, onRetry }: Props) {
  return (
    <Card>
      {loading ? <Skeleton active paragraph={{ rows: 6 }} /> : error ? (
        <Empty description={error}><Button onClick={onRetry}>Retry</Button></Empty>
      ) : <Table<ChargeCatalog> rowKey="id" columns={columns} dataSource={items} scroll={{ x: 1000 }} />}
    </Card>
  )
}
