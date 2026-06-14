import { CreditCardOutlined, EyeOutlined, TeamOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Descriptions, Drawer, Empty, Form, Grid, Input, InputNumber, List, Row, Select, Skeleton, Space, Statistic, Table, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import {
  attachMyUtilityReadingEvidence,
  createMyVnpayPayment,
  createMyDocument,
  getCurrentAndPreviousUtilityReadings,
  getCurrentMonthBill,
  getMyInvoiceDetail,
  getMyPaymentRequest,
  getMyRoomContext,
  getMyRoommates,
  listMyDocuments,
  listMyRecentBills,
  submitMyPaymentProof,
  upsertMyUtilityReading,
  type InvoiceDetail,
  type InvoiceSummary,
  type RoommateSummary,
  type TenantDocument,
  type TenantDocumentType,
  type UtilityEvidenceType,
  type UtilityReadingSnapshot,
  type UtilityReadingStatus,
} from '../../services/tenantRoomService'
import type { PaymentRequest, PaymentRequestStatus } from '../../services/paymentsService'
import { CloudinaryUploadButton } from '../../shared/components/CloudinaryUploadButton'
import type { UploadedCloudinaryFile } from '../../services/uploadService'
import {
  calculateReadingUsage,
  isTenantUtilityReadingLocked,
  validateTenantUtilityReading,
  type TenantUtilityReadingFormValues,
} from './utilityReadingForm'

interface EvidenceFormValues {
  evidence_type: UtilityEvidenceType
  file_name?: string
  file_url?: string
  mime_type?: string
  file_size?: number
  note?: string
}

interface PaymentProofFormValues {
  file_name?: string
  file_url?: string
  mime_type?: string
  file_size?: number
  transfer_amount?: number
  transfer_time?: string
  payer_note?: string
}

interface TenantDocumentFormValues {
  doc_type: TenantDocumentType
  file_name?: string
  file_url?: string
  mime_type?: string
  file_size?: number
  note?: string
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

const paymentRequestStatusColor: Record<PaymentRequestStatus, string> = {
  DRAFT: 'default',
  WAITING_TRANSFER: 'blue',
  TRANSFER_SUBMITTED: 'gold',
  VERIFIED: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
  EXPIRED: 'orange',
}

const utilityReadingStatusColor: Record<UtilityReadingStatus, string> = {
  DRAFT: 'default',
  SUBMITTED: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
  INVOICED: 'blue',
}

const tenantDocumentTypeLabel: Record<TenantDocumentType, string> = {
  IDENTITY_FRONT: 'CCCD mặt trước',
  IDENTITY_BACK: 'CCCD mặt sau',
  RESIDENCE: 'Giấy tờ cư trú',
  OTHER: 'Khác',
}

const imageAccept = 'image/jpeg,image/png,image/webp'
const documentAccept = `${imageAccept},application/pdf`

const uploadedFileFields = (file: UploadedCloudinaryFile) => ({
  file_name: file.file_name,
  file_url: file.file_url,
  mime_type: file.mime_type,
  file_size: file.file_size,
})

export function TenantRoomPage() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [evidenceSubmitting, setEvidenceSubmitting] = useState(false)
  const [context, setContext] = useState<Awaited<ReturnType<typeof getMyRoomContext>>>(null)
  const [roommates, setRoommates] = useState<RoommateSummary[]>([])
  const [currentBill, setCurrentBill] = useState<InvoiceSummary | null>(null)
  const [currentPaymentRequest, setCurrentPaymentRequest] = useState<PaymentRequest | null>(null)
  const [billHistory, setBillHistory] = useState<InvoiceSummary[]>([])
  const [billDetail, setBillDetail] = useState<InvoiceDetail | null>(null)
  const [billDetailOpen, setBillDetailOpen] = useState(false)
  const [billDetailLoading, setBillDetailLoading] = useState(false)
  const [utilitySnapshot, setUtilitySnapshot] = useState<UtilityReadingSnapshot | null>(null)
  const [vnpaySubmitting, setVnpaySubmitting] = useState(false)
  const [paymentProofSubmitting, setPaymentProofSubmitting] = useState(false)
  const [tenantDocuments, setTenantDocuments] = useState<TenantDocument[]>([])
  const [tenantDocumentSubmitting, setTenantDocumentSubmitting] = useState(false)

  const [form] = Form.useForm<TenantUtilityReadingFormValues>()
  const [evidenceForm] = Form.useForm<EvidenceFormValues>()
  const [paymentProofForm] = Form.useForm<PaymentProofFormValues>()
  const [tenantDocumentForm] = Form.useForm<TenantDocumentFormValues>()
  const monthValue = Form.useWatch('month', form)
  const electricityPrev = Form.useWatch('electricity_prev', form)
  const electricityCurr = Form.useWatch('electricity_curr', form)
  const waterPrev = Form.useWatch('water_prev', form)
  const waterCurr = Form.useWatch('water_curr', form)

  const electricUsage = useMemo(
    () => calculateReadingUsage(electricityPrev, electricityCurr),
    [electricityCurr, electricityPrev],
  )

  const waterUsage = useMemo(
    () => calculateReadingUsage(waterPrev, waterCurr),
    [waterCurr, waterPrev],
  )

  const currentReading = utilitySnapshot?.current_reading ?? null
  const readingLocked = isTenantUtilityReadingLocked(currentReading?.status)
  const currentRemainingAmount = currentBill ? Math.max(currentBill.total - currentBill.paid_amount, 0) : 0
  const canPayCurrentBill = Boolean(currentBill && currentBill.status !== 'PAID' && currentBill.status !== 'VOID' && currentRemainingAmount > 0)

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
        setCurrentPaymentRequest(null)
        setBillHistory([])
        setUtilitySnapshot(null)
        setTenantDocuments([])
        return
      }

      const selectedMonth = form.getFieldValue('month') || dayjs().format('YYYY-MM')

      const [roommatesData, currentBillData, historyData, documentData] = await Promise.all([
        getMyRoommates(),
        getCurrentMonthBill(),
        listMyRecentBills(),
        listMyDocuments(),
      ])

      setRoommates(roommatesData)
      setTenantDocuments(documentData)
      setCurrentBill(currentBillData)
      if (currentBillData?.payment_request_id) {
        try {
          setCurrentPaymentRequest(await getMyPaymentRequest(currentBillData.payment_request_id))
        } catch {
          setCurrentPaymentRequest(null)
        }
      } else {
        setCurrentPaymentRequest(null)
      }
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

  const handleSubmit = async (values: TenantUtilityReadingFormValues) => {
    if (!context) {
      return
    }

    const validation = validateTenantUtilityReading(values, readingLocked)
    if (!validation.ok) {
      if (validation.reason === 'locked') {
        message.warning('Reading for this month is already approved or invoiced.')
      } else if (validation.reason === 'missing-month') {
        message.error('Vui lòng chọn tháng ghi chỉ số')
      } else {
        message.error('Vui lòng nhập đầy đủ chỉ số điện và nước hiện tại')
      }
      return
    }

    setSubmitting(true)
    try {
      await upsertMyUtilityReading(context.room.id, validation.payload)

      await hydrateFormByMonth(context.room.id, validation.formMonth)
      message.success('Đã ghi nhận chỉ số điện nước thành công')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể lưu chỉ số điện nước')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEvidenceSubmit = async (values: EvidenceFormValues) => {
    if (!context || !currentReading) {
      message.warning('Please submit the monthly reading before adding evidence.')
      return
    }

    setEvidenceSubmitting(true)
    try {
      if (!values.file_url || !values.mime_type || !values.file_size) {
        message.warning('Please upload evidence file before submitting.')
        return
      }

      await attachMyUtilityReadingEvidence(currentReading.id, {
        evidence_type: values.evidence_type,
        file_name: values.file_name?.trim() || null,
        file_url: values.file_url.trim(),
        mime_type: values.mime_type,
        file_size: values.file_size,
        note: values.note?.trim() || null,
      })
      evidenceForm.resetFields()
      evidenceForm.setFieldValue('evidence_type', 'ELECTRIC')
      await hydrateFormByMonth(context.room.id, form.getFieldValue('month'))
      message.success('Evidence metadata uploaded')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to upload evidence metadata')
    } finally {
      setEvidenceSubmitting(false)
    }
  }

  const handlePaymentProofSubmit = async (values: PaymentProofFormValues) => {
    if (!currentPaymentRequest) {
      return
    }

    setPaymentProofSubmitting(true)
    try {
      if (!values.file_url || !values.mime_type || !values.file_size) {
        message.warning('Please upload payment proof before submitting.')
        return
      }

      await submitMyPaymentProof(currentPaymentRequest.id, {
        file_name: values.file_name?.trim() || null,
        file_url: values.file_url.trim(),
        mime_type: values.mime_type,
        file_size: values.file_size,
        transfer_amount: values.transfer_amount ?? null,
        transfer_time: values.transfer_time ? dayjs(values.transfer_time).toISOString() : null,
        payer_note: values.payer_note?.trim() || null,
      })
      paymentProofForm.resetFields()
      await refresh()
      message.success('Payment proof submitted for manager review.')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to submit payment proof.')
    } finally {
      setPaymentProofSubmitting(false)
    }
  }

  const handleVnpayPayment = async () => {
    if (!currentBill) {
      return
    }

    setVnpaySubmitting(true)
    try {
      const checkout = await createMyVnpayPayment(currentBill.id)
      window.location.assign(checkout.redirect_url)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to create VNPAY payment.')
    } finally {
      setVnpaySubmitting(false)
    }
  }

  const handleTenantDocumentSubmit = async (values: TenantDocumentFormValues) => {
    if (!values.file_url || !values.mime_type || !values.file_size) {
      message.warning('Please upload a document file before saving.')
      return
    }

    setTenantDocumentSubmitting(true)
    try {
      await createMyDocument({
        doc_type: values.doc_type,
        file_name: values.file_name?.trim() || null,
        file_url: values.file_url.trim(),
        mime_type: values.mime_type,
        file_size: values.file_size,
        note: values.note?.trim() || null,
      })
      tenantDocumentForm.resetFields()
      tenantDocumentForm.setFieldValue('doc_type', 'IDENTITY_FRONT')
      setTenantDocuments(await listMyDocuments())
      message.success('Document uploaded')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to save document.')
    } finally {
      setTenantDocumentSubmitting(false)
    }
  }

  const openBillDetail = async (invoiceId: string) => {
    setBillDetailOpen(true)
    setBillDetailLoading(true)
    setBillDetail(null)
    try {
      setBillDetail(await getMyInvoiceDetail(invoiceId))
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Unable to load invoice detail.')
      setBillDetailOpen(false)
    } finally {
      setBillDetailLoading(false)
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
                  {currentBill.payment_request_status ? <Tag color={paymentRequestStatusColor[currentBill.payment_request_status]}>Request: {currentBill.payment_request_status}</Tag> : null}
                </Space>
                <Typography.Text type="secondary">Ngày thanh toán: {currentBill.paid_at ? dayjs(currentBill.paid_at).format('DD/MM/YYYY') : '-'}</Typography.Text>
                <Typography.Text type="secondary">Đã thanh toán: {currency.format(currentBill.paid_amount)}</Typography.Text>
                {canPayCurrentBill ? (
                  <Space wrap>
                    <Button type="primary" icon={<CreditCardOutlined />} loading={vnpaySubmitting} onClick={() => void handleVnpayPayment()}>
                      Pay with VNPAY
                    </Button>
                    <Typography.Text type="secondary">Remaining: {currency.format(currentRemainingAmount)}</Typography.Text>
                  </Space>
                ) : null}
                {!currentPaymentRequest ? (
                  <Alert showIcon type="info" message="Chưa có yêu cầu chuyển khoản cho hóa đơn này." />
                ) : (
                  <Card size="small" title="Thanh toán chuyển khoản">
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Descriptions bordered size="small" column={1}>
                        <Descriptions.Item label="Số tiền cần chuyển">{currency.format(currentPaymentRequest.remaining_amount ?? currentPaymentRequest.amount)}</Descriptions.Item>
                        <Descriptions.Item label="Ngân hàng">{currentPaymentRequest.bank_code ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label="Số tài khoản">{currentPaymentRequest.bank_account_no ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label="Chủ tài khoản">{currentPaymentRequest.bank_account_name ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label="Nội dung chuyển khoản">{currentPaymentRequest.transfer_note ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label="Hạn yêu cầu">{currentPaymentRequest.expires_at ? dayjs(currentPaymentRequest.expires_at).format('DD/MM/YYYY HH:mm') : '-'}</Descriptions.Item>
                      </Descriptions>
                      {currentPaymentRequest.qr_image_url ? (
                        <img src={currentPaymentRequest.qr_image_url} alt="Payment QR" style={{ maxWidth: 220, width: '100%', borderRadius: 8 }} />
                      ) : currentPaymentRequest.qr_content ? (
                        <Input.TextArea value={currentPaymentRequest.qr_content} autoSize readOnly />
                      ) : null}
                      {(currentPaymentRequest.status === 'WAITING_TRANSFER' || currentPaymentRequest.status === 'REJECTED') && currentBill.status !== 'PAID' ? (
                        <Form<PaymentProofFormValues> form={paymentProofForm} layout="vertical" onFinish={handlePaymentProofSubmit}>
                          <Row gutter={[12, 0]}>
                            <Col xs={24} md={12}>
                              <Form.Item name="transfer_amount" label="Số tiền đã chuyển">
                                <InputNumber min={1} max={currentPaymentRequest.remaining_amount || undefined} precision={0} style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                              <Form.Item name="transfer_time" label="Thời gian chuyển">
                                <Input type="datetime-local" />
                              </Form.Item>
                            </Col>
                            <Col xs={24}>
                              <Form.Item name="file_url" label="Link ảnh/biên lai" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập link biên lai' }]}>
                                <Input placeholder="https://..." />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                              <Form.Item name="file_name" label="Tên file">
                                <Input />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                              <Form.Item name="mime_type" label="MIME type">
                                <Input placeholder="image/jpeg" />
                              </Form.Item>
                            </Col>
                            <Col xs={24}>
                              <Form.Item label="Upload payment proof">
                                <Space wrap>
                                  <CloudinaryUploadButton
                                    accept={imageAccept}
                                    context="PAYMENT_PROOF"
                                    onUploaded={(file) => paymentProofForm.setFieldsValue(uploadedFileFields(file))}
                                  >
                                    Upload file
                                  </CloudinaryUploadButton>
                                  <Form.Item noStyle shouldUpdate={(prev, next) => prev.file_url !== next.file_url || prev.file_name !== next.file_name}>
                                    {({ getFieldValue }) => {
                                      const fileUrl = getFieldValue('file_url') as string | undefined
                                      const fileName = getFieldValue('file_name') as string | undefined
                                      return fileUrl ? (
                                        <Typography.Link href={fileUrl} target="_blank" rel="noreferrer">
                                          {fileName || 'Uploaded file'}
                                        </Typography.Link>
                                      ) : (
                                        <Typography.Text type="secondary">No file uploaded</Typography.Text>
                                      )
                                    }}
                                  </Form.Item>
                                </Space>
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                              <Form.Item name="file_size" label="Dung lượng file">
                                <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                          </Row>
                          <Form.Item name="payer_note" label="Ghi chú">
                            <Input.TextArea rows={2} />
                          </Form.Item>
                          <Button htmlType="submit" type="primary" loading={paymentProofSubmitting} block={isMobile}>Gửi biên lai</Button>
                        </Form>
                      ) : (
                        <Alert showIcon type={currentPaymentRequest.status === 'TRANSFER_SUBMITTED' ? 'warning' : 'success'} message={currentPaymentRequest.status === 'TRANSFER_SUBMITTED' ? 'Biên lai đang chờ quản lý duyệt.' : 'Yêu cầu thanh toán đang không nhận biên lai mới.'} />
                      )}
                    </Space>
                  </Card>
                )}
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

      <Card title="Personal documents">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Form<TenantDocumentFormValues>
            form={tenantDocumentForm}
            layout="vertical"
            initialValues={{ doc_type: 'IDENTITY_FRONT' }}
            onFinish={handleTenantDocumentSubmit}
          >
            <Row gutter={[16, 8]}>
              <Col xs={24} md={8}>
                <Form.Item name="doc_type" label="Document type" rules={[{ required: true, message: 'Please select document type' }]}>
                  <Select
                    options={(Object.keys(tenantDocumentTypeLabel) as TenantDocumentType[]).map((value) => ({
                      value,
                      label: tenantDocumentTypeLabel[value],
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item name="file_url" hidden rules={[{ required: true, message: 'Please upload document file' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="file_name" hidden>
                  <Input />
                </Form.Item>
                <Form.Item name="mime_type" hidden>
                  <Input />
                </Form.Item>
                <Form.Item name="file_size" hidden>
                  <InputNumber />
                </Form.Item>
                <Form.Item label="File" required>
                  <Space wrap>
                    <CloudinaryUploadButton
                      accept={documentAccept}
                      context="TENANT_DOCUMENT"
                      onUploaded={(file) => tenantDocumentForm.setFieldsValue(uploadedFileFields(file))}
                    >
                      Upload file
                    </CloudinaryUploadButton>
                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.file_url !== next.file_url || prev.file_name !== next.file_name}>
                      {({ getFieldValue }) => {
                        const fileUrl = getFieldValue('file_url') as string | undefined
                        const fileName = getFieldValue('file_name') as string | undefined
                        return fileUrl ? (
                          <Typography.Link href={fileUrl} target="_blank" rel="noreferrer">
                            {fileName || 'Uploaded file'}
                          </Typography.Link>
                        ) : (
                          <Typography.Text type="secondary">No file uploaded</Typography.Text>
                        )
                      }}
                    </Form.Item>
                  </Space>
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item name="note" label="Note">
                  <Input.TextArea rows={2} />
                </Form.Item>
              </Col>
            </Row>
            <Button htmlType="submit" type="primary" loading={tenantDocumentSubmitting} block={isMobile}>
              Save document
            </Button>
          </Form>

          <List
            dataSource={tenantDocuments}
            locale={{ emptyText: 'No documents uploaded.' }}
            renderItem={(item) => (
              <List.Item actions={[<Typography.Link href={item.file_url} target="_blank" rel="noreferrer">Open</Typography.Link>]}>
                <List.Item.Meta
                  title={tenantDocumentTypeLabel[item.doc_type] ?? item.doc_type}
                  description={`${item.file_name ?? 'Uploaded file'} - ${item.mime_type} - ${dayjs(item.uploaded_at).format('DD/MM/YYYY HH:mm')}`}
                />
              </List.Item>
            )}
          />
        </Space>
      </Card>

      <Card title="Chỉ số điện / nước hiện tại">
        {currentReading ? (
          <Alert
            showIcon
            type={currentReading.status === 'REJECTED' ? 'error' : readingLocked ? 'success' : 'info'}
            style={{ marginBottom: 16 }}
            message={
              <Space wrap>
                <span>Status:</span>
                <Tag color={utilityReadingStatusColor[currentReading.status]}>{currentReading.status}</Tag>
                <span>Evidence: {currentReading.evidence_count}</span>
              </Space>
            }
            description={currentReading.rejection_reason ?? undefined}
          />
        ) : null}
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
        <Form<TenantUtilityReadingFormValues>
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

          {readingLocked ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Reading for this month is already approved or invoiced, so it can no longer be changed."
            />
          ) : null}

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

          <Button htmlType="submit" type="primary" loading={submitting} disabled={readingLocked} block={isMobile}>
            Lưu chỉ số tháng
          </Button>
        </Form>
      </Card>

      <Card title="Utility evidence">
        {!currentReading ? (
          <Alert showIcon type="info" message="Submit the monthly reading before attaching evidence." />
        ) : (
          <Form<EvidenceFormValues>
            form={evidenceForm}
            layout="vertical"
            onFinish={handleEvidenceSubmit}
            initialValues={{ evidence_type: 'ELECTRIC' }}
          >
            <Row gutter={[16, 8]}>
              <Col xs={24} md={8}>
                <Form.Item name="evidence_type" label="Evidence type" rules={[{ required: true, message: 'Please select evidence type' }]}>
                  <Select
                    options={[
                      { label: 'Electric', value: 'ELECTRIC' },
                      { label: 'Water', value: 'WATER' },
                      { label: 'Other', value: 'OTHER' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item name="file_url" label="File URL" rules={[{ required: true, whitespace: true, message: 'Please enter file URL' }]}>
                  <Input placeholder="https://..." disabled={currentReading.status === 'INVOICED'} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="file_name" label="File name">
                  <Input disabled={currentReading.status === 'INVOICED'} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="mime_type" label="MIME type">
                  <Input placeholder="image/jpeg" disabled={currentReading.status === 'INVOICED'} />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item label="Upload evidence file">
                  <Space wrap>
                    <CloudinaryUploadButton
                      accept={imageAccept}
                      context="UTILITY_EVIDENCE"
                      disabled={currentReading.status === 'INVOICED'}
                      onUploaded={(file) => evidenceForm.setFieldsValue(uploadedFileFields(file))}
                    >
                      Upload file
                    </CloudinaryUploadButton>
                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.file_url !== next.file_url || prev.file_name !== next.file_name}>
                      {({ getFieldValue }) => {
                        const fileUrl = getFieldValue('file_url') as string | undefined
                        const fileName = getFieldValue('file_name') as string | undefined
                        return fileUrl ? (
                          <Typography.Link href={fileUrl} target="_blank" rel="noreferrer">
                            {fileName || 'Uploaded file'}
                          </Typography.Link>
                        ) : (
                          <Typography.Text type="secondary">No file uploaded</Typography.Text>
                        )
                      }}
                    </Form.Item>
                  </Space>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="file_size" label="File size">
                  <InputNumber min={0} precision={0} style={{ width: '100%' }} disabled={currentReading.status === 'INVOICED'} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="note" label="Evidence note">
              <Input.TextArea rows={2} disabled={currentReading.status === 'INVOICED'} />
            </Form.Item>
            <Space wrap>
              <Tag color={utilityReadingStatusColor[currentReading.status]}>{currentReading.status}</Tag>
              <Typography.Text type="secondary">{currentReading.evidence_count} evidence file(s) submitted</Typography.Text>
            </Space>
            <Button
              htmlType="submit"
              type="primary"
              loading={evidenceSubmitting}
              disabled={currentReading.status === 'INVOICED'}
              block={isMobile}
              style={{ marginTop: 16 }}
            >
              Add evidence metadata
            </Button>
          </Form>
        )}
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
            { title: 'Đã trả', dataIndex: 'paid_amount', align: 'right', render: (value: number) => currency.format(value) },
            { title: 'Hóa đơn', dataIndex: 'status', render: (value: InvoiceSummary['status']) => <Tag color={invoiceStatusColor[value]}>{value}</Tag> },
            {
              title: 'Thanh toán',
              dataIndex: 'payment_status',
              render: (value: InvoiceSummary['payment_status']) => (value ? <Tag color={paymentStatusColor[value]}>{value}</Tag> : '-'),
            },
            { title: 'Ngày thanh toán', dataIndex: 'paid_at', render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY') : '-') },
            {
              title: '',
              key: 'actions',
              width: 72,
              render: (_, row) => <Button size="small" icon={<EyeOutlined />} onClick={() => void openBillDetail(row.id)} />,
            },
          ]}
        />
      </Card>

      <Drawer
        title="Chi tiết hóa đơn"
        placement="right"
        open={billDetailOpen}
        width={isMobile ? '100%' : 720}
        onClose={() => {
          setBillDetailOpen(false)
          setBillDetail(null)
        }}
      >
        {billDetailLoading || !billDetail ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={isMobile ? 1 : 2}>
              <Descriptions.Item label="Kỳ hóa đơn">{dayjs(billDetail.month).format('MM/YYYY')}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái"><Tag color={invoiceStatusColor[billDetail.status]}>{billDetail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Tạm tính">{currency.format(billDetail.subtotal)}</Descriptions.Item>
              <Descriptions.Item label="Giảm trừ">{currency.format(billDetail.discount)}</Descriptions.Item>
              <Descriptions.Item label="Tổng tiền">{currency.format(billDetail.total)}</Descriptions.Item>
              <Descriptions.Item label="Đã trả">{currency.format(billDetail.paid_amount)}</Descriptions.Item>
              <Descriptions.Item label="Hạn thanh toán">{billDetail.due_date ? dayjs(billDetail.due_date).format('DD/MM/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Ngày thanh toán">{billDetail.paid_at ? dayjs(billDetail.paid_at).format('DD/MM/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label="Ghi chú" span={isMobile ? 1 : 2}>{billDetail.note ?? '-'}</Descriptions.Item>
            </Descriptions>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={billDetail.items}
              columns={[
                { title: 'Khoản mục', dataIndex: 'name' },
                { title: 'SL', dataIndex: 'quantity', align: 'right' },
                { title: 'Đơn giá', dataIndex: 'unit_price', align: 'right', render: (value: number) => currency.format(value) },
                { title: 'Thành tiền', dataIndex: 'amount', align: 'right', render: (value: number) => currency.format(value) },
              ]}
            />
            <Card size="small" title="Lịch sử thanh toán">
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={billDetail.payments}
                locale={{ emptyText: <Empty description="Chưa có thanh toán" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                columns={[
                  { title: 'Ngày', dataIndex: 'paid_at', render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-') },
                  { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (value: number) => currency.format(value) },
                  { title: 'Phương thức', dataIndex: 'method' },
                  { title: 'Trạng thái', dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> },
                ]}
              />
            </Card>
          </Space>
        )}
      </Drawer>
    </Space>
  )
}
