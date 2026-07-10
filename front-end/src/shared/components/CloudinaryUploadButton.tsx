import { UploadOutlined } from '@ant-design/icons'
import { Button, Upload, message } from 'antd'
import type { UploadProps } from 'antd'
import { useState, type ReactNode } from 'react'
import { uploadFileToCloudinary, type UploadedCloudinaryFile, type UploadContext } from '../../services/uploadService'

interface CloudinaryUploadButtonProps {
  context: UploadContext
  accept?: string
  disabled?: boolean
  children?: ReactNode
  onUploaded: (file: UploadedCloudinaryFile) => void
}

export function CloudinaryUploadButton({ context, accept, disabled, children, onUploaded }: CloudinaryUploadButtonProps) {
  const [uploading, setUploading] = useState(false)

  const customRequest: UploadProps['customRequest'] = async ({ file, onError, onSuccess }) => {
    setUploading(true)
    try {
      const uploaded = await uploadFileToCloudinary(file as File, context)
      onUploaded(uploaded)
      onSuccess?.(uploaded)
      message.success('File uploaded successfully')
    } catch (error) {
      onError?.(error as Error)
      message.error(error instanceof Error ? error.message : 'Unable to upload file')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Upload accept={accept} customRequest={customRequest} disabled={disabled || uploading} maxCount={1} showUploadList={false}>
      <Button icon={<UploadOutlined />} disabled={disabled || uploading} loading={uploading}>
        {children ?? 'Upload file'}
      </Button>
    </Upload>
  )
}
