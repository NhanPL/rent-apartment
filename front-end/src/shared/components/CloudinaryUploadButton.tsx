import { UploadOutlined } from '@ant-design/icons'
import { Button, Upload, message } from 'antd'
import type { UploadProps } from 'antd'
import type { ReactNode } from 'react'
import { uploadFileToCloudinary, type UploadedCloudinaryFile, type UploadContext } from '../../services/uploadService'

interface CloudinaryUploadButtonProps {
  context: UploadContext
  accept?: string
  disabled?: boolean
  children?: ReactNode
  onUploaded: (file: UploadedCloudinaryFile) => void
}

export function CloudinaryUploadButton({ context, accept, disabled, children, onUploaded }: CloudinaryUploadButtonProps) {
  const customRequest: UploadProps['customRequest'] = async ({ file, onError, onSuccess }) => {
    try {
      const uploaded = await uploadFileToCloudinary(file as File, context)
      onUploaded(uploaded)
      onSuccess?.(uploaded)
      message.success('File uploaded successfully')
    } catch (error) {
      onError?.(error as Error)
      message.error(error instanceof Error ? error.message : 'Unable to upload file')
    }
  }

  return (
    <Upload accept={accept} customRequest={customRequest} disabled={disabled} maxCount={1} showUploadList={false}>
      <Button icon={<UploadOutlined />} disabled={disabled}>
        {children ?? 'Upload file'}
      </Button>
    </Upload>
  )
}
