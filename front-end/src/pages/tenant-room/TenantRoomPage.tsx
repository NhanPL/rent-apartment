import { CheckCircleOutlined, TeamOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Descriptions, Empty, Form, Grid, Input, InputNumber, List, Row, Skeleton, Space, Statistic, Table, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import {
  getCurrentMonthBill,
  getMyRoomContext,
  getMyRoommates,
  getMyUtilityReading,
  listMyRecentBills,
  upsertMyUtilityReading,
  type CurrentMonthInvoiceSummary,
  type RoommateSummary,
  type UtilityReading,
} from '../../services/tenantRoomService'

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

const invoiceStatusColor: Record<CurrentMonthInvoiceSummary['status'], string> = {
  DRAFT: 'default',
  ISSUED: 'processing',
  PAID: 'green',
  VOID: 'red',
  OVERDUE: 'orange',
}

interface UtilityFormValues {
  month: string
  electricity_prev: number | null
  electricity_curr: number | null
  water_prev: number | null
  water_curr: number | null
  note: string
}

export function TenantRoomPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [context, setContext] = useState<Awaited<ReturnType<typeof getMyRoomContext>>>(null)
  const [roommates, setRoommates] = useState<RoommateSummary[]>([])
  const [currentBill, setCurrentBill] = useState<CurrentMonthInvoiceSummary | null>(null)
  const [billHistory, setBillHistory] = useState<CurrentMonthInvoiceSummary[]>([])
  const [reading, setReading] = useState<UtilityReading | null>(null)

  const [form] = Form.useForm<UtilityFormValues>()
  const monthValue = Form.useWatch('month', form)
  const electricPrev = Form.useWatch('electricity_prev', form)
  const electricCurr = Form.useWatch('electricity_curr', form)
  const waterPrev = Form.useWatch('water_prev', form)
  const waterCurr = Form.useWatch('water_curr', form)

  const electricUsage = useMemo(() => {
    if (electricPrev === null || electricPrev === undefined || electricCurr === null || electricCurr === undefined) {
      return null
    }
    return Math.max(0, electricCurr - electricPrev)
  }, [electricCurr, electricPrev])

  const waterUsage = useMemo(() => {
    if (waterPrev === null || waterPrev === undefined || waterCurr === null || waterCurr === undefined) {
      return null
    }
    return Math.max(0, waterCurr - waterPrev)
  }, [waterCurr, waterPrev])

  const refresh = async () => {
    setLoading(true)
    try {
      const roomContext = await getMyRoomContext()
      setContext(roomContext)

      if (!roomContext) {
        setRoommates([])
        setCurrentBill(null)
        setBillHistory([])
        setReading(null)
        return
      }

      const targetMonth = form.getFieldValue('month') || dayjs().format('YYYY-MM')

      const [roommatesData, currentBillData, historyData, readingData] = await Promise.all([
        getMyRoommates(roomContext.room.id, roomContext.contract.id),
        getCurrentMonthBill(roomContext.contract.id),
        listMyRecentBills(roomContext.contract.id),
        getMyUtilityReading(roomContext.room.id, `${targetMonth}-01`),
      ])

      setRoommates(roommatesData)
      setCurrentBill(currentBillData)
      setBillHistory(historyData)
      setReading(readingData)

      form.setFieldsValue({
        month: targetMonth,
        electricity_prev: readingData?.electricity_prev ?? null,
        electricity_curr: readingData?.electricity_curr ?? null,
        water_prev: readingData?.water_prev ?? null,
        water_curr: readingData?.water_curr ?? null,
        note: readingData?.note ?? '',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    form.setFieldValue('month', dayjs().format('YYYY-MM'))
    void refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const loadByMonth = async () => {
      if (!context?.room.id || !monthValue) {
        return
      }
      const readingData = await getMyUtilityReading(context.room.id, `${monthValue}-01`)
      setReading(readingData)
      form.setFieldsValue({
        electricity_prev: readingData?.electricity_prev ?? null,
        electricity_curr: readingData?.electricity_curr ?? null,
        water_prev: readingData?.water_prev ?? null,
        water_curr: readingData?.water_curr ?? null,
        note: readingData?.note ?? '',
      })
    }

    void loadByMonth()
  }, [context?.room.id, form, monthValue])

  const handleSubmit = async (values: UtilityFormValues) => {
    if (!context) {
      return
    }

    setSubmitting(true)
    try {
      const saved = await upsertMyUtilityReading(context.room.id, {
        month: `${values.month}-01`,
        electricity_prev: values.electricity_prev,
        electricity_curr: values.electricity_curr,
        water_prev: values.water_prev,
        water_curr: values.water_curr,
        note: values.note.trim() || null,
      })
      setReading(saved)
      message.success('Đã lưu chỉ số điện nước thành công')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <Skeleton active paragraph={{ rows: 14 }} />
  }

  if (!context) {
    return (
      <Empty
        description="Không tìm thấy thông tin phòng đang ở của bạn"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size={2}>
          <Typography.Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
            Xin chào {context.tenant.full_name}
          </Typography.Title>
          <Typography.Text type="secondary">Theo dõi phòng ở, hóa đơn và chỉ số điện nước của bạn.</Typography.Text>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card title="Thông tin phòng">
            <Descriptions bordered column={1} size={isMobile ? 'small' : 'default'}>
              <Descriptions.Item label="Tòa nhà">{context.building.name}</Descriptions.Item>
              <Descriptions.Item label="Mã phòng">{context.room.code}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái phòng">
                <Tag color={context.room.status === 'ACTIVE' ? 'green' : 'default'}>{context.room.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Giá thuê">{currency.format(context.contract.rent_price)}</Descriptions.Item>
              <Descriptions.Item label="Sức chứa tối đa">{context.room.max_occupants} người</Descriptions.Item>
              <Descriptions.Item label="Tầng">{context.room.floor ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Diện tích">{context.room.area_m2 ? `${context.room.area_m2} m²` : '-'}</Descriptions.Item>
              <Descriptions.Item label="Ghi chú">{context.room.note ?? '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card title="Hóa đơn tháng hiện tại" extra={currentBill ? <Tag color={invoiceStatusColor[currentBill.status]}>{currentBill.status}</Tag> : null}>
            {!currentBill ? (
              <Alert type="info" message="Hiện chưa có hóa đơn cho tháng này." showIcon />
            ) : (
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <Typography.Text type="secondary">Kỳ hóa đơn: {dayjs(currentBill.month).format('MM/YYYY')}</Typography.Text>
                <Row gutter={[12, 12]}>
                  <Col xs={12}><Statistic title="Tiền phòng" value={currentBill.rent_amount} formatter={(value) => currency.format(Number(value))} /></Col>
                  <Col xs={12}><Statistic title="Điện" value={currentBill.electric_amount} formatter={(value) => currency.format(Number(value))} /></Col>
                  <Col xs={12}><Statistic title="Nước" value={currentBill.water_amount} formatter={(value) => currency.format(Number(value))} /></Col>
                  <Col xs={12}><Statistic title="Phí khác" value={currentBill.other_amount} formatter={(value) => currency.format(Number(value))} /></Col>
                </Row>
                <Card size="small" style={{ background: '#f6ffed' }}>
                  <Statistic title="Tổng thanh toán" value={currentBill.total} valueStyle={{ color: '#389e0d' }} formatter={(value) => currency.format(Number(value))} />
                </Card>
                <Space direction="vertical" size={2}>
                  <Typography.Text type="secondary">Hạn thanh toán: {currentBill.due_date ? dayjs(currentBill.due_date).format('DD/MM/YYYY') : '-'}</Typography.Text>
                  <Typography.Text type="secondary">Ngày phát hành: {currentBill.issued_at ? dayjs(currentBill.issued_at).format('DD/MM/YYYY') : '-'}</Typography.Text>
                </Space>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Người đang ở cùng phòng" extra={<Space><TeamOutlined /><span>{roommates.length} người</span></Space>}>
        <List
          dataSource={roommates}
          locale={{ emptyText: 'Chưa có dữ liệu người ở cùng phòng.' }}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <Space>
                    <span>{item.full_name}</span>
                    {item.is_primary ? <Tag color="blue">Đại diện hợp đồng</Tag> : null}
                  </Space>
                }
                description={`Giới tính: ${item.gender ?? '-'} • Điện thoại: ${item.phone} • Ngày vào ở: ${dayjs(item.joined_at).format('DD/MM/YYYY')}`}
              />
            </List.Item>
          )}
        />
      </Card>

      <Card title="Nhập chỉ số điện / nước hàng tháng">
        <Form<UtilityFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            month: dayjs().format('YYYY-MM'),
            electricity_prev: null,
            electricity_curr: null,
            water_prev: null,
            water_curr: null,
            note: '',
          }}
        >
          <Row gutter={[16, 8]}>
            <Col xs={24} md={8}>
              <Form.Item name="month" label="Tháng ghi chỉ số" rules={[{ required: true, message: 'Vui lòng chọn tháng' }]}>
                <Input type="month" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 8]}>
            <Col xs={24} md={12}>
              <Form.Item name="electricity_prev" label="Chỉ số điện tháng trước" rules={[{ type: 'number', min: 0, message: 'Chỉ số phải >= 0' }]}> 
                <InputNumber style={{ width: '100%' }} precision={0} min={0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="electricity_curr"
                label="Chỉ số điện tháng này"
                dependencies={['electricity_prev']}
                rules={[
                  { type: 'number', min: 0, message: 'Chỉ số phải >= 0' },
                  ({ getFieldValue }) => ({
                    validator(_, value: number | null) {
                      const prev = getFieldValue('electricity_prev')
                      if (value === null || value === undefined || prev === null || prev === undefined || value >= prev) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('Chỉ số tháng này phải lớn hơn hoặc bằng tháng trước'))
                    },
                  }),
                ]}
              >
                <InputNumber style={{ width: '100%' }} precision={0} min={0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="water_prev" label="Chỉ số nước tháng trước" rules={[{ type: 'number', min: 0, message: 'Chỉ số phải >= 0' }]}> 
                <InputNumber style={{ width: '100%' }} precision={0} min={0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="water_curr"
                label="Chỉ số nước tháng này"
                dependencies={['water_prev']}
                rules={[
                  { type: 'number', min: 0, message: 'Chỉ số phải >= 0' },
                  ({ getFieldValue }) => ({
                    validator(_, value: number | null) {
                      const prev = getFieldValue('water_prev')
                      if (value === null || value === undefined || prev === null || prev === undefined || value >= prev) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('Chỉ số tháng này phải lớn hơn hoặc bằng tháng trước'))
                    },
                  }),
                ]}
              >
                <InputNumber style={{ width: '100%' }} precision={0} min={0} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 8]}>
            <Col xs={24} md={12}>
              <Card size="small">
                <Statistic title="Sản lượng điện (kWh)" value={electricUsage ?? '-'} />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small">
                <Statistic title="Sản lượng nước (m³)" value={waterUsage ?? '-'} />
              </Card>
            </Col>
          </Row>

          <Form.Item name="note" label="Ghi chú" style={{ marginTop: 16 }}>
            <Input.TextArea placeholder="Nhập ghi chú nếu có" rows={3} maxLength={500} showCount />
          </Form.Item>

          {reading?.reported_at ? (
            <Alert
              style={{ marginBottom: 16 }}
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              message={`Đã gửi chỉ số lúc ${dayjs(reading.reported_at).format('HH:mm DD/MM/YYYY')}`}
            />
          ) : null}

          <Button htmlType="submit" type="primary" loading={submitting} block={isMobile}>
            Lưu chỉ số tháng
          </Button>
        </Form>
      </Card>

      <Card title="Lịch sử hóa đơn gần đây">
        <Table<CurrentMonthInvoiceSummary>
          rowKey="id"
          dataSource={billHistory}
          pagination={false}
          scroll={{ x: 540 }}
          columns={[
            { title: 'Tháng', dataIndex: 'month', render: (value: string) => dayjs(value).format('MM/YYYY') },
            { title: 'Tổng tiền', dataIndex: 'total', align: 'right', render: (value: number) => currency.format(value) },
            { title: 'Trạng thái', dataIndex: 'status', render: (value: CurrentMonthInvoiceSummary['status']) => <Tag color={invoiceStatusColor[value]}>{value}</Tag> },
            { title: 'Ngày đến hạn', dataIndex: 'due_date', render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY') : '-') },
          ]}
        />
      </Card>
    </Space>
  )
}
