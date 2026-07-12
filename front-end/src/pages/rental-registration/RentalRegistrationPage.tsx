import {
  FileDoneOutlined,
  FileTextOutlined,
  HomeOutlined,
  ReloadOutlined,
  DeleteOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Steps,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addContractDocument,
  deleteContractDocument,
  getContract,
  listBuildings,
  listContracts,
  listTenants,
} from '../../services/contractsService'
import type {
  BuildingOption,
  ContractDetail,
  ContractDocumentType,
  ContractListItem,
  TenantOption,
} from '../contracts/types'
import {
  cancelRegistration,
  handoverContract,
  listAvailableRooms,
  listAvailableTenants,
  reserveRoom,
} from '../../services/rentalRegistrationService'
import type {
  AvailableRoom,
  HandoverPayload,
  ReservePayload,
} from '../../services/rentalRegistrationService'
import { CloudinaryUploadButton } from '../../shared/components/CloudinaryUploadButton'
import { uploadFileToCloudinary, type UploadedCloudinaryFile } from '../../services/uploadService'
import { getUserErrorMessage } from '../../services/errorMessage'
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

type WorkspaceTab = 'reserve' | 'documents' | 'handover'

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
const documentAccept = 'image/jpeg,image/png,image/webp,application/pdf'

const documentTypeOptions: Array<{ label: string; value: ContractDocumentType }> = [
  { label: 'Hop dong scan/PDF', value: 'SIGNED_SCAN' },
  { label: 'Phu luc', value: 'ADDENDUM' },
  { label: 'Giay to khac', value: 'OTHER' },
]

const stageLabels: Record<string, string> = {
  RESERVED: 'Da giu phong',
  WAITING_SIGNATURE: 'Cho ky',
  WAITING_HANDOVER: 'Cho ban giao',
}

const today = () => new Date().toISOString().slice(0, 10)
const nullableText = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

const documentFileKey = (file: File): string => `${file.name}:${file.size}:${file.lastModified}`

export function RentalRegistrationPage() {
  const screens = Grid.useBreakpoint()
  const [reserveForm] = Form.useForm<ReserveFormValues>()
  const [documentForm] = Form.useForm<DocumentFormValues>()
  const [handoverForm] = Form.useForm<HandoverFormValues>()
  const [cancelForm] = Form.useForm<CancelFormValues>()

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('reserve')
  const [buildings, setBuildings] = useState<BuildingOption[]>([])
  const [rooms, setRooms] = useState<AvailableRoom[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [allTenants, setAllTenants] = useState<TenantOption[]>([])
  const [draftContracts, setDraftContracts] = useState<ContractListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [queueLoading, setQueueLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [documentSaving, setDocumentSaving] = useState(false)
  const [handoverSaving, setHandoverSaving] = useState(false)
  const [cancelSaving, setCancelSaving] = useState(false)
  const [documentContract, setDocumentContract] = useState<ContractDetail | null>(null)
  const [documentFiles, setDocumentFiles] = useState<File[]>([])
  const [uploadedDocuments, setUploadedDocuments] = useState<Record<string, UploadedCloudinaryFile>>({})
  const [documentIdsToDelete, setDocumentIdsToDelete] = useState<string[]>([])
  const [handoverContractDetail, setHandoverContractDetail] = useState<ContractDetail | null>(null)
  const [cancelContractTarget, setCancelContractTarget] = useState<ContractListItem | ContractDetail | null>(null)
  const [lastReserved, setLastReserved] = useState<ContractListItem | null>(null)

  const selectedBuildingId = Form.useWatch('building_id', reserveForm)
  const selectedRoomId = Form.useWatch('room_id', reserveForm)
  const tenantMode = Form.useWatch('tenant_mode', reserveForm) ?? 'existing'
  const phoneValue = Form.useWatch('phone', reserveForm)
  const identityValue = Form.useWatch('identity_number', reserveForm)

  const loadOptions = useCallback(async (buildingId?: string) => {
    setLoading(true)
    try {
      const [buildingRows, roomRows, tenantRows, allTenantRows] = await Promise.all([
        listBuildings(),
        listAvailableRooms(buildingId),
        listAvailableTenants(),
        listTenants(),
      ])
      setBuildings(buildingRows)
      setRooms(roomRows)
      setTenants(tenantRows)
      setAllTenants(allTenantRows)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong tai duoc du lieu dang ky.'))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadWorkQueues = useCallback(async () => {
    setQueueLoading(true)
    try {
      const response = await listContracts({ status: 'DRAFT', page: 1, pageSize: 100 })
      setDraftContracts(response.items)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong tai duoc ho so dang cho xu ly.'))
    } finally {
      setQueueLoading(false)
    }
  }, [])

  useEffect(() => {
    reserveForm.setFieldsValue({ tenant_mode: 'existing', billing_day: 1, start_date: today() })
    void Promise.all([loadOptions(), loadWorkQueues()])
  }, [loadOptions, loadWorkQueues, reserveForm])

  useEffect(() => {
    void loadOptions(selectedBuildingId)
    reserveForm.setFieldValue('room_id', undefined)
  }, [loadOptions, reserveForm, selectedBuildingId])

  const duplicateTenants = useMemo(() => {
    const phone = phoneValue?.trim()
    const identity = identityValue?.trim()
    if (!phone && !identity) return []
    return allTenants.filter((tenant) => (
      (phone && tenant.phone === phone) || (identity && tenant.identity_number === identity)
    ))
  }, [allTenants, identityValue, phoneValue])

  const handoverContracts = useMemo(
    () => draftContracts.filter((contract) => contract.business_stage === 'WAITING_HANDOVER'),
    [draftContracts],
  )
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId)

  const resetReserveForm = useCallback(() => {
    reserveForm.resetFields()
    reserveForm.setFieldsValue({ tenant_mode: 'existing', billing_day: 1, start_date: today() })
  }, [reserveForm])

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
      setLastReserved(reserved)
      resetReserveForm()
      await Promise.all([loadOptions(), loadWorkQueues()])
      message.success('Da giu phong. Co the bo sung giay to va ban giao sau.')
    } catch (error: unknown) {
      const formError = error as { errorFields?: Array<{ name: (string | number)[] }> }
      if (!formError.errorFields) {
        message.error(getUserErrorMessage(error, 'Khong the giu phong.'))
      }
    } finally {
      setSaving(false)
    }
  }, [loadOptions, loadWorkQueues, reserveForm, resetReserveForm])

  const openDocument = useCallback(async (contract: ContractListItem) => {
    try {
      const detail = await getContract(contract.id)
      documentForm.resetFields()
      documentForm.setFieldValue('doc_type', 'SIGNED_SCAN')
      setDocumentFiles([])
      setUploadedDocuments({})
      setDocumentIdsToDelete([])
      setDocumentContract(detail)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong tai duoc chi tiet hop dong.'))
    }
  }, [documentForm])

  const submitDocument = useCallback(async () => {
    if (!documentContract) return
    setDocumentSaving(true)
    let savedCount = 0
    let deletedCount = 0
    try {
      const values = await documentForm.validateFields()
      if (documentFiles.length === 0 && documentIdsToDelete.length === 0) {
        message.warning('Khong co thay doi de luu')
        return
      }

      for (const documentId of documentIdsToDelete) {
        await deleteContractDocument(documentContract.id, documentId)
        deletedCount += 1
        setDocumentIdsToDelete((current) => current.filter((id) => id !== documentId))
        setDocumentContract((current) => current ? {
          ...current,
          documents: current.documents.filter((document) => document.id !== documentId),
        } : current)
      }

      for (const file of documentFiles) {
        const key = documentFileKey(file)
        const uploaded = uploadedDocuments[key] ?? await uploadFileToCloudinary(file, 'CONTRACT_DOCUMENT')
        setUploadedDocuments((current) => ({ ...current, [key]: uploaded }))
        await addContractDocument(documentContract.id, {
          doc_type: values.doc_type,
          file_name: nullableText(uploaded.file_name),
          file_url: uploaded.file_url,
          mime_type: uploaded.mime_type,
          file_size: uploaded.file_size,
          note: nullableText(values.note),
        })
        savedCount += 1
        setDocumentFiles((current) => current.filter((item) => documentFileKey(item) !== key))
        setUploadedDocuments((current) => {
          const next = { ...current }
          delete next[key]
          return next
        })
      }

      setDocumentContract(null)
      await loadWorkQueues()
      message.success(`Da them ${savedCount} va xoa ${deletedCount} giay to`)
    } catch (error: unknown) {
      const formError = error as { errorFields?: Array<{ name: (string | number)[] }> }
      if (!formError.errorFields) {
        const reason = getUserErrorMessage(error, 'Khong the luu giay to.')
        const completedCount = savedCount + deletedCount
        message.error(completedCount > 0 ? `Da xu ly ${completedCount} thay doi. Phan con lai loi: ${reason}` : reason)
      }
    } finally {
      setDocumentSaving(false)
    }
  }, [documentContract, documentFiles, documentForm, documentIdsToDelete, loadWorkQueues, uploadedDocuments])

  const openHandover = useCallback(async (contract: ContractListItem) => {
    try {
      const detail = await getContract(contract.id)
      handoverForm.resetFields()
      handoverForm.setFieldsValue({
        move_in_date: today(),
        persons_count: Math.max(detail.active_tenants_count, 1),
        vehicles_count: 0,
      })
      setHandoverContractDetail(detail)
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong tai duoc chi tiet hop dong.'))
    }
  }, [handoverForm])

  const submitHandover = useCallback(async () => {
    if (!handoverContractDetail) return
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
      await handoverContract(handoverContractDetail.id, payload)
      setHandoverContractDetail(null)
      await Promise.all([loadOptions(), loadWorkQueues()])
      message.success('Da kich hoat hop dong va ghi chi so dau ky')
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the ban giao phong.'))
    } finally {
      setHandoverSaving(false)
    }
  }, [handoverContractDetail, handoverForm, loadOptions, loadWorkQueues])

  const openCancel = useCallback((contract: ContractListItem | ContractDetail) => {
    cancelForm.resetFields()
    cancelForm.setFieldsValue({ cancel_date: today() })
    setCancelContractTarget(contract)
  }, [cancelForm])

  const submitCancel = useCallback(async () => {
    if (!cancelContractTarget) return
    setCancelSaving(true)
    try {
      const values = await cancelForm.validateFields()
      if (!values.reason) throw new Error('Vui long nhap ly do huy')
      await cancelRegistration(cancelContractTarget.id, {
        reason: values.reason,
        cancel_date: values.cancel_date,
      })
      setCancelContractTarget(null)
      await Promise.all([loadOptions(), loadWorkQueues()])
      message.success('Da huy dang ky thue phong')
    } catch (error) {
      message.error(getUserErrorMessage(error, 'Khong the huy dang ky.'))
    } finally {
      setCancelSaving(false)
    }
  }, [cancelContractTarget, cancelForm, loadOptions, loadWorkQueues])

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

  const queueBaseColumns: ColumnsType<ContractListItem> = [
    {
      title: 'Hop dong',
      key: 'contract',
      render: (_, contract) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{contract.contract_code ?? contract.id}</Typography.Text>
          <Typography.Text type="secondary">{contract.tenant_names || contract.tenant_name || '-'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Phong',
      key: 'room',
      render: (_, contract) => `${contract.building_name} / ${contract.room_code}`,
    },
    {
      title: 'Du kien vao o',
      dataIndex: 'start_date',
      responsive: ['md'],
    },
    {
      title: 'Trang thai',
      dataIndex: 'business_stage',
      render: (stage: string | undefined) => <Tag color={stage === 'WAITING_HANDOVER' ? 'cyan' : 'gold'}>{stageLabels[stage ?? ''] ?? stage ?? 'DRAFT'}</Tag>,
    },
  ]

  const documentColumns: ColumnsType<ContractListItem> = [
    ...queueBaseColumns,
    {
      title: '',
      key: 'actions',
      width: 220,
      render: (_, contract) => (
        <Space wrap>
          <Button type="primary" icon={<FileTextOutlined />} onClick={() => void openDocument(contract)}>
            Bo sung giay to
          </Button>
          <Button danger icon={<StopOutlined />} onClick={() => openCancel(contract)}>
            Huy
          </Button>
        </Space>
      ),
    },
  ]

  const handoverColumns: ColumnsType<ContractListItem> = [
    ...queueBaseColumns,
    {
      title: '',
      key: 'actions',
      width: 210,
      render: (_, contract) => (
        <Space wrap>
          <Button type="primary" icon={<HomeOutlined />} onClick={() => void openHandover(contract)}>
            Ban giao
          </Button>
          <Button danger icon={<StopOutlined />} onClick={() => openCancel(contract)}>
            Huy
          </Button>
        </Space>
      ),
    },
  ]

  const reserveContent = (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Steps
        size={screens.md ? 'default' : 'small'}
        direction={screens.md ? 'horizontal' : 'vertical'}
        items={[
          { title: 'Phong kha dung', status: selectedRoomId ? 'finish' : 'process' },
          { title: 'Nguoi thue', status: selectedRoomId ? 'process' : 'wait' },
          { title: 'Giu phong', status: 'wait' },
        ]}
      />

      {lastReserved ? (
        <Alert
          type="success"
          showIcon
          closable
          onClose={() => setLastReserved(null)}
          message={`Da giu phong cho ${lastReserved.tenant_names || lastReserved.tenant_name || 'nguoi thue'}`}
          description="Ho so da duoc luu. Ban co the bo sung giay to va ban giao phong vao thoi diem phu hop."
          action={<Button onClick={() => setActiveTab('documents')}>Mo hang doi giay to</Button>}
        />
      ) : null}

      <div className="registration-grid">
        <section className="registration-panel">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Typography.Title level={5}>1. Chon phong kha dung</Typography.Title>
            <Form form={reserveForm} layout="vertical">
              <Form.Item name="building_id" label="Toa nha">
                <Select allowClear options={buildings.map((building) => ({ label: building.name, value: building.id }))} />
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
        </section>

        <section className="registration-panel">
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
                <Select options={[
                  { label: 'Chon tenant da co', value: 'existing' },
                  { label: 'Tao tenant moi', value: 'new' },
                ]} />
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
                  <Form.Item name="full_name" label="Ho ten" rules={[{ required: true, message: 'Vui long nhap ho ten' }]}><Input /></Form.Item>
                  <Form.Item name="phone" label="So dien thoai" rules={[{ required: true, message: 'Vui long nhap so dien thoai' }]}><Input /></Form.Item>
                  <Form.Item name="identity_number" label="CCCD/Ho chieu" rules={[{ required: true, message: 'Vui long nhap CCCD' }]}><Input /></Form.Item>
                  <Form.Item name="email" label="Email"><Input /></Form.Item>
                  <Form.Item name="permanent_address" label="Dia chi thuong tru" className="registration-form-full"><Input /></Form.Item>
                </div>
              )}

              <div className="registration-form-grid">
                <Form.Item name="start_date" label="Ngay du kien vao o" rules={[{ required: true, message: 'Vui long chon ngay' }]}><Input type="date" /></Form.Item>
                <Form.Item name="end_date" label="Ngay ket thuc du kien"><Input type="date" /></Form.Item>
                <Form.Item name="rent_price" label="Gia thue du kien" rules={[{ required: true, message: 'Vui long nhap gia thue' }]}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="deposit_amount" label="Tien coc" rules={[{ required: true, message: 'Vui long nhap tien coc' }]}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="billing_day" label="Ngay chot tien" rules={[{ required: true, message: 'Vui long nhap ngay chot' }]}><InputNumber min={1} max={28} precision={0} style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="note" label="Dieu kien giu phong" className="registration-form-full"><Input.TextArea rows={3} /></Form.Item>
              </div>
            </Form>
            <div className="registration-actions">
              <Button type="primary" icon={<FileDoneOutlined />} loading={saving} onClick={() => void submitReserve()}>
                Tao DRAFT giu phong
              </Button>
            </div>
          </Space>
        </section>
      </div>
    </Space>
  )

  const queueHeader = (title: string, description: string) => (
    <div className="registration-toolbar">
      <div>
        <Typography.Title level={5} style={{ margin: 0 }}>{title}</Typography.Title>
        <Typography.Text type="secondary">{description}</Typography.Text>
      </div>
      <Button icon={<ReloadOutlined />} loading={queueLoading} onClick={() => void loadWorkQueues()}>
        Tai lai
      </Button>
    </div>
  )

  return (
    <div className="rental-registration-page">
      <div className="registration-toolbar registration-page-header">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>Dang ky thue phong</Typography.Title>
          <Typography.Text type="secondary">Giu phong, bo sung ho so va ban giao theo tung thoi diem thuc te.</Typography.Text>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as WorkspaceTab)}
        items={[
          { key: 'reserve', label: 'Giu phong', children: reserveContent },
          {
            key: 'documents',
            label: `Bo sung giay to (${draftContracts.length})`,
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {queueHeader('Ho so dang cho xu ly', 'Chon mot hop dong DRAFT de bo sung giay to khi nguoi thue cung cap.')}
                <Table<ContractListItem>
                  rowKey="id"
                  loading={queueLoading}
                  columns={documentColumns}
                  dataSource={draftContracts}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 820 }}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Khong co ho so cho giay to" /> }}
                />
              </Space>
            ),
          },
          {
            key: 'handover',
            label: `Ban giao phong (${handoverContracts.length})`,
            children: (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {queueHeader('Ho so cho ban giao', 'Chi hien cac hop dong da co ban scan/PDF da ky.')}
                <Table<ContractListItem>
                  rowKey="id"
                  loading={queueLoading}
                  columns={handoverColumns}
                  dataSource={handoverContracts}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 820 }}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Khong co ho so cho ban giao" /> }}
                />
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={Boolean(documentContract)}
        title={`Bo sung giay to - ${documentContract?.contract_code ?? ''}`}
        okText="Luu giay to"
        confirmLoading={documentSaving}
        onCancel={() => {
          setDocumentContract(null)
          setDocumentFiles([])
          setUploadedDocuments({})
          setDocumentIdsToDelete([])
        }}
        onOk={() => void submitDocument()}
        width={680}
        destroyOnHidden
      >
        {documentContract ? (
          <Alert
            type="info"
            showIcon
            message={`${documentContract.building_name} / ${documentContract.room_code}`}
            description={documentContract.tenant_names || documentContract.tenant_name || '-'}
            className="registration-modal-alert"
          />
        ) : null}
        <Form form={documentForm} layout="vertical">
          <div className="registration-form-grid">
            <Form.Item name="doc_type" label="Loai giay to" rules={[{ required: true, message: 'Vui long chon loai giay to' }]}><Select options={documentTypeOptions} /></Form.Item>
            <Form.Item name="note" label="Ghi chu"><Input /></Form.Item>
            <Form.Item label="File" required className="registration-form-full">
              <Space wrap>
                <CloudinaryUploadButton
                  accept={documentAccept}
                  context="CONTRACT_DOCUMENT"
                  deferred
                  disabled={documentSaving}
                  multiple
                  onSelected={(file) => {
                    const key = documentFileKey(file)
                    setDocumentFiles((current) => current.some((item) => documentFileKey(item) === key) ? current : [...current, file])
                  }}
                >
                  Chon nhieu file
                </CloudinaryUploadButton>
                {documentFiles.length === 0 ? <Typography.Text type="secondary">Chua chon file</Typography.Text> : null}
              </Space>
              {documentFiles.length > 0 ? (
                <div className="registration-file-list">
                  {documentFiles.map((file) => {
                    const key = documentFileKey(file)
                    return (
                      <div className="registration-file-row" key={key}>
                        <Typography.Text ellipsis title={file.name}>{file.name}</Typography.Text>
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label={`Xoa ${file.name}`}
                          disabled={documentSaving}
                          onClick={() => {
                            setDocumentFiles((current) => current.filter((item) => documentFileKey(item) !== key))
                            setUploadedDocuments((current) => {
                              const next = { ...current }
                              delete next[key]
                              return next
                            })
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </Form.Item>
          </div>
        </Form>
        <div className="registration-existing-documents">
          <Typography.Title level={5}>Giay to hien co</Typography.Title>
          {documentContract?.documents.some((document) => !documentIdsToDelete.includes(document.id)) ? documentContract.documents.filter((document) => !documentIdsToDelete.includes(document.id)).map((document) => (
            <div className="registration-document-row" key={document.id}>
              <div>
                {document.file_url ? (
                  <Typography.Link href={document.file_url} target="_blank" rel="noreferrer">
                    {document.file_name || document.doc_type}
                  </Typography.Link>
                ) : <Typography.Text>{document.file_name || document.doc_type}</Typography.Text>}
                <div><Tag>{document.doc_type}</Tag></div>
              </div>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={`Xoa ${document.file_name || document.doc_type}`}
                disabled={documentSaving}
                onClick={() => setDocumentIdsToDelete((current) => current.includes(document.id) ? current : [...current, document.id])}
              />
            </div>
          )) : <Typography.Text type="secondary">Chua co giay to</Typography.Text>}
        </div>
      </Modal>

      <Modal
        open={Boolean(handoverContractDetail)}
        title={`Ban giao phong - ${handoverContractDetail?.contract_code ?? ''}`}
        okText="Ban giao va kich hoat"
        okButtonProps={{ icon: <HomeOutlined /> }}
        confirmLoading={handoverSaving}
        onCancel={() => setHandoverContractDetail(null)}
        onOk={() => void submitHandover()}
        width={720}
        destroyOnHidden
      >
        {handoverContractDetail ? (
          <Alert
            type="info"
            showIcon
            message={`${handoverContractDetail.building_name} / ${handoverContractDetail.room_code}`}
            description={handoverContractDetail.tenant_names || handoverContractDetail.tenant_name || '-'}
            className="registration-modal-alert"
          />
        ) : null}
        <Form form={handoverForm} layout="vertical">
          <div className="registration-form-grid">
            <Form.Item name="move_in_date" label="Ngay nhan phong thuc te" rules={[{ required: true, message: 'Vui long chon ngay' }]}><Input type="date" /></Form.Item>
            <Form.Item name="persons_count" label="So nguoi" rules={[{ required: true, message: 'Vui long nhap so nguoi' }]}><InputNumber min={1} precision={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="vehicles_count" label="So xe" rules={[{ required: true, message: 'Vui long nhap so xe' }]}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="electricity_curr" label="Chi so dien dau ky" rules={[{ required: true, message: 'Vui long nhap chi so dien' }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="water_curr" label="Chi so nuoc dau ky" rules={[{ required: true, message: 'Vui long nhap chi so nuoc' }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="note" label="Tinh trang phong/ghi chu" className="registration-form-full"><Input.TextArea rows={3} /></Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        open={Boolean(cancelContractTarget)}
        title={`Huy dang ky - ${cancelContractTarget?.contract_code ?? ''}`}
        okText="Huy dang ky"
        okButtonProps={{ danger: true }}
        confirmLoading={cancelSaving}
        onCancel={() => setCancelContractTarget(null)}
        onOk={() => void submitCancel()}
        destroyOnHidden
      >
        <Form form={cancelForm} layout="vertical">
          <Form.Item name="cancel_date" label="Ngay huy"><Input type="date" /></Form.Item>
          <Form.Item name="reason" label="Ly do huy" rules={[{ required: true, message: 'Bat buoc nhap ly do huy' }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
