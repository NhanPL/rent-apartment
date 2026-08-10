import { Button, Card, Empty, Form, Input, InputNumber, Select, Space, Table, Typography } from 'antd'
import type { FormInstance } from 'antd'
import dayjs from 'dayjs'
import { CloudinaryUploadButton } from '../../../shared/components/CloudinaryUploadButton'
import type { UploadedCloudinaryFile } from '../../../services/uploadService'
import type { ContractDocument, ContractDocumentType } from '../types'
import type { ContractDocumentFormValues } from './formTypes'

const labels: Record<ContractDocumentType, string> = {
  SIGNED_SCAN: 'Signed scan', ADDENDUM: 'Addendum', TERMINATION: 'Termination', OTHER: 'Other',
}

interface Props {
  documents: ContractDocument[]
  form: FormInstance<ContractDocumentFormValues>
  saving: boolean
  onSave: () => void
}

const fileFields = (file: UploadedCloudinaryFile) => ({
  file_name: file.file_name, file_url: file.file_url, mime_type: file.mime_type, file_size: file.file_size,
})

export function ContractDocumentManager({ documents, form, saving, onSave }: Props) {
  return (
    <Card size="small" title="Contract documents">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Form<ContractDocumentFormValues> form={form} layout="vertical" initialValues={{ doc_type: 'SIGNED_SCAN' }}>
          <div className="contract-tenant-form">
            <Form.Item name="doc_type" label="Document type" rules={[{ required: true, message: 'Please select document type' }]}><Select options={(Object.keys(labels) as ContractDocumentType[]).map((value) => ({ value, label: labels[value] }))} /></Form.Item>
            <Form.Item name="note" label="Note"><Input /></Form.Item>
            <Form.Item name="file_url" hidden rules={[{ required: true, message: 'Please upload a file' }]}><Input /></Form.Item>
            <Form.Item name="file_name" hidden><Input /></Form.Item>
            <Form.Item name="mime_type" hidden><Input /></Form.Item>
            <Form.Item name="file_size" hidden><InputNumber /></Form.Item>
            <Form.Item label="File" required><Space wrap>
              <CloudinaryUploadButton accept="image/jpeg,image/png,image/webp,application/pdf" context="CONTRACT_DOCUMENT" onUploaded={(file) => form.setFieldsValue(fileFields(file))}>Upload file</CloudinaryUploadButton>
              <Form.Item noStyle shouldUpdate={(prev, next) => prev.file_url !== next.file_url || prev.file_name !== next.file_name}>{({ getFieldValue }) => {
                const fileUrl = getFieldValue('file_url') as string | undefined
                const fileName = getFieldValue('file_name') as string | undefined
                return fileUrl ? <Typography.Link href={fileUrl} target="_blank" rel="noreferrer">{fileName || 'Uploaded file'}</Typography.Link> : <Typography.Text type="secondary">No file uploaded</Typography.Text>
              }}</Form.Item>
            </Space></Form.Item>
            <Button type="primary" loading={saving} onClick={onSave}>Save document</Button>
          </div>
        </Form>
        <Table<ContractDocument> rowKey="id" size="small" pagination={false} dataSource={documents} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No documents uploaded" /> }} columns={[
          { title: 'Type', dataIndex: 'doc_type', render: (value: ContractDocumentType) => labels[value] ?? value },
          { title: 'File', dataIndex: 'file_url', render: (value: string | null, item) => value ? <Typography.Link href={value} target="_blank" rel="noreferrer">{item.file_name ?? 'Open file'}</Typography.Link> : '-' },
          { title: 'Uploaded', dataIndex: 'uploaded_at', render: (value: string | null) => value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-' },
        ]} />
      </Space>
    </Card>
  )
}
