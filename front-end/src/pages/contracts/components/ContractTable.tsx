import { Button, Empty, Skeleton, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { ContractListItem } from '../types'

interface Props {
  loading: boolean
  error: string | null
  items: ContractListItem[]
  columns: ColumnsType<ContractListItem>
  page: number
  pageSize: number
  total: number
  onRetry: () => void
  onCreate: () => void
  onPageChange: (page: number, pageSize: number) => void
}

export function ContractTable(props: Props) {
  if (props.loading) return <Skeleton active paragraph={{ rows: 6 }} />
  if (props.error) return <Empty description={props.error}><Button type="primary" onClick={props.onRetry}>Retry</Button></Empty>
  if (props.items.length === 0) return <Empty description="No contracts found"><Button type="primary" onClick={props.onCreate}>New Contract</Button></Empty>
  return (
    <Table<ContractListItem>
      rowKey="id"
      columns={props.columns}
      dataSource={props.items}
      pagination={{
        current: props.page,
        pageSize: props.pageSize,
        total: props.total,
        showSizeChanger: true,
        onChange: props.onPageChange,
      }}
      scroll={{ x: 1420 }}
    />
  )
}
