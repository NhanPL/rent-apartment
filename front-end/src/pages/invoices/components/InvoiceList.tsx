import { Button, Empty, Skeleton, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { InvoiceListItem } from '../types'

interface Props {
  loading: boolean
  error: string | null
  items: InvoiceListItem[]
  columns: ColumnsType<InvoiceListItem>
  page: number
  pageSize: number
  total: number
  onRetry: () => void
  onPageChange: (page: number, pageSize: number) => void
}

export function InvoiceList({ loading, error, items, columns, page, pageSize, total, onRetry, onPageChange }: Props) {
  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />
  if (error) return <Empty description={error}><Button onClick={onRetry}>Retry</Button></Empty>

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={items}
      scroll={{ x: 1950 }}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        pageSizeOptions: [10, 20, 50, 100],
        showTotal: (value) => `${value} invoices`,
        onChange: onPageChange,
      }}
      locale={{ emptyText: <Empty description="No invoices found" /> }}
    />
  )
}
