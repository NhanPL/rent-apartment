import { UploadOutlined } from '@ant-design/icons'
import { Button, Upload, message } from 'antd'
import type { UploadProps } from 'antd'
import { useState, type ReactNode } from 'react'
import { uploadFileToCloudinary, type UploadedCloudinaryFile, type UploadContext } from '../../services/uploadService'
import { getUserErrorMessage } from '../../services/errorMessage'

interface CloudinaryUploadButtonBaseProps {
  context: UploadContext
  accept?: string
  disabled?: boolean
  multiple?: boolean
  children?: ReactNode
}

type CloudinaryUploadButtonProps = CloudinaryUploadButtonBaseProps & (
  | { deferred: true; onSelected: (file: File) => void; onUploaded?: never }
  | { deferred?: false; onUploaded: (file: UploadedCloudinaryFile) => void; onSelected?: never }
)

export function CloudinaryUploadButton(props: CloudinaryUploadButtonProps) {
  const { context, accept, disabled, multiple = false, children } = props
  const [uploading, setUploading] = useState(false)

  const customRequest: UploadProps['customRequest'] = async ({ file, onError, onSuccess }) => {
    if (props.deferred) return
    setUploading(true)
    try {
      const uploaded = await uploadFileToCloudinary(file as File, context)
      props.onUploaded(uploaded)
      onSuccess?.(uploaded)
      message.success('File uploaded successfully')
    } catch (error) {
      onError?.(error as Error)
      message.error(getUserErrorMessage(error, 'Khong the tai file len.'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Upload
      accept={accept}
      beforeUpload={props.deferred ? (file) => {
        props.onSelected(file as File)
        return false
      } : undefined}
      customRequest={customRequest}
      disabled={disabled || uploading}
      maxCount={multiple ? undefined : 1}
      multiple={multiple}
      showUploadList={false}
    >
      <Button icon={<UploadOutlined />} disabled={disabled || uploading} loading={uploading}>
        {children ?? 'Upload file'}
      </Button>
    </Upload>
  )
}
