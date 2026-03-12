import { TeamOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Descriptions, Empty, Form, Grid, Input, InputNumber, List, Row, Skeleton, Space, Statistic, Table, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import {
  getCurrentAndPreviousUtilityReadings,
  getCurrentMonthBill,
  getMyRoomContext,
  getMyRoommates,
  listMyRecentBills,
  upsertMyUtilityReading,
  type InvoiceSummary,
  type RoommateSummary,
  type UtilityReadingSnapshot,
} from '../../services/tenantRoomService'

interface UtilityFormValues {
  month: string
  electricity_prev: number | null
  electricity_curr: number | null
  water_prev: number | null
  water_curr: number | null
  note: string
}

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

const invoiceStatusColor: Record<InvoiceSummary['status'], string> = {
  DRAFT: 'default',
  ISSUED: 'processing',
  PAID: 'green',
  VOID: 'red',
  OVERDUE: 'orange',
}

const paymentStatusColor: Record<NonNullable<InvoiceSummary['payment_status']>, string> = {
  PENDING: 'gold',
  SUCCEEDED: 'green',
  FAILED: 'red',
  REFUNDED: 'cyan',
  CANCELLED: 'default',
}

export function TenantRoomPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [context, setContext] = useState<Awaited<ReturnType<typeof getMyRoomContext>>>(null)
  const [roommates, setRoommates] = useState<RoommateSummary[]>([])
  const [currentBill, setCurrentBill] = useState<InvoiceSummary | null>(null)
  const [billHistory, setBillHistory] = useState<InvoiceSummary[]>([])
  const [utilitySnapshot, setUtilitySnapshot] = useState<UtilityReadingSnapshot | null>(null)

  const [form] = Form.useForm<UtilityFormValues>()
  const monthValue = Form.useWatch('month', form)
  const electricityPrev = Form.useWatch('electricity_prev', form)
  const electricityCurr = Form.useWatch('electricity_curr', form)
  const waterPrev = Form.useWatch('water_prev', form)
  const waterCurr = Form.useWatch('water_curr', form)

  const electricUsage = useMemo(() => {
    if (electricityPrev === null || electricityPrev === undefined || electricityCurr === null || electricityCurr === undefined) {
      return null
    }
    return Math.max(0, electricityCurr - electricityPrev)
  }, [electricityCurr, electricityPrev])

  const waterUsage = useMemo(() => {
    if (waterPrev === null || waterPrev === undefined || waterCurr === null || waterCurr === undefined) {
      return null
    }
    return Math.max(0, waterCurr - waterPrev)
  }, [waterCurr, waterPrev])

  const hydrateFormByMonth = async (roomId: string, month: string) => {
    const snapshot = await getCurrentAndPreviousUtilityReadings(roomId, `${month}-01`)
    setUtilitySnapshot(snapshot)
    form.setFieldsValue({
      electricity_prev: snapshot.electricity_prev_value,
      electricity_curr: snapshot.electricity_curr_value,
      water_prev: snapshot.water_prev_value,
      water_curr: snapshot.water_curr_value,
      note: snapshot.current_reading?.note ?? '',
    })
  }

  const refresh = async () => {
    setLoading(true)
    try {
      const roomContext = await getMyRoomContext()
      setContext(roomContext)

      if (!roomContext) {
        setRoommates([])
        setCurrentBill(null)
        setBillHistory([])
        setUtilitySnapshot(null)
        return
      }

      const selectedMonth = form.getFieldValue('month') || dayjs().format('YYYY-MM')

      const [roommatesData, currentBillData, historyData] = await Promise.all([
        getMyRoommates(roomContext.contract.id),
        getCurrentMonthBill(roomContext.contract.id),
        listMyRecentBills(roomContext.contract.id),
      ])

      setRoommates(roommatesData)
      setCurrentBill(currentBillData)
      setBillHistory(historyData)
      await hydrateFormByMonth(roomContext.room.id, selectedMonth)
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
    if (!context?.room.id || !monthValue) {
      return
    }

    void hydrateFormByMonth(context.room.id, monthValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.room.id, monthValue])

  const handleSubmit = async (values: UtilityFormValues) => {
    if (!context) {
      return
    }

    if (values.electricity_curr === null || values.electricity_curr === undefined || values.water_curr === null || values.water_curr === undefined) {
      message.error('Vui lòng nhập đầy đủ chỉ số điện và nước hiện tại')
      return
    }

    setSubmitting(true)
    try {
      await upsertMyUtilityReading(context.room.id, {
        month: `${values.month}-01`,
        electricity_curr: values.electricity_curr,
        water_curr: values.water_curr,
        note: values.note.trim() || null,
      })

      await hydrateFormByMonth(context.room.id, values.month)
      message.success('Đã ghi nhận chỉ số điện nước thành công')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể lưu chỉ số điện nước')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <Skeleton active paragraph={{ rows: 14 }} />
  }

  if (!context) {
    return <Empty description="Không tìm thấy phòng đang ở của tenant hiện tại" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Typography.Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
          Xin chào {context.tenant.full_name}
        </Typography.Title>
        <Typography.Text type="secondary">Thông tin phòng hiện tại, hóa đơn tháng và chỉ số điện nước của bạn.</Typography.Text>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card title="Thông tin phòng">
            <Descriptions bordered column={1} size={isMobile ? 'small' : 'default'}>
              <Descriptions.Item label="Tòa nhà">{context.building.name}</Descriptions.Item>
              <Descriptions.Item label="Mã phòng">{context.room.code}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={context.room.status === 'ACTIVE' ? 'green' : 'default'}>{context.room.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Giá thuê hợp đồng">{currency.format(context.contract.rent_price)}</Descriptions.Item>
              <Descriptions.Item label="Sức chứa">{context.room.max_occupants} người</Descriptions.Item>
              <Descriptions.Item label="Tầng">{context.room.floor ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Diện tích">{context.room.area_m2 ? `${context.room.area_m2} m²` : '-'}</Descriptions.Item>
              <Descriptions.Item label="Ghi chú">{context.room.note ?? '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card title="Hóa đơn tháng hiện tại" extra={currentBill ? <Tag color={invoiceStatusColor[currentBill.status]}>{currentBill.status}</Tag> : null}>
            {!currentBill ? (
              <Alert showIcon type="info" message="Tháng này chưa có hóa đơn." />
            ) : (
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <Typography.Text type="secondary">Kỳ hóa đơn: {dayjs(currentBill.month).format('MM/YYYY')}</Typography.Text>
                <Row gutter={[12, 12]}>
                  <Col xs={12}><Statistic title="Tiền phòng" value={currentBill.rent_amount} formatter={(value) => currency.format(Number(value))} /></Col>
                  <Col xs={12}><Statistic title="Tiền điện" value={currentBill.electric_amount} formatter={(value) => currency.format(Number(value))} /></Col>
                  <Col xs={12}><Statistic title="Tiền nước" value={currentBill.water_amount} formatter={(value) => currency.format(Number(value))} /></Col>
                  <Col xs={12}><Statistic title="Phí khác" value={currentBill.other_amount} formatter={(value) => currency.format(Number(value))} /></Col>
                </Row>
                <Card size="small" style={{ background: '#f6ffed' }}>
                  <Statistic title="Tổng thanh toán" value={currentBill.total} valueStyle={{ color: '#389e0d' }} formatter={(value) => currency.format(Number(value))} />
                </Card>
                <Space wrap>
                  <Typography.Text type="secondary">Hạn thanh toán: {currentBill.due_date ? dayjs(currentBill.due_date).format('DD/MM/YYYY') : '-'}</Typography.Text>
                  {currentBill.payment_status ? <Tag color={paymentStatusColor[currentBill.payment_status]}>Payment: {currentBill.payment_status}</Tag> : null}
                </Space>
                <Typography.Text type="secondary">Ngày thanh toán: {currentBill.paid_at ? dayjs(currentBill.paid_at).format('DD/MM/YYYY') : '-'}</Typography.Text>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Người đang ở cùng phòng" extra={<Space><TeamOutlined /><span>{roommates.length} người</span></Space>}>
        <List
          dataSource={roommates}
          locale={{ emptyText: 'Không có dữ liệu người ở cùng phòng.' }}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <Space>
                    <span>{item.full_name}</span>
                    {item.is_primary ? <Tag color="blue">Đại diện hợp đồng</Tag> : null}
                  </Space>
                }
                description={`Giới tính: ${item.gender ?? '-'} • SĐT: ${item.phone} • Ngày vào ở: ${dayjs(item.joined_at).format('DD/MM/YYYY')}`}
              />
            </List.Item>
          )}
        />
      </Card>

      <Card title="Chỉ số điện / nước hiện tại">
        {!utilitySnapshot ? (
          <Alert showIcon type="info" message="Chưa có dữ liệu chỉ số điện nước." />
        ) : (
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card size="small" title={`Điện (${dayjs(utilitySnapshot.month).format('MM/YYYY')})`}>
                <Space direction="vertical" size={2}>
                  <Typography.Text type="secondary">Chỉ số tháng trước: {utilitySnapshot.electricity_prev_value ?? '-'}</Typography.Text>
                  <Typography.Text type="secondary">Chỉ số tháng này: {utilitySnapshot.electricity_curr_value ?? 'Chưa gửi'}</Typography.Text>
                  <Typography.Text strong>Sản lượng: {utilitySnapshot.electricity_usage ?? '-'} kWh</Typography.Text>
                </Space>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small" title={`Nước (${dayjs(utilitySnapshot.month).format('MM/YYYY')})`}>
                <Space direction="vertical" size={2}>
                  <Typography.Text type="secondary">Chỉ số tháng trước: {utilitySnapshot.water_prev_value ?? '-'}</Typography.Text>
                  <Typography.Text type="secondary">Chỉ số tháng này: {utilitySnapshot.water_curr_value ?? 'Chưa gửi'}</Typography.Text>
                  <Typography.Text strong>Sản lượng: {utilitySnapshot.water_usage ?? '-'} m³</Typography.Text>
                </Space>
              </Card>
            </Col>
          </Row>
        )}
      </Card>

      <Card title="Nhập chỉ số điện / nước theo tháng">
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
              <Form.Item name="electricity_prev" label="Chỉ số điện tháng trước (tự động)">
                <InputNumber style={{ width: '100%' }} disabled precision={0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="electricity_curr"
                label="Chỉ số điện tháng này"
                dependencies={['electricity_prev']}
                rules={[
                  { required: true, type: 'number', message: 'Vui lòng nhập chỉ số điện hiện tại' },
                  { type: 'number', min: 0, message: 'Chỉ số phải >= 0' },
                  ({ getFieldValue }) => ({
                    validator(_, value: number | null) {
                      const prev = getFieldValue('electricity_prev') as number | null
                      if (value === null || value === undefined || prev === null || prev === undefined || value >= prev) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('Chỉ số điện hiện tại phải lớn hơn hoặc bằng chỉ số tháng trước'))
                    },
                  }),
                ]}
              >
                <InputNumber style={{ width: '100%' }} precision={0} min={0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="water_prev" label="Chỉ số nước tháng trước (tự động)">
                <InputNumber style={{ width: '100%' }} disabled precision={0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="water_curr"
                label="Chỉ số nước tháng này"
                dependencies={['water_prev']}
                rules={[
                  { required: true, type: 'number', message: 'Vui lòng nhập chỉ số nước hiện tại' },
                  { type: 'number', min: 0, message: 'Chỉ số phải >= 0' },
                  ({ getFieldValue }) => ({
                    validator(_, value: number | null) {
                      const prev = getFieldValue('water_prev') as number | null
                      if (value === null || value === undefined || prev === null || prev === undefined || value >= prev) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('Chỉ số nước hiện tại phải lớn hơn hoặc bằng chỉ số tháng trước'))
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
              <Card size="small"><Statistic title="Sản lượng điện (kWh)" value={electricUsage ?? '-'} /></Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small"><Statistic title="Sản lượng nước (m³)" value={waterUsage ?? '-'} /></Card>
            </Col>
          </Row>

          <Form.Item name="note" label="Ghi chú" style={{ marginTop: 16 }}>
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="Ghi chú (không bắt buộc)" />
          </Form.Item>

          {utilitySnapshot?.current_reading?.reported_at ? (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Lần gửi gần nhất: ${dayjs(utilitySnapshot.current_reading.reported_at).format('HH:mm DD/MM/YYYY')}`}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Chưa có chỉ số cho tháng này. Vui lòng nhập và lưu bên dưới."
            />
          )}

          <Button htmlType="submit" type="primary" loading={submitting} block={isMobile}>
            Lưu chỉ số tháng
          </Button>
        </Form>
      </Card>

      <Card title="Lịch sử hóa đơn gần đây">
        <Table<InvoiceSummary>
          rowKey="id"
          dataSource={billHistory}
          pagination={false}
          scroll={{ x: 680 }}
          columns={[
            { title: 'Tháng', dataIndex: 'month', render: (value: string) => dayjs(value).format('MM/YYYY') },
            { title: 'Tổng tiền', dataIndex: 'total', align: 'right', render: (value: number) => currency.format(value) },
            { title: 'Hóa đơn', dataIndex: 'status', render: (value: InvoiceSummary['status']) => <Tag color={invoiceStatusColor[value]}>{value}</Tag> },
            {
              title: 'Thanh toán',
              dataIndex: 'payment_status',
              render: (value: InvoiceSummary['payment_status']) => (value ? <Tag color={paymentStatusColor[value]}>{value}</Tag> : '-'),
            },
            { title: 'Ngày thanh toán', dataIndex: 'paid_at', render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY') : '-') },
          ]}
        />
      </Card>
    </Space>
  )
}
