import { FileDoneOutlined, HomeOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Empty, Form, Grid, Input, InputNumber, Modal, Select, Space, Steps, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { addContractDocument, getContract, listBuildings, listTenants } from '../../services/contractsService'
import type { BuildingOption, ContractDetail, ContractDocumentType, TenantOption } from '../contracts/types'
import { cancelRegistration, handoverContract, listAvailableRooms, reserveRoom } from '../../services/rentalRegistrationService'
import type { AvailableRoom, HandoverPayload, ReservePayload } from '../../services/rentalRegistrationService'
import { CloudinaryUploadButton } from '../../shared/components/CloudinaryUploadButton'
import type { UploadedCloudinaryFile } from '../../services/uploadService'
import './RentalRegistrationPage.css'

interface ReserveFormValues {
  building_id?: string
  room_id?: string
  tenant_mode: 'existing' | 'new'
  tenant_id?: string
  full_name?: string
  phone?: string
  identity_number?: string
  email?: string
  permanent_address?: string
  start_date?: string
  end_date?: string
  rent_price?: number
  deposit_amount?: number
  billing_day?: number
  note?: string
}

interface DocumentFormValues {
  doc_type: ContractDocumentType
  file_name?: string
  file_url?: string
  mime_type?: string
  file_size?: number
  note?: string
}

interface HandoverFormValues {
  move_in_date?: string
  electricity_curr?: number
  water_curr?: number
  persons_count?: number
  vehicles_count?: number
  note?: string
}

interface CancelFormValues {
  reason?: string
  cancel_date?: string
}

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
const documentAccept = 'image/jpeg,image/png,image/webp,application/pdf'

const documentTypeOptions: Array<{ label: string; value: ContractDocumentType }> = [
  { label: 'Hop dong scan/PDF', value: 'SIGNED_SCAN' },
  { label: 'Phu luc', value: 'ADDENDUM' },
  { label: 'Giay to khac', value: 'OTHER' },
]

const today = () => new Date().toISOString().slice(0, 10)
const nullableText = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

const uploadedFileFields = (file: UploadedCloudinaryFile) => ({
  file_name: file.file_name,
  file_url: file.file_url,
  mime_type: file.mime_type,
  file_size: file.file_size,
})

export function RentalRegistrationPage() {
  const screens = Grid.useBreakpoint()
  const [reserveForm] = Form.useForm<ReserveFormValues>()
  const [documentForm] = Form.useForm<DocumentFormValues>()
  const [handoverForm] = Form.useForm<HandoverFormValues>()
  const [cancelForm] = Form.useForm<CancelFormValues>()

  const [buildings, setBuildings] = useState<BuildingOption[]>([])
  const [rooms, setRooms] = useState<AvailableRoom[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [documentSaving, setDocumentSaving] = useState(false)
  const [handoverSaving, setHandoverSaving] = useState(false)
  const [cancelSaving, setCancelSaving] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [contract, setContract] = useState<ContractDetail | null>(null)

  const selectedBuildingId = Form.useWatch('building_id', reserveForm)
  const selectedRoomId = Form.useWatch('room_id', reserveForm)
  const tenantMode = Form.useWatch('tenant_mode', reserveForm) ?? 'existing'
  const phoneValue = Form.useWatch('phone', reserveForm)
  const identityValue = Form.useWatch('identity_number', reserveForm)

  const loadOptions = useCallback(async (buildingId?: string) => {
    setLoading(true)
    try {
      const [buildingRows, roomRows, tenantRows] = await Promise.all([
        listBuildings(),
        listAvailableRooms(buildingId),
        listTenants(),
      ])
      setBuildings(buildingRows)
      setRooms(roomRows)
      setTenants(tenantRows)
    } catch {
      message.error('Khong tai duoc du lieu dang ky')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reserveForm.setFieldsValue({ tenant_mode: 'existing', billing_day: 1, start_date: today() })
    documentForm.setFieldsValue({ doc_type: 'SIGNED_SCAN' })
    handoverForm.setFieldsValue({ move_in_date: today(), persons_count: 1, vehicles_count: 0 })
    void loadOptions()
  }, [documentForm, handoverForm, loadOptions, reserveForm])

  useEffect(() => {
    void loadOptions(selectedBuildingId)
    reserveForm.setFieldValue('room_id', undefined)
  }, [loadOptions, reserveForm, selectedBuildingId])

  const duplicateTenants = useMemo(() => {
    const phone = phoneValue?.trim()
    const identity = identityValue?.trim()
    if (!phone && !identity) return []
    return tenants.filter((tenant) => (
      (phone && tenant.phone === phone) || (identity && tenant.identity_number === identity)
    ))
  }, [identityValue, phoneValue, tenants])

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId)

  const refreshContract = useCallback(async (contractId: string) => {
    const detail = await getContract(contractId)
    setContract(detail)
  }, [])

  const submitReserve = useCallback(async () => {
    setSaving(true)
    try {
      const values = await reserveForm.validateFields()
      if (!values.room_id || !values.start_date || !values.rent_price || values.deposit_amount === undefined || !values.billing_day) {
        throw new Error('Missing reservation fields')
      }
      const payload: ReservePayload = {
        room_id: values.room_id,
        start_date: values.start_date,
        end_date: values.end_date ?? null,
        rent_price: values.rent_price,
        deposit_amount: values.deposit_amount,
        billing_day: values.billing_day,
        note: nullableText(values.note),
      }

      if (values.tenant_mode === 'new') {
        if (!values.full_name || !values.phone || !values.identity_number) {
          throw new Error('Vui long nhap du thong tin tenant moi')
        }
        payload.tenant = {
          full_name: values.full_name,
          phone: values.phone,
          identity_number: values.identity_number,
          email: nullableText(values.email),
          permanent_address: nullableText(values.permanent_address),
        }
      } else if (values.tenant_id) {
        payload.tenant_id = values.tenant_id
      } else {
        throw new Error('Vui long chon tenant')
      }

      const reserved = await reserveRoom(payload)
      await refreshContract(reserved.id)
      message.success('Da tao hop dong nhap de giu phong')
      await loadOptions(selectedBuildingId)
    } catch (error: unknown) {
      const formError = error as { errorFields?: Array<{ name: (string | number)[] }> }
      if (!formError.errorFields) {
        message.error(error instanceof Error ? error.message : 'Khong the giu phong')
      }
    } finally {
      setSaving(false)
    }
  }, [loadOptions, refreshContract, reserveForm, selectedBuildingId])

  const submitDocument = useCallback(async () => {
    if (!contract) return
    setDocumentSaving(true)
    try {
      const values = await documentForm.validateFields()
      if (!values.file_url || !values.mime_type || !values.file_size) {
        message.warning('Vui long upload file truoc')
        return
      }
      await addContractDocument(contract.id, {
        doc_type: values.doc_type,
        file_name: nullableText(values.file_name),
        file_url: values.file_url,
        mime_type: values.mime_type,
        file_size: values.file_size,
        note: nullableText(values.note),
      })
      documentForm.resetFields()
      documentForm.setFieldValue('doc_type', 'SIGNED_SCAN')
      await refreshContract(contract.id)
      message.success('Da luu giay to hop dong')
    } catch {
      message.error('Khong the luu giay to')
    } finally {
      setDocumentSaving(false)
    }
  }, [contract, documentForm, refreshContract])

  const submitHandover = useCallback(async () => {
    if (!contract) return
    setHandoverSaving(true)
    try {
      const values = await handoverForm.validateFields()
      if (!values.move_in_date || values.electricity_curr === undefined || values.water_curr === undefined || values.persons_count === undefined || values.vehicles_count === undefined) {
        throw new Error('Vui long nhap du thong tin ban giao')
      }
      const payload: HandoverPayload = {
        move_in_date: values.move_in_date,
        electricity_curr: values.electricity_curr,
        water_curr: values.water_curr,
        persons_count: values.persons_count,
        vehicles_count: values.vehicles_count,
        note: nullableText(values.note),
      }
      await handoverContract(contract.id, payload)
      await refreshContract(contract.id)
      message.success('Da kich hoat hop dong va ghi chi so dau ky')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Khong the ban giao phong')
    } finally {
      setHandoverSaving(false)
    }
  }, [contract, handoverForm, refreshContract])

  const submitCancel = useCallback(async () => {
    if (!contract) return
    setCancelSaving(true)
    try {
      const values = await cancelForm.validateFields()
      if (!values.reason) throw new Error('Vui long nhap ly do huy')
      await cancelRegistration(contract.id, {
        reason: values.reason,
        cancel_date: values.cancel_date,
      })
      await refreshContract(contract.id)
      setCancelOpen(false)
      message.success('Da huy dang ky thue phong')
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Khong the huy dang ky')
    } finally {
      setCancelSaving(false)
    }
  }, [cancelForm, contract, refreshContract])

  const roomColumns: ColumnsType<AvailableRoom> = [
    {
      title: 'Phong',
      dataIndex: 'code',
      render: (value: string, room) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary">{room.building_name}</Typography.Text>
        </Space>
      ),
    },
    { title: 'Tang', dataIndex: 'floor', responsive: ['md'], render: (value: number | null) => value ?? '-' },
    { title: 'Suc chua', dataIndex: 'max_occupants', responsive: ['sm'] },
    { title: 'Gia goi y', dataIndex: 'base_rent', render: (value: number) => currency.format(value) },
    {
      title: '',
      key: 'action',
      width: 96,
      render: (_, room) => (
        <Button
          size="small"
          type={selectedRoomId === room.id ? 'primary' : 'default'}
          onClick={() => {
            reserveForm.setFieldsValue({
              building_id: room.building_id,
              room_id: room.id,
              rent_price: room.base_rent,
              deposit_amount: room.deposit_default,
            })
          }}
        >
          Chon
        </Button>
      ),
    },
  ]

  const steps = [
    { title: 'Phong kha dung', status: selectedRoomId ? 'finish' : 'process' },
    { title: 'Nguoi thue', status: contract ? 'finish' : selectedRoomId ? 'process' : 'wait' },
    { title: 'Giu phong', status: contract ? 'finish' : 'wait' },
    { title: 'Giay to', status: contract?.documents.length ? 'finish' : contract ? 'process' : 'wait' },
    { title: 'Ban giao', status: contract?.status === 'ACTIVE' ? 'finish' : contract ? 'process' : 'wait' },
  ] as const

  return (
    <div className="rental-registration-page">
      <Card className="registration-shell">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className="registration-toolbar">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>Dang ky thue phong</Typography.Title>
              <Typography.Text type="secondary">Tiep nhan, giu phong, luu giay to va kich hoat hop dong sau ban giao.</Typography.Text>
            </div>
            <Button icon={<ReloadOutlined />} onClick={() => void loadOptions(selectedBuildingId)} loading={loading}>
              Tai lai
            </Button>
          </div>

          <Steps
            size={screens.md ? 'default' : 'small'}
            direction={screens.md ? 'horizontal' : 'vertical'}
            items={steps.map((step) => ({ title: step.title, status: step.status }))}
          />

          <div className="registration-grid">
            <div className="registration-panel">
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Typography.Title level={5}>1. Chon phong kha dung</Typography.Title>
                <Form form={reserveForm} layout="vertical">
                  <Form.Item name="building_id" label="Toa nha">
                    <Select
                      allowClear
                      options={buildings.map((building) => ({ label: building.name, value: building.id }))}
                    />
                  </Form.Item>
                  <Form.Item name="room_id" hidden rules={[{ required: true, message: 'Vui long chon phong' }]}>
                    <Input />
                  </Form.Item>
                </Form>
                <Table<AvailableRoom>
                  rowKey="id"
                  loading={loading}
                  columns={roomColumns}
                  dataSource={rooms}
                  pagination={{ pageSize: 6 }}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Khong co phong kha dung" /> }}
                />
              </Space>
            </div>

            <div className="registration-panel">
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Typography.Title level={5}>2. Ho so nguoi thue va giu phong</Typography.Title>
                {selectedRoom ? (
                  <Alert
                    type="info"
                    showIcon
                    message={`Phong ${selectedRoom.code} - ${selectedRoom.building_name}`}
                    description={`Gia goi y ${currency.format(selectedRoom.base_rent)}, coc ${currency.format(selectedRoom.deposit_default)}, suc chua ${selectedRoom.max_occupants} nguoi.`}
                  />
                ) : null}
                {duplicateTenants.length > 0 && tenantMode === 'new' ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="Co the bi trung tenant"
                    description={duplicateTenants.map((tenant) => `${tenant.full_name} (${tenant.phone ?? '-'} / ${tenant.identity_number ?? '-'})`).join(', ')}
                  />
                ) : null}

                <Form form={reserveForm} layout="vertical">
                  <Form.Item name="tenant_mode" label="Nguoi thue">
                    <Select
                      options={[
                        { label: 'Chon tenant da co', value: 'existing' },
                        { label: 'Tao tenant moi', value: 'new' },
                      ]}
                    />
                  </Form.Item>

                  {tenantMode === 'existing' ? (
                    <Form.Item name="tenant_id" label="Tenant" rules={[{ required: true, message: 'Vui long chon tenant' }]}>
                      <Select
                        showSearch
                        optionFilterProp="label"
                        options={tenants.map((tenant) => ({
                          label: `${tenant.full_name} - ${tenant.phone ?? tenant.email ?? ''}`,
                          value: tenant.id,
                          disabled: tenant.status === 'BLACKLIST',
                        }))}
                      />
                    </Form.Item>
                  ) : (
                    <div className="registration-form-grid">
                      <Form.Item name="full_name" label="Ho ten" rules={[{ required: true, message: 'Vui long nhap ho ten' }]}>
                        <Input />
                      </Form.Item>
                      <Form.Item name="phone" label="So dien thoai" rules={[{ required: true, message: 'Vui long nhap so dien thoai' }]}>
                        <Input />
                      </Form.Item>
                      <Form.Item name="identity_number" label="CCCD/Ho chieu" rules={[{ required: true, message: 'Vui long nhap CCCD' }]}>
                        <Input />
                      </Form.Item>
                      <Form.Item name="email" label="Email">
                        <Input />
                      </Form.Item>
                      <Form.Item name="permanent_address" label="Dia chi thuong tru" className="registration-form-full">
                        <Input />
                      </Form.Item>
                    </div>
                  )}

                  <div className="registration-form-grid">
                    <Form.Item name="start_date" label="Ngay du kien vao o" rules={[{ required: true, message: 'Vui long chon ngay' }]}>
                      <Input type="date" />
                    </Form.Item>
                    <Form.Item name="end_date" label="Ngay ket thuc du kien">
                      <Input type="date" />
                    </Form.Item>
                    <Form.Item name="rent_price" label="Gia thue du kien" rules={[{ required: true, message: 'Vui long nhap gia thue' }]}>
                      <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="deposit_amount" label="Tien coc" rules={[{ required: true, message: 'Vui long nhap tien coc' }]}>
                      <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="billing_day" label="Ngay chot tien" rules={[{ required: true, message: 'Vui long nhap ngay chot' }]}>
                      <InputNumber min={1} max={28} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="note" label="Dieu kien giu phong" className="registration-form-full">
                      <Input.TextArea rows={3} />
                    </Form.Item>
                  </div>
                </Form>
                <div className="registration-actions">
                  <Button type="primary" icon={<FileDoneOutlined />} loading={saving} onClick={() => void submitReserve()}>
                    Tao DRAFT giu phong
                  </Button>
                </div>
              </Space>
            </div>
          </div>

          {contract ? (
            <div className="registration-panel">
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <div className="registration-toolbar">
                  <div>
                    <Typography.Title level={5} style={{ margin: 0 }}>Hop dong dang xu ly</Typography.Title>
                    <Typography.Text type="secondary">
                      {contract.contract_code ?? contract.id} - {contract.building_name} / {contract.room_code}
                    </Typography.Text>
                  </div>
                  <Space wrap>
                    <Tag color={contract.status === 'ACTIVE' ? 'green' : contract.status === 'CANCELLED' ? 'red' : 'gold'}>
                      {contract.business_stage ?? contract.status}
                    </Tag>
                    {contract.status === 'DRAFT' ? (
                      <Button danger icon={<StopOutlined />} onClick={() => {
                        cancelForm.setFieldsValue({ cancel_date: today() })
                        setCancelOpen(true)
                      }}>
                        Huy dang ky
                      </Button>
                    ) : null}
                  </Space>
                </div>

                <div className="registration-grid">
                  <div>
                    <Typography.Title level={5}>4. Upload giay to</Typography.Title>
                    <Form form={documentForm} layout="vertical">
                      <div className="registration-form-grid">
                        <Form.Item name="doc_type" label="Loai giay to" rules={[{ required: true, message: 'Vui long chon loai giay to' }]}>
                          <Select options={documentTypeOptions} />
                        </Form.Item>
                        <Form.Item name="note" label="Ghi chu">
                          <Input />
                        </Form.Item>
                        <Form.Item name="file_url" hidden rules={[{ required: true, message: 'Vui long upload file' }]}>
                          <Input />
                        </Form.Item>
                        <Form.Item name="file_name" hidden><Input /></Form.Item>
                        <Form.Item name="mime_type" hidden><Input /></Form.Item>
                        <Form.Item name="file_size" hidden><InputNumber /></Form.Item>
                        <Form.Item label="File" required className="registration-form-full">
                          <Space wrap>
                            <CloudinaryUploadButton
                              accept={documentAccept}
                              context="CONTRACT_DOCUMENT"
                              onUploaded={(file) => documentForm.setFieldsValue(uploadedFileFields(file))}
                            >
                              Upload file
                            </CloudinaryUploadButton>
                            <Form.Item noStyle shouldUpdate={(prev, next) => prev.file_url !== next.file_url || prev.file_name !== next.file_name}>
                              {({ getFieldValue }) => {
                                const fileUrl = getFieldValue('file_url') as string | undefined
                                const fileName = getFieldValue('file_name') as string | undefined
                                return fileUrl ? (
                                  <Typography.Link href={fileUrl} target="_blank" rel="noreferrer">
                                    {fileName || 'File da upload'}
                                  </Typography.Link>
                                ) : (
                                  <Typography.Text type="secondary">Chua co file</Typography.Text>
                                )
                              }}
                            </Form.Item>
                          </Space>
                        </Form.Item>
                      </div>
                    </Form>
                    <Button type="primary" loading={documentSaving} onClick={() => void submitDocument()}>
                      Luu giay to
                    </Button>
                  </div>

                  <div>
                    <Typography.Title level={5}>5. Ban giao va kich hoat</Typography.Title>
                    <Form form={handoverForm} layout="vertical" disabled={contract.status !== 'DRAFT'}>
                      <div className="registration-form-grid">
                        <Form.Item name="move_in_date" label="Ngay nhan phong thuc te" rules={[{ required: true, message: 'Vui long chon ngay' }]}>
                          <Input type="date" />
                        </Form.Item>
                        <Form.Item name="persons_count" label="So nguoi" rules={[{ required: true, message: 'Vui long nhap so nguoi' }]}>
                          <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="vehicles_count" label="So xe" rules={[{ required: true, message: 'Vui long nhap so xe' }]}>
                          <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="electricity_curr" label="Chi so dien dau ky" rules={[{ required: true, message: 'Vui long nhap chi so dien' }]}>
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="water_curr" label="Chi so nuoc dau ky" rules={[{ required: true, message: 'Vui long nhap chi so nuoc' }]}>
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="note" label="Tinh trang phong/ghi chu" className="registration-form-full">
                          <Input.TextArea rows={3} />
                        </Form.Item>
                      </div>
                    </Form>
                    <Button
                      type="primary"
                      icon={<HomeOutlined />}
                      disabled={contract.status !== 'DRAFT'}
                      loading={handoverSaving}
                      onClick={() => void submitHandover()}
                    >
                      Ban giao va kich hoat
                    </Button>
                  </div>
                </div>
              </Space>
            </div>
          ) : null}
        </Space>
      </Card>

      <Modal
        open={cancelOpen}
        title="Huy dang ky thue phong"
        okText="Huy dang ky"
        okButtonProps={{ danger: true }}
        confirmLoading={cancelSaving}
        onCancel={() => setCancelOpen(false)}
        onOk={() => void submitCancel()}
        destroyOnClose
      >
        <Form form={cancelForm} layout="vertical">
          <Form.Item name="cancel_date" label="Ngay huy">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="reason" label="Ly do huy" rules={[{ required: true, message: 'Bat buoc nhap ly do huy' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
