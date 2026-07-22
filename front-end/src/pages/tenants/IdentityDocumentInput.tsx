import { DeleteOutlined, IdcardOutlined } from '@ant-design/icons'
import { Button, Image, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import type { TenantIdentityDocument, TenantIdentityDocumentFilePayload } from './types'
import { CloudinaryUploadButton } from '../../shared/components/CloudinaryUploadButton'
import { Localized } from '../../shared/components/Localized'

export type IdentityDocumentValue = TenantIdentityDocument | TenantIdentityDocumentFilePayload | File | null

interface IdentityDocumentInputProps {
  value?: IdentityDocumentValue
  onChange?: (value: IdentityDocumentValue) => void
  disabled?: boolean
}

const isFile = (value: IdentityDocumentValue | undefined): value is File => (
  typeof File !== 'undefined' && value instanceof File
)

export function IdentityDocumentInput({ value = null, onChange, disabled }: IdentityDocumentInputProps) {
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isFile(value)) return
    let active = true
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (active) setLocalPreviewUrl(typeof reader.result === 'string' ? reader.result : null)
    })
    reader.readAsDataURL(value)
    return () => {
      active = false
      reader.abort()
    }
  }, [value])

  const previewUrl = isFile(value) ? localPreviewUrl : value?.file_url ?? null
  const fileName = isFile(value) ? value.name : value?.file_name

  return (
    <Localized>
    <div className="tenant-identity-image-input">
      <div className="tenant-identity-image-preview">
        {previewUrl ? (
          <Image src={previewUrl} alt={fileName || 'Identity card'} preview={!isFile(value)} />
        ) : (
          <div className="tenant-identity-image-empty">
            <IdcardOutlined />
            <Typography.Text type="secondary">No image selected</Typography.Text>
          </div>
        )}
      </div>
      <Space wrap>
        <CloudinaryUploadButton
          deferred
          context="TENANT_DOCUMENT"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          onSelected={(file) => onChange?.(file)}
        >
          {value ? 'Replace image' : 'Select image'}
        </CloudinaryUploadButton>
        {value ? (
          <Button
            danger
            icon={<DeleteOutlined />}
            aria-label="Remove image"
            disabled={disabled}
            onClick={() => onChange?.(null)}
          />
        ) : null}
      </Space>
      {fileName ? <Typography.Text type="secondary" ellipsis={{ tooltip: fileName }}>{fileName}</Typography.Text> : null}
    </div>
    </Localized>
  )
}
