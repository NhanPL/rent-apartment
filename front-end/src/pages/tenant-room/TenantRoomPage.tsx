import { useI18n } from '../../i18n'
import { TeamOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Descriptions, Drawer, Empty, Form, Grid, Input, InputNumber, List, Row, Select, Skeleton, Space, Table, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import {
  createMyDocument,
  getCurrentAndPreviousUtilityReadings,
  getCurrentMonthBill,
  getMyInvoiceDetail,
  getMyPaymentRequestForInvoice,
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
  type UtilityReadingSnapshot,
  type UtilityReadingStatus,
} from '../../services/tenantRoomService'
import { InvoiceBrandingHeader } from '../../shared/components/InvoiceBrandingHeader'
import type { PaymentRequest, PaymentRequestStatus } from '../../services/paymentsService'
import { CloudinaryUploadButton } from '../../shared/components/CloudinaryUploadButton'
import { uploadFileToCloudinary, type UploadedCloudinaryFile } from '../../services/uploadService'
import { getFormErrorMessage, getUserErrorMessage } from '../../services/errorMessage'
import { vndCurrency } from '../../i18n'
import {
  calculateReadingUsage,
  isTenantUtilityReadingLocked,
  validateTenantUtilityReading,
  type TenantUtilityReadingFormValues,
} from './utilityReadingForm'

import { CurrentInvoice } from './components/CurrentInvoice'
import { DocumentEvidencePreview } from './components/DocumentEvidencePreview'
import { InvoiceHistory } from './components/InvoiceHistory'
import { type PaymentProofFormValues } from './components/PaymentProofForm'
import { RoomContractSummary } from './components/RoomContractSummary'
import { UtilityReadingForm } from './components/UtilityReadingForm'

interface TenantDocumentFormValues {
  doc_type: TenantDocumentType
  file_name?: string
  file_url?: string
  mime_type?: string
  file_size?: number
  note?: string
}

const currency = vndCurrency

const notifyFormFailure = (error: unknown) => {
  message.error(getFormErrorMessage(error))
}

const invoiceStatusColor: Record<InvoiceSummary['status'], string> = {
  DRAFT: 'default',
  ISSUED: 'processing',
  PARTIALLY_PAID: 'gold',
  PAID: 'green',
  VOID: 'red',
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

function VietQrImage({ url, alt, maxWidth }: { url: string; alt: string; maxWidth: number }) {
  const { t } = useI18n()
  const [loadFailed, setLoadFailed] = useState(false)

  if (loadFailed) {
    return (
      <>
      <Alert
        showIcon
        type="error"
        message={t("The VietQR image could not be loaded. Please ask the manager to verify the bank code.")}
      />
      </>
    )
  }

  return (
    <>
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setLoadFailed(true)}
      style={{ display: 'block', maxWidth, width: '100%', margin: '0 auto' }}
    />
    </>
  )
}

export function TenantRoomPage() {
  const { t } = useI18n()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [context, setContext] = useState<Awaited<ReturnType<typeof getMyRoomContext>>>(null)
  const [roommates, setRoommates] = useState<RoommateSummary[]>([])
  const [currentBill, setCurrentBill] = useState<InvoiceSummary | null>(null)
  const [currentPaymentRequest, setCurrentPaymentRequest] = useState<PaymentRequest | null>(null)
  const [currentPaymentRequestError, setCurrentPaymentRequestError] = useState<string | null>(null)
  const [billHistory, setBillHistory] = useState<InvoiceSummary[]>([])
  const [billDetail, setBillDetail] = useState<InvoiceDetail | null>(null)
  const [billDetailPaymentRequest, setBillDetailPaymentRequest] = useState<PaymentRequest | null>(null)
  const [billDetailPaymentRequestError, setBillDetailPaymentRequestError] = useState<string | null>(null)
  const [billDetailOpen, setBillDetailOpen] = useState(false)
  const [billDetailLoading, setBillDetailLoading] = useState(false)
  const [utilitySnapshot, setUtilitySnapshot] = useState<UtilityReadingSnapshot | null>(null)
  const [paymentProofSubmitting, setPaymentProofSubmitting] = useState(false)
  const [paymentProofFile, setPaymentProofFile] = useState<UploadedCloudinaryFile | null>(null)
  const [billDetailPaymentProofSubmitting, setBillDetailPaymentProofSubmitting] = useState(false)
  const [billDetailPaymentProofFile, setBillDetailPaymentProofFile] = useState<UploadedCloudinaryFile | null>(null)
  const [tenantDocuments, setTenantDocuments] = useState<TenantDocument[]>([])
  const [tenantDocumentSubmitting, setTenantDocumentSubmitting] = useState(false)
  const [electricityEvidenceFile, setElectricityEvidenceFile] = useState<File | null>(null)
  const [waterEvidenceFile, setWaterEvidenceFile] = useState<File | null>(null)

  const [form] = Form.useForm<TenantUtilityReadingFormValues>()
  const [paymentProofForm] = Form.useForm<PaymentProofFormValues>()
  const [billDetailPaymentProofForm] = Form.useForm<PaymentProofFormValues>()
  const [tenantDocumentForm] = Form.useForm<TenantDocumentFormValues>()
  const monthValue = Form.useWatch('month', form)
  const electricityPrev = Form.useWatch('electricity_prev', form)
  const electricityCurr = Form.useWatch('electricity_curr', form)
  const electricityMeterReset = Form.useWatch('electricity_meter_reset', form) ?? false
  const waterPrev = Form.useWatch('water_prev', form)
  const waterCurr = Form.useWatch('water_curr', form)
  const waterMeterReset = Form.useWatch('water_meter_reset', form) ?? false

  const electricUsage = useMemo(
    () => calculateReadingUsage(electricityPrev, electricityCurr, electricityMeterReset),
    [electricityCurr, electricityMeterReset, electricityPrev],
  )

  const waterUsage = useMemo(
    () => calculateReadingUsage(waterPrev, waterCurr, waterMeterReset),
    [waterCurr, waterMeterReset, waterPrev],
  )

  const currentReading = utilitySnapshot?.current_reading ?? null
  const readingLocked = isTenantUtilityReadingLocked(currentReading?.status)
  const billDetailRemainingAmount = billDetail ? Math.max(billDetail.total - billDetail.paid_amount, 0) : 0
  const canSubmitBillDetailPaymentProof = Boolean(
    billDetail
    && billDetailPaymentRequest
    && dayjs(billDetail.month).isBefore(dayjs(), 'month')
    && ['ISSUED', 'PARTIALLY_PAID'].includes(billDetail.status)
    && billDetailRemainingAmount > 0
    && ['WAITING_TRANSFER', 'REJECTED'].includes(billDetailPaymentRequest.status),
  )

  const hydrateFormByMonth = async (roomId: string, month: string) => {
    const snapshot = await getCurrentAndPreviousUtilityReadings(roomId, `${month}-01`)
    setUtilitySnapshot(snapshot)
    setElectricityEvidenceFile(null)
    setWaterEvidenceFile(null)
    form.setFieldsValue({
      electricity_prev: snapshot.electricity_prev_value,
      electricity_curr: snapshot.electricity_curr_value,
      water_prev: snapshot.water_prev_value,
      water_curr: snapshot.water_curr_value,
      electricity_meter_reset: snapshot.current_reading?.electricity_meter_reset ?? false,
      water_meter_reset: snapshot.current_reading?.water_meter_reset ?? false,
      meter_reset_note: snapshot.current_reading?.meter_reset_note ?? '',
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
      setCurrentPaymentRequestError(null)
      if (currentBillData) {
        try {
          setCurrentPaymentRequest(await getMyPaymentRequestForInvoice(currentBillData.id))
        } catch (error) {
          setCurrentPaymentRequest(null)
          setCurrentPaymentRequestError(getUserErrorMessage(error, 'The bank transfer QR could not be loaded.'))
        }
      } else {
        setCurrentPaymentRequest(null)
      }
      setBillHistory(historyData)
      await hydrateFormByMonth(roomContext.room.id, selectedMonth)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Unable to load your room information.'))
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

    void hydrateFormByMonth(context.room.id, monthValue).catch((error) => {
      message.error(getUserErrorMessage(error, 'Unable to load utility readings for the selected month.'))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.room.id, monthValue])

  const handleSubmit = async (values: TenantUtilityReadingFormValues) => {
    if (!context) {
      return
    }

    const validation = validateTenantUtilityReading(values, readingLocked)
    if (!validation.ok) {
      if (validation.reason === 'locked') {
        message.warning('This month has already been submitted. You can update it only after the manager rejects it for correction.')
      } else if (validation.reason === 'missing-month') {
        message.error('Vui lòng chọn tháng ghi chỉ số')
      } else if (validation.reason === 'missing-reset-note') {
        message.error('Please explain why the meter was reset or replaced.')
      } else {
        message.error('Vui lòng nhập đầy đủ chỉ số điện và nước hiện tại')
      }
      return
    }

    if (!electricityEvidenceFile || !waterEvidenceFile) {
      message.error('Please select both electricity and water evidence images.')
      return
    }

    setSubmitting(true)
    try {
      const [electricityEvidence, waterEvidence] = await Promise.all([
        uploadFileToCloudinary(electricityEvidenceFile, 'UTILITY_EVIDENCE'),
        uploadFileToCloudinary(waterEvidenceFile, 'UTILITY_EVIDENCE'),
      ])
      await upsertMyUtilityReading(context.room.id, {
        ...validation.payload,
        evidence: {
          electricity: uploadedFileFields(electricityEvidence),
          water: uploadedFileFields(waterEvidence),
        },
      })

      await hydrateFormByMonth(context.room.id, validation.formMonth)
      message.success('Đã ghi nhận chỉ số điện nước thành công')
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the luu chi so dien nuoc.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handlePaymentProofSubmit = async (values: PaymentProofFormValues) => {
    if (!currentPaymentRequest) {
      return
    }

    setPaymentProofSubmitting(true)
    try {
      if (!paymentProofFile) {
        message.warning('Please upload payment proof before submitting.')
        return
      }

      await submitMyPaymentProof(currentPaymentRequest.id, {
        file_name: paymentProofFile.file_name,
        file_url: paymentProofFile.file_url,
        mime_type: paymentProofFile.mime_type,
        file_size: paymentProofFile.file_size,
        transfer_amount: values.transfer_amount ?? null,
        payer_note: values.payer_note?.trim() || null,
      })
      paymentProofForm.resetFields()
      setPaymentProofFile(null)
      await refresh()
      message.success('Payment proof submitted for manager review.')
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the gui chung tu thanh toan.'))
    } finally {
      setPaymentProofSubmitting(false)
    }
  }

  const handleBillDetailPaymentProofSubmit = async (values: PaymentProofFormValues) => {
    if (!billDetail || !billDetailPaymentRequest) {
      return
    }

    if (!billDetailPaymentProofFile) {
      message.warning('Please upload payment proof before submitting.')
      return
    }

    setBillDetailPaymentProofSubmitting(true)
    try {
      await submitMyPaymentProof(billDetailPaymentRequest.id, {
        file_name: billDetailPaymentProofFile.file_name,
        file_url: billDetailPaymentProofFile.file_url,
        mime_type: billDetailPaymentProofFile.mime_type,
        file_size: billDetailPaymentProofFile.file_size,
        transfer_amount: values.transfer_amount ?? null,
        payer_note: values.payer_note?.trim() || null,
      })

      const [updatedDetail, updatedPaymentRequest, updatedHistory] = await Promise.all([
        getMyInvoiceDetail(billDetail.id),
        getMyPaymentRequestForInvoice(billDetail.id),
        listMyRecentBills(),
      ])
      setBillDetail(updatedDetail)
      setBillDetailPaymentRequest(updatedPaymentRequest)
      setBillHistory(updatedHistory)
      billDetailPaymentProofForm.resetFields()
      setBillDetailPaymentProofFile(null)
      message.success('Payment proof submitted for manager review.')
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Unable to submit payment proof.'))
    } finally {
      setBillDetailPaymentProofSubmitting(false)
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
      message.error(getUserErrorMessage(error, 'Khong the luu giay to.'))
    } finally {
      setTenantDocumentSubmitting(false)
    }
  }

  const openBillDetail = async (invoiceId: string) => {
    setBillDetailOpen(true)
    setBillDetailLoading(true)
    setBillDetail(null)
    setBillDetailPaymentRequest(null)
    setBillDetailPaymentRequestError(null)
    setBillDetailPaymentProofFile(null)
    billDetailPaymentProofForm.resetFields()
    try {
      const detail = await getMyInvoiceDetail(invoiceId)
      setBillDetail(detail)
      try {
        const paymentRequest = await getMyPaymentRequestForInvoice(detail.id)
        setBillDetailPaymentRequest(paymentRequest)
        if (paymentRequest) {
          billDetailPaymentProofForm.setFieldsValue({
            transfer_amount: paymentRequest.remaining_amount ?? paymentRequest.amount,
            payer_note: '',
          })
        }
      } catch (error) {
        setBillDetailPaymentRequest(null)
        setBillDetailPaymentRequestError(getUserErrorMessage(error, 'The bank transfer QR could not be loaded.'))
      }
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong tai duoc chi tiet hoa don.'))
      setBillDetailOpen(false)
    } finally {
      setBillDetailLoading(false)
    }
  }

  if (loading) {
    return <Skeleton active paragraph={{ rows: 14 }} />
  }

  if (!context) {
    return <Empty description={t("Không tìm thấy phòng đang ở của tenant hiện tại")} image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <>
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Typography.Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
          {t("Xin chào")} {context.tenant.full_name}
        </Typography.Title>
        <Typography.Text type="secondary">{t("Thông tin phòng hiện tại, hóa đơn tháng và chỉ số điện nước của bạn.")}</Typography.Text>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <RoomContractSummary context={context} compact={isMobile} formatCurrency={(value) => currency.format(value)} />
        </Col>

        <Col xs={24} xl={12}>
          <CurrentInvoice
            invoice={currentBill}
            paymentRequest={currentPaymentRequest}
            paymentRequestError={currentPaymentRequestError}
            form={paymentProofForm}
            proofFile={paymentProofFile}
            proofSubmitting={paymentProofSubmitting}
            compact={isMobile}
            formatCurrency={(value) => currency.format(value)}
            invoiceStatusColor={invoiceStatusColor}
            paymentStatusColor={paymentStatusColor}
            requestStatusColor={paymentRequestStatusColor}
            onProofFileChange={setPaymentProofFile}
            onProofSubmit={handlePaymentProofSubmit}
            onFormFailure={notifyFormFailure}
          />
        </Col>
      </Row>

      <Card title={t("Người đang ở cùng phòng")} extra={<Space><TeamOutlined /><span>{roommates.length} {t("người")}</span></Space>}>
        <List
          dataSource={roommates}
          locale={{ emptyText: t("Không có dữ liệu người ở cùng phòng.") }}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <Space>
                    <span>{item.full_name}</span>
                    {item.is_primary ? <Tag color="blue">{t("Đại diện hợp đồng")}</Tag> : null}
                  </Space>
                }
                description={`Giới tính: ${item.gender ?? '-'} • SĐT: ${item.phone} • Ngày vào ở: ${dayjs(item.joined_at).format('DD/MM/YYYY')}`}
              />
            </List.Item>
          )}
        />
      </Card>

      <Card title={t("Personal documents")}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Form<TenantDocumentFormValues>
            form={tenantDocumentForm}
            layout="vertical"
            initialValues={{ doc_type: 'IDENTITY_FRONT' }}
            onFinish={handleTenantDocumentSubmit}
            onFinishFailed={notifyFormFailure}
          >
            <Row gutter={[16, 8]}>
              <Col xs={24} md={8}>
                <Form.Item name="doc_type" label={t("Document type")} rules={[{ required: true, message: t("Please select document type") }]}>
                  <Select
                    options={(Object.keys(tenantDocumentTypeLabel) as TenantDocumentType[]).map((value) => ({
                      value,
                      label: tenantDocumentTypeLabel[value],
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item name="file_url" hidden rules={[{ required: true, message: t("Please upload document file") }]}>
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
                <Form.Item label={t("File")} required>
                  <Space wrap>
                    <CloudinaryUploadButton
                      accept={documentAccept}
                      context="TENANT_DOCUMENT"
                      onUploaded={(file) => tenantDocumentForm.setFieldsValue(uploadedFileFields(file))}
                    >
                      {t("Upload file")}
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
                          <Typography.Text type="secondary">{t("No file uploaded")}</Typography.Text>
                        )
                      }}
                    </Form.Item>
                  </Space>
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item name="note" label={t("Note")}>
                  <Input.TextArea rows={2} />
                </Form.Item>
              </Col>
            </Row>
            <Button htmlType="submit" type="primary" loading={tenantDocumentSubmitting} block={isMobile}>
              {t("Save document")}
            </Button>
          </Form>

          <DocumentEvidencePreview documents={tenantDocuments} labels={tenantDocumentTypeLabel} />
        </Space>
      </Card>

      <Card title={t("Chỉ số điện / nước hiện tại")}>
        {currentReading ? (
          <Alert
            showIcon
            type={currentReading.status === 'REJECTED' ? 'error' : readingLocked ? 'success' : 'info'}
            style={{ marginBottom: 16 }}
            message={
              <Space wrap>
                <span>{t("Status:")}</span>
                <Tag color={utilityReadingStatusColor[currentReading.status]}>{currentReading.status}</Tag>
                <span>{t("Evidence:")} {currentReading.evidence_count}</span>
                {currentReading.electricity_meter_reset ? <Tag color="orange">{t("Electric meter reset")}</Tag> : null}
                {currentReading.water_meter_reset ? <Tag color="orange">{t("Water meter reset")}</Tag> : null}
              </Space>
            }
            description={currentReading.rejection_reason ?? undefined}
          />
        ) : null}
        {!utilitySnapshot ? (
          <Alert showIcon type="info" message={t("Chưa có dữ liệu chỉ số điện nước.")} />
        ) : (
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card size="small" title={`Điện (${dayjs(utilitySnapshot.month).format('MM/YYYY')})`}>
                <Space direction="vertical" size={2}>
                  <Typography.Text type="secondary">{t("Chỉ số tháng trước:")} {utilitySnapshot.electricity_prev_value ?? '-'}</Typography.Text>
                  <Typography.Text type="secondary">{t("Chỉ số tháng này:")} {utilitySnapshot.electricity_curr_value ?? 'Chưa gửi'}</Typography.Text>
                  <Typography.Text strong>{t("Sản lượng:")} {utilitySnapshot.electricity_usage ?? '-'} {t("kWh")}</Typography.Text>
                </Space>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card size="small" title={`Nước (${dayjs(utilitySnapshot.month).format('MM/YYYY')})`}>
                <Space direction="vertical" size={2}>
                  <Typography.Text type="secondary">{t("Chỉ số tháng trước:")} {utilitySnapshot.water_prev_value ?? '-'}</Typography.Text>
                  <Typography.Text type="secondary">{t("Chỉ số tháng này:")} {utilitySnapshot.water_curr_value ?? 'Chưa gửi'}</Typography.Text>
                  <Typography.Text strong>{t("Sản lượng:")} {utilitySnapshot.water_usage ?? '-'} {t("m³")}</Typography.Text>
                </Space>
              </Card>
            </Col>
          </Row>
        )}
      </Card>

      <UtilityReadingForm
        form={form}
        snapshot={utilitySnapshot}
        electricityUsage={electricUsage}
        waterUsage={waterUsage}
        electricityMeterReset={electricityMeterReset}
        waterMeterReset={waterMeterReset}
        electricityEvidence={electricityEvidenceFile}
        waterEvidence={waterEvidenceFile}
        locked={readingLocked}
        submitting={submitting}
        compact={isMobile}
        onElectricityEvidenceChange={setElectricityEvidenceFile}
        onWaterEvidenceChange={setWaterEvidenceFile}
        onFinish={handleSubmit}
        onFinishFailed={notifyFormFailure}
      />


      <InvoiceHistory
        items={billHistory}
        formatCurrency={(value) => currency.format(value)}
        invoiceStatusColor={invoiceStatusColor}
        paymentStatusColor={paymentStatusColor}
        onOpen={(id) => void openBillDetail(id)}
      />

      <Drawer
        title={t("Chi tiết hóa đơn")}
        placement="right"
        open={billDetailOpen}
        width={isMobile ? '100%' : 720}
        onClose={() => {
          setBillDetailOpen(false)
          setBillDetail(null)
          setBillDetailPaymentRequest(null)
          setBillDetailPaymentProofFile(null)
          billDetailPaymentProofForm.resetFields()
        }}
      >
        {billDetailLoading || !billDetail ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <InvoiceBrandingHeader branding={billDetail.branding} />
            <Descriptions bordered size="small" column={isMobile ? 1 : 2}>
              <Descriptions.Item label={t("Kỳ hóa đơn")}>{dayjs(billDetail.month).format('MM/YYYY')}</Descriptions.Item>
              <Descriptions.Item label={t("Trạng thái")}><Tag color={invoiceStatusColor[billDetail.status]}>{billDetail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label={t("Tạm tính")}>{currency.format(billDetail.subtotal)}</Descriptions.Item>
              <Descriptions.Item label={t("Giảm trừ")}>{currency.format(billDetail.discount)}</Descriptions.Item>
              <Descriptions.Item label={t("Tổng tiền")}>{currency.format(billDetail.total)}</Descriptions.Item>
              <Descriptions.Item label={t("Đã trả")}>{currency.format(billDetail.paid_amount)}</Descriptions.Item>
              <Descriptions.Item label={t("Hạn thanh toán")}>{billDetail.due_date ? dayjs(billDetail.due_date).format('DD/MM/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Ngày thanh toán")}>{billDetail.paid_at ? dayjs(billDetail.paid_at).format('DD/MM/YYYY') : '-'}</Descriptions.Item>
              <Descriptions.Item label={t("Ghi chú")} span={isMobile ? 1 : 2}>{billDetail.note ?? '-'}</Descriptions.Item>
            </Descriptions>
            {billDetailPaymentRequestError ? (
              <Alert showIcon type="error" message={billDetailPaymentRequestError} />
            ) : billDetailPaymentRequest ? (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Typography.Title level={5} style={{ margin: 0 }}>{t("Bank transfer")}</Typography.Title>
                <Descriptions bordered size="small" column={isMobile ? 1 : 2}>
                  <Descriptions.Item label={t("Amount")}>{currency.format(billDetailPaymentRequest.remaining_amount ?? billDetailPaymentRequest.amount)}</Descriptions.Item>
                  <Descriptions.Item label={t("Status")}>
                    <Tag color={paymentRequestStatusColor[billDetailPaymentRequest.status]}>{billDetailPaymentRequest.status}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label={t("Bank")}>{billDetailPaymentRequest.bank_code ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label={t("Account number")}>{billDetailPaymentRequest.bank_account_no ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label={t("Account name")}>{billDetailPaymentRequest.bank_account_name ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label={t("Transfer note")}>{billDetailPaymentRequest.transfer_note ?? '-'}</Descriptions.Item>
                </Descriptions>
                {billDetailPaymentRequest.qr_image_url ? (
                  <VietQrImage
                    key={billDetailPaymentRequest.qr_image_url}
                    url={billDetailPaymentRequest.qr_image_url}
                    alt={`VietQR payment for invoice ${dayjs(billDetail.month).format('MM/YYYY')}`}
                    maxWidth={320}
                  />
                ) : null}
                {canSubmitBillDetailPaymentProof ? (
                  <Form<PaymentProofFormValues>
                    form={billDetailPaymentProofForm}
                    layout="vertical"
                    onFinish={handleBillDetailPaymentProofSubmit}
                    onFinishFailed={notifyFormFailure}
                  >
                    <Form.Item
                      name="transfer_amount"
                      label={t("Amount paid")}
                      rules={[{ required: true, message: t("Please enter the amount paid.") }]}
                    >
                      <InputNumber
                        min={1}
                        max={billDetailPaymentRequest.remaining_amount || undefined}
                        precision={0}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                    <Form.Item label={t("Payment proof")} required>
                      <Space wrap>
                        <CloudinaryUploadButton
                          accept={imageAccept}
                          context="PAYMENT_PROOF"
                          onUploaded={setBillDetailPaymentProofFile}
                        >
                          {t("Upload image")}
                        </CloudinaryUploadButton>
                        {billDetailPaymentProofFile ? (
                          <Typography.Link href={billDetailPaymentProofFile.file_url} target="_blank" rel="noreferrer">
                            {billDetailPaymentProofFile.file_name}
                          </Typography.Link>
                        ) : (
                          <Typography.Text type="secondary">{t("No image uploaded")}</Typography.Text>
                        )}
                      </Space>
                    </Form.Item>
                    <Form.Item name="payer_note" label={t("Notes")}>
                      <Input.TextArea rows={2} />
                    </Form.Item>
                    <Button
                      htmlType="submit"
                      type="primary"
                      loading={billDetailPaymentProofSubmitting}
                      block={isMobile}
                    >
                      {t("Submit payment proof")}
                    </Button>
                  </Form>
                ) : billDetail.status !== 'PAID' && billDetailPaymentRequest.status === 'TRANSFER_SUBMITTED' ? (
                  <Alert showIcon type="warning" message={t("Payment proof is waiting for manager review.")} />
                ) : null}
              </Space>
            ) : billDetail.status !== 'PAID' && billDetailRemainingAmount > 0 ? (
              <Alert showIcon type="info" message={t("No bank transfer request is available for this invoice. Please contact the manager.")} />
            ) : null}
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={billDetail.items}
              columns={[
                { title: t("Khoản mục"), dataIndex: 'name' },
                { title: t("SL"), dataIndex: 'quantity', align: 'right' },
                { title: t("Đơn giá"), dataIndex: 'unit_price', align: 'right', render: (value: number) => currency.format(value) },
                { title: t("Thành tiền"), dataIndex: 'amount', align: 'right', render: (value: number) => currency.format(value) },
              ]}
            />
            <Card size="small" title={t("Lịch sử thanh toán")}>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={billDetail.payments.map((payment) => ({ ...payment, amount: payment.signed_amount }))}
                locale={{ emptyText: <Empty description={t("Chưa có thanh toán")} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                columns={[
                  { title: t("Ngày"), dataIndex: 'paid_at', render: (value: string | null) => (value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-') },
                  { title: t("Số tiền"), dataIndex: 'amount', align: 'right', render: (value: number) => currency.format(value) },
                  { title: t("Phương thức"), dataIndex: 'method' },
                  { title: t("Trạng thái"), dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> },
                ]}
              />
            </Card>
          </Space>
        )}
      </Drawer>
    </Space>
    </>
  )
}
