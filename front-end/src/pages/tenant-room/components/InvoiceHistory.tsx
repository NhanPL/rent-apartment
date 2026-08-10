import { EyeOutlined } from '@ant-design/icons'
import { Button, Card, Table, Tag } from 'antd'
import dayjs from 'dayjs'
import type { InvoiceSummary } from '../../../services/tenantRoomService'

interface Props {
  items: InvoiceSummary[]
  formatCurrency: (value: number) => string
  invoiceStatusColor: Record<InvoiceSummary['status'], string>
  paymentStatusColor: Record<NonNullable<InvoiceSummary['payment_status']>, string>
  onOpen: (id: string) => void
}

export function InvoiceHistory(props: Props) {
  return (
    <Card title="Lich su hoa don gan day">
      <Table<InvoiceSummary>
        rowKey="id"
        dataSource={props.items}
        pagination={false}
        scroll={{ x: 680 }}
        columns={[
          { title: 'Thang', dataIndex: 'month', render: (value: string) => dayjs(value).format('MM/YYYY') },
          { title: 'Tong tien', dataIndex: 'total', align: 'right', render: (value: number) => props.formatCurrency(value) },
          { title: 'Da tra', dataIndex: 'paid_amount', align: 'right', render: (value: number) => props.formatCurrency(value) },
          { title: 'Hoa don', dataIndex: 'status', render: (value: InvoiceSummary['status']) => <Tag color={props.invoiceStatusColor[value]}>{value}</Tag> },
          { title: 'Thanh toan', dataIndex: 'payment_status', render: (value: InvoiceSummary['payment_status']) => value ? <Tag color={props.paymentStatusColor[value]}>{value}</Tag> : '-' },
          { title: 'Ngay thanh toan', dataIndex: 'paid_at', render: (value: string | null) => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
          { title: 'Thao tac', fixed: 'right', width: 80, render: (_, row) => <Button type="text" icon={<EyeOutlined />} aria-label={`View invoice ${dayjs(row.month).format('MM/YYYY')}`} onClick={() => props.onOpen(row.id)} /> },
        ]}
      />
    </Card>
  )
}
