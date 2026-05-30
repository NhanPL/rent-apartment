import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  List,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  approveUtilityReading,
  createUtilityRate,
  deleteUtilityRate,
  getUtilityReading,
  getUtilityRate,
  listBuildings,
  listRooms,
  listUtilityRates,
  listUtilityReadings,
  rejectUtilityReading,
  updateUtilityRate,
} from '../../services/utilitiesService'
import type {
  BuildingOption,
  RoomOption,
  UtilityRate,
  UtilityRatePayload,
  UtilityReadingDetail,
  UtilityReadingListItem,
  UtilityReadingStatus,
} from './types'
import './UtilitiesPage.css'

interface UtilityRateFormValues {
  building_id?: string
  effective_from?: string
  electricity_unit_price?: number
  water_unit_price?: number
  note?: string
}

interface RejectFormValues {
  reason: string
}

const readingStatusOptions: { label: string; value: UtilityReadingStatus; color: string }[] = [
  { label: 'Draft', value: 'DRAFT', color: 'default' },
  { label: 'Submitted', value: 'SUBMITTED', color: 'gold' },
  { label: 'Approved', value: 'APPROVED', color: 'green' },
  { label: 'Rejected', value: 'REJECTED', color: 'red' },
  { label: 'Invoiced', value: 'INVOICED', color: 'blue' },
]

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

const formatDate = (value: string | null | undefined) => (value ? dayjs(value).format('DD/MM/YYYY') : '-')
const formatMonth = (value: string) => dayjs(value).format('MM/YYYY')

const statusTag = (status: UtilityReadingStatus) => {
  const option = readingStatusOptions.find((item) => item.value === status)
  return <Tag color={option?.color}>{option?.label ?? status}</Tag>
}

const nullableText = (value: string | undefined) => {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

const toRatePayload = (values: UtilityRateFormValues): UtilityRatePayload => {
  if (!values.building_id || !values.effective_from || values.electricity_unit_price === undefined || values.water_unit_price === undefined) {
    throw new Error('Missing required rate fields')
  }

  return {
    building_id: values.building_id,
    effective_from: values.effective_from,
    electricity_unit_price: values.electricity_unit_price,
    water_unit_price: values.water_unit_price,
    note: nullableText(values.note),
  }
}

export function UtilitiesPage() {
  const screens = Grid.useBreakpoint()
  const [rateForm] = Form.useForm<UtilityRateFormValues>()
  const [rejectForm] = Form.useForm<RejectFormValues>()

  const [buildings, setBuildings] = useState<BuildingOption[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])

  const [readingsLoading, setReadingsLoading] = useState(true)
  const [readingsError, setReadingsError] = useState<string | null>(null)
  const [readings, setReadings] = useState<UtilityReadingListItem[]>([])
  const [readingBuildingFilter, setReadingBuildingFilter] = useState<string | undefined>()
  const [readingRoomFilter, setReadingRoomFilter] = useState<string | undefined>()
  const [readingMonthFilter, setReadingMonthFilter] = useState('')
  const [readingStatusFilter, setReadingStatusFilter] = useState<UtilityReadingStatus | undefined>()

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailItem, setDetailItem] = useState<UtilityReadingDetail | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<UtilityReadingListItem | null>(null)
  const [rejectLoading, setRejectLoading] = useState(false)

  const [ratesLoading, setRatesLoading] = useState(true)
  const [ratesError, setRatesError] = useState<string | null>(null)
  const [rates, setRates] = useState<UtilityRate[]>([])
  const [rateBuildingFilter, setRateBuildingFilter] = useState<string | undefined>()
  const [rateDrawerOpen, setRateDrawerOpen] = useState(false)
  const [rateDrawerMode, setRateDrawerMode] = useState<'create' | 'edit'>('create')
  const [editingRateId, setEditingRateId] = useState<string | null>(null)
  const [rateDrawerLoading, setRateDrawerLoading] = useState(false)
  const [rateSaving, setRateSaving] = useState(false)

  const loadOptions = useCallback(async () => {
    const [buildingRows, roomRows] = await Promise.all([listBuildings(), listRooms()])
    setBuildings(buildingRows)
    setRooms(roomRows)
  }, [])

  const loadReadings = useCallback(async () => {
    setReadingsLoading(true)
    setReadingsError(null)

    try {
      setReadings(await listUtilityReadings({
        building_id: readingBuildingFilter,
        room_id: readingRoomFilter,
        month: readingMonthFilter || undefined,
        status: readingStatusFilter,
      }))
    } catch {
      setReadingsError('Unable to load utility readings.')
    } finally {
      setReadingsLoading(false)
    }
  }, [readingBuildingFilter, readingMonthFilter, readingRoomFilter, readingStatusFilter])

  const loadRates = useCallback(async () => {
    setRatesLoading(true)
    setRatesError(null)

    try {
      setRates(await listUtilityRates(rateBuildingFilter))
    } catch {
      setRatesError('Unable to load utility rates.')
    } finally {
      setRatesLoading(false)
    }
  }, [rateBuildingFilter])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  useEffect(() => {
    void loadReadings()
  }, [loadReadings])

  useEffect(() => {
    void loadRates()
  }, [loadRates])

  const readingRooms = useMemo(() => {
    if (!readingBuildingFilter) return rooms
    return rooms.filter((room) => room.building_id === readingBuildingFilter)
  }, [readingBuildingFilter, rooms])

  const activeSubmittedCount = useMemo(
    () => readings.filter((item) => item.status === 'SUBMITTED').length,
    [readings],
  )

  const openReadingDetail = useCallback(async (id: string) => {
    setDetailOpen(true)
    setDetailLoading(true)

    try {
      setDetailItem(await getUtilityReading(id))
    } catch {
      message.error('Unable to load reading detail')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const refreshReadingDetailAndList = useCallback(async (id: string) => {
    await Promise.all([loadReadings(), openReadingDetail(id)])
  }, [loadReadings, openReadingDetail])

  const handleApprove = useCallback(async (id: string) => {
    setActionLoading(`approve-${id}`)

    try {
      await approveUtilityReading(id)
      message.success('Reading approved')
      await refreshReadingDetailAndList(id)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to approve reading')
    } finally {
      setActionLoading(null)
    }
  }, [refreshReadingDetailAndList])

  const openReject = useCallback((reading: UtilityReadingListItem) => {
    rejectForm.resetFields()
    setRejectTarget(reading)
  }, [rejectForm])

  const submitReject = useCallback(async () => {
    if (!rejectTarget) return

    setRejectLoading(true)

    try {
      const values = await rejectForm.validateFields()
      await rejectUtilityReading(rejectTarget.id, values.reason)
      message.success('Reading rejected')
      setRejectTarget(null)
      await refreshReadingDetailAndList(rejectTarget.id)
    } catch (error: unknown) {
      const formError = error as { errorFields?: Array<{ name: (string | number)[] }> }
      if (!formError.errorFields) {
        message.error(error instanceof Error ? error.message : 'Unable to reject reading')
      }
    } finally {
      setRejectLoading(false)
    }
  }, [refreshReadingDetailAndList, rejectForm, rejectTarget])

  const openCreateRate = useCallback(() => {
    setRateDrawerMode('create')
    setEditingRateId(null)
    rateForm.resetFields()
    rateForm.setFieldsValue({
      effective_from: dayjs().startOf('month').format('YYYY-MM-DD'),
      electricity_unit_price: 0,
      water_unit_price: 0,
    })
    setRateDrawerOpen(true)
  }, [rateForm])

  const openEditRate = useCallback(async (id: string) => {
    setRateDrawerMode('edit')
    setEditingRateId(id)
    setRateDrawerOpen(true)
    setRateDrawerLoading(true)

    try {
      const rate = await getUtilityRate(id)
      rateForm.resetFields()
      rateForm.setFieldsValue({
        building_id: rate.building_id,
        effective_from: rate.effective_from,
        electricity_unit_price: rate.electricity_unit_price,
        water_unit_price: rate.water_unit_price,
        note: rate.note ?? undefined,
      })
    } catch {
      message.error('Unable to load utility rate')
      setRateDrawerOpen(false)
    } finally {
      setRateDrawerLoading(false)
    }
  }, [rateForm])

  const submitRate = useCallback(async () => {
    setRateSaving(true)

    try {
      const values = await rateForm.validateFields()
      const payload = toRatePayload(values)

      if (rateDrawerMode === 'create') {
        await createUtilityRate(payload)
        message.success('Utility rate created')
      } else if (editingRateId) {
        await updateUtilityRate(editingRateId, payload)
        message.success('Utility rate updated')
      }

      setRateDrawerOpen(false)
      await loadRates()
    } catch (error: unknown) {
      const formError = error as { errorFields?: Array<{ name: (string | number)[] }> }
      if (!formError.errorFields) {
        message.error(error instanceof Error ? error.message : 'Unable to save utility rate')
      }
    } finally {
      setRateSaving(false)
    }
  }, [editingRateId, loadRates, rateDrawerMode, rateForm])

  const confirmDeleteRate = useCallback((rate: UtilityRate) => {
    Modal.confirm({
      title: 'Delete utility rate?',
      content: `${rate.building_name} effective ${formatDate(rate.effective_from)}`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteUtilityRate(rate.id)
        message.success('Utility rate deleted')
        await loadRates()
      },
    })
  }, [loadRates])

  const readingColumns: ColumnsType<UtilityReadingListItem> = useMemo(
    () => [
      {
        title: 'Month',
        dataIndex: 'month',
        key: 'month',
        width: 110,
        render: (value: string) => formatMonth(value),
      },
      {
        title: 'Building / Room',
        key: 'room',
        width: 220,
        render: (_, item) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{item.building_name}</Typography.Text>
            <Typography.Text type="secondary">Room {item.room_code}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Tenant',
        dataIndex: 'tenant_name',
        key: 'tenant_name',
        width: 180,
        render: (value: string | null) => value ?? '-',
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: UtilityReadingStatus) => statusTag(value),
      },
      {
        title: 'Electric',
        key: 'electric',
        width: 170,
        render: (_, item) => `${item.electricity_prev ?? 0} -> ${item.electricity_curr ?? '-'}`,
      },
      {
        title: 'Water',
        key: 'water',
        width: 170,
        render: (_, item) => `${item.water_prev ?? 0} -> ${item.water_curr ?? '-'}`,
      },
      {
        title: 'Evidence',
        dataIndex: 'evidence_count',
        key: 'evidence_count',
        width: 100,
      },
      {
        title: 'Submitted',
        dataIndex: 'submitted_at',
        key: 'submitted_at',
        width: 160,
        render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-'),
      },
      {
        title: 'Actions',
        key: 'actions',
        fixed: 'right',
        width: 220,
        render: (_, item) => (
          <Space wrap>
            <Button type="text" icon={<EyeOutlined />} onClick={() => void openReadingDetail(item.id)} />
            <Button
              type="link"
              disabled={item.status !== 'SUBMITTED'}
              loading={actionLoading === `approve-${item.id}`}
              onClick={() => void handleApprove(item.id)}
            >
              Approve
            </Button>
            <Button danger type="link" disabled={item.status !== 'SUBMITTED'} onClick={() => openReject(item)}>
              Reject
            </Button>
          </Space>
        ),
      },
    ],
    [actionLoading, handleApprove, openReadingDetail, openReject],
  )

  const rateColumns: ColumnsType<UtilityRate> = useMemo(
    () => [
      { title: 'Building', dataIndex: 'building_name', key: 'building_name', width: 220 },
      {
        title: 'Effective from',
        dataIndex: 'effective_from',
        key: 'effective_from',
        width: 150,
        render: (value: string) => formatDate(value),
      },
      {
        title: 'Electricity unit price',
        dataIndex: 'electricity_unit_price',
        key: 'electricity_unit_price',
        width: 190,
        render: (value: number) => currency.format(value),
      },
      {
        title: 'Water unit price',
        dataIndex: 'water_unit_price',
        key: 'water_unit_price',
        width: 170,
        render: (value: number) => currency.format(value),
      },
      { title: 'Note', dataIndex: 'note', key: 'note', render: (value: string | null) => value ?? '-' },
      {
        title: 'Actions',
        key: 'actions',
        fixed: 'right',
        width: 130,
        render: (_, item) => (
          <Space>
            <Button type="text" icon={<EditOutlined />} onClick={() => void openEditRate(item.id)} />
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => confirmDeleteRate(item)} />
          </Space>
        ),
      },
    ],
    [confirmDeleteRate, openEditRate],
  )

  return (
    <div className="utilities-page">
      <Card>
        <div className="utilities-toolbar">
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Utilities
            </Typography.Title>
            <Typography.Text type="secondary">
              Review monthly readings and maintain electricity/water rates by building.
            </Typography.Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateRate}>
            New Rate
          </Button>
        </div>
      </Card>

      <Tabs
        items={[
          {
            key: 'readings',
            label: `Readings${activeSubmittedCount ? ` (${activeSubmittedCount})` : ''}`,
            children: (
              <Card>
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <div className="utilities-filters">
                    <Select
                      value={readingBuildingFilter}
                      placeholder="Building"
                      allowClear
                      options={buildings.map((building) => ({ label: building.name, value: building.id }))}
                      onChange={(value) => {
                        setReadingBuildingFilter(value)
                        setReadingRoomFilter(undefined)
                      }}
                    />
                    <Select
                      value={readingRoomFilter}
                      placeholder="Room"
                      allowClear
                      options={readingRooms.map((room) => ({ label: room.code, value: room.id }))}
                      onChange={(value) => setReadingRoomFilter(value)}
                    />
                    <Input
                      type="month"
                      value={readingMonthFilter}
                      onChange={(event) => setReadingMonthFilter(event.target.value)}
                    />
                    <Select
                      value={readingStatusFilter}
                      placeholder="Status"
                      allowClear
                      options={readingStatusOptions.map((item) => ({ label: item.label, value: item.value }))}
                      onChange={(value) => setReadingStatusFilter(value)}
                    />
                    <Button icon={<ReloadOutlined />} onClick={() => void loadReadings()}>
                      Refresh
                    </Button>
                  </div>

                  {readingsLoading ? (
                    <Skeleton active paragraph={{ rows: 6 }} />
                  ) : readingsError ? (
                    <Empty description={readingsError}>
                      <Button type="primary" onClick={() => void loadReadings()}>
                        Retry
                      </Button>
                    </Empty>
                  ) : (
                    <Table<UtilityReadingListItem>
                      rowKey="id"
                      columns={readingColumns}
                      dataSource={readings}
                      scroll={{ x: 1440 }}
                    />
                  )}
                </Space>
              </Card>
            ),
          },
          {
            key: 'rates',
            label: 'Rates',
            children: (
              <Card>
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <div className="utility-rate-filters">
                    <Select
                      value={rateBuildingFilter}
                      placeholder="Building"
                      allowClear
                      options={buildings.map((building) => ({ label: building.name, value: building.id }))}
                      onChange={(value) => setRateBuildingFilter(value)}
                    />
                    <Button icon={<ReloadOutlined />} onClick={() => void loadRates()}>
                      Refresh
                    </Button>
                  </div>

                  {ratesLoading ? (
                    <Skeleton active paragraph={{ rows: 6 }} />
                  ) : ratesError ? (
                    <Empty description={ratesError}>
                      <Button type="primary" onClick={() => void loadRates()}>
                        Retry
                      </Button>
                    </Empty>
                  ) : (
                    <Table<UtilityRate>
                      rowKey="id"
                      columns={rateColumns}
                      dataSource={rates}
                      scroll={{ x: 980 }}
                    />
                  )}
                </Space>
              </Card>
            ),
          },
        ]}
      />

      <Drawer
        open={detailOpen}
        title="Utility Reading Detail"
        placement="right"
        width={screens.lg ? 720 : screens.md ? 600 : '100%'}
        onClose={() => setDetailOpen(false)}
      >
        {detailLoading || !detailItem ? (
          <Skeleton active paragraph={{ rows: 10 }} />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div className="utilities-detail-header">
              <Space direction="vertical" size={2}>
                <Typography.Text strong>{detailItem.building_name} / Room {detailItem.room_code}</Typography.Text>
                <Typography.Text type="secondary">{formatMonth(detailItem.month)}</Typography.Text>
              </Space>
              <Space wrap>
                {statusTag(detailItem.status)}
                <Button
                  type="primary"
                  disabled={detailItem.status !== 'SUBMITTED'}
                  loading={actionLoading === `approve-${detailItem.id}`}
                  onClick={() => void handleApprove(detailItem.id)}
                >
                  Approve
                </Button>
                <Button danger disabled={detailItem.status !== 'SUBMITTED'} onClick={() => openReject(detailItem)}>
                  Reject
                </Button>
              </Space>
            </div>

            <Descriptions bordered size="small" column={screens.lg ? 2 : 1}>
              <Descriptions.Item label="Tenant">{detailItem.tenant_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Submitted">{detailItem.submitted_at ? dayjs(detailItem.submitted_at).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Electricity prev">{detailItem.electricity_prev ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Electricity curr">{detailItem.electricity_curr ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Water prev">{detailItem.water_prev ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Water curr">{detailItem.water_curr ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Approved at">{detailItem.approved_at ? dayjs(detailItem.approved_at).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Rejected at">{detailItem.rejected_at ? dayjs(detailItem.rejected_at).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Tenant note" span={screens.lg ? 2 : 1}>{detailItem.note ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Reject reason" span={screens.lg ? 2 : 1}>{detailItem.rejection_reason ?? '-'}</Descriptions.Item>
            </Descriptions>

            <Card size="small" title="Evidence">
              {detailItem.evidence.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No evidence uploaded" />
              ) : (
                <List
                  dataSource={detailItem.evidence}
                  renderItem={(item) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<a href={item.file_url} target="_blank" rel="noreferrer">{item.file_name ?? item.file_url}</a>}
                        description={`${item.evidence_type} • ${item.mime_type ?? 'unknown'} • ${dayjs(item.uploaded_at).format('DD/MM/YYYY HH:mm')}`}
                      />
                    </List.Item>
                  )}
                />
              )}
            </Card>
          </Space>
        )}
      </Drawer>

      <Drawer
        open={rateDrawerOpen}
        title={rateDrawerMode === 'create' ? 'New Utility Rate' : 'Edit Utility Rate'}
        placement="right"
        width={screens.md ? 520 : '100%'}
        onClose={() => setRateDrawerOpen(false)}
        destroyOnClose
      >
        {rateDrawerLoading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Form form={rateForm} layout="vertical">
            <div className="utility-rate-form-grid">
              <Form.Item name="building_id" label="Building" rules={[{ required: true, message: 'Please select a building' }]}>
                <Select options={buildings.map((building) => ({ label: building.name, value: building.id }))} />
              </Form.Item>
              <Form.Item name="effective_from" label="Effective from" rules={[{ required: true, message: 'Please select effective date' }]}>
                <Input type="date" />
              </Form.Item>
              <Form.Item name="electricity_unit_price" label="Electricity unit price" rules={[{ required: true, message: 'Please enter electricity rate' }]}>
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="water_unit_price" label="Water unit price" rules={[{ required: true, message: 'Please enter water rate' }]}>
                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="note" label="Note" className="utility-rate-form-full">
                <Input.TextArea rows={3} />
              </Form.Item>
            </div>

            <div className="utility-drawer-actions">
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={() => setRateDrawerOpen(false)}>Cancel</Button>
                <Button type="primary" loading={rateSaving} onClick={() => void submitRate()}>
                  Save
                </Button>
              </Space>
            </div>
          </Form>
        )}
      </Drawer>

      <Modal
        open={Boolean(rejectTarget)}
        title="Reject utility reading"
        okText="Reject"
        okButtonProps={{ danger: true }}
        confirmLoading={rejectLoading}
        onCancel={() => setRejectTarget(null)}
        onOk={() => void submitReject()}
        destroyOnClose
      >
        <Alert
          showIcon
          type="warning"
          message="Tenant can resubmit the reading after rejection."
          style={{ marginBottom: 12 }}
        />
        <Form form={rejectForm} layout="vertical">
          <Form.Item name="reason" label="Reject reason" rules={[{ required: true, whitespace: true, message: 'Please enter reject reason' }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
