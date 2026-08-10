import { List, Typography } from 'antd'
import dayjs from 'dayjs'
import type { TenantDocument, TenantDocumentType } from '../../../services/tenantRoomService'

interface Props {
  documents: TenantDocument[]
  labels: Record<TenantDocumentType, string>
}

export function DocumentEvidencePreview({ documents, labels }: Props) {
  return (
    <List
      dataSource={documents}
      locale={{ emptyText: 'No documents uploaded.' }}
      renderItem={(item) => (
        <List.Item actions={[<Typography.Link href={item.file_url} target="_blank" rel="noreferrer">Open</Typography.Link>]}>
          <List.Item.Meta title={labels[item.doc_type] ?? item.doc_type} description={`${item.file_name ?? 'Uploaded file'} - ${item.mime_type} - ${dayjs(item.uploaded_at).format('DD/MM/YYYY HH:mm')}`} />
        </List.Item>
      )}
    />
  )
}
