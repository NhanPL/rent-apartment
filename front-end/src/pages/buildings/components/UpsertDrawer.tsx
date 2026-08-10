import { useI18n } from '../../../i18n'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import { Button, Drawer, Form, Grid, Input, Modal, Space, message } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BuildingEntity, BuildingFormValues } from './types'
import { applyApiFieldErrors, getFormErrorMessage, isFormValidationError } from '../../../services/errorMessage'

interface UpsertDrawerProps {
  open: boolean
  mode: 'create' | 'edit'
  item: BuildingEntity | null
  loading: boolean
  existingCodes: string[]
  onClose: () => void
  onSubmit: (values: BuildingFormValues) => Promise<void>
}

const DRAWER_Z_INDEX = 1000
const CONFIRM_MODAL_Z_INDEX = 1100

const defaultValues: BuildingFormValues = {
  code: '',
  name: '',
  address: '',
  note: '',
}

export function UpsertDrawer({ open, mode, item, loading, existingCodes, onClose, onSubmit }: UpsertDrawerProps) {
  const { t } = useI18n()
  const [form] = Form.useForm<BuildingFormValues>()
  const [canSave, setCanSave] = useState(false)
  const [discardModalOpen, setDiscardModalOpen] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const initialSnapshotRef = useRef<string>('')
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const initialValues = useMemo<BuildingFormValues>(() => {
    if (mode === 'edit' && item) {
      return {
        code: item.code,
        name: item.name,
        address: item.address,
        note: item.note ?? '',
      }
    }
    return defaultValues
  }, [mode, item])

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue(initialValues)
      initialSnapshotRef.current = JSON.stringify(initialValues)
    }
  }, [form, initialValues, open])

  const isDirty = () => JSON.stringify(form.getFieldsValue()) !== initialSnapshotRef.current

  const closeDrawer = () => {
    form.resetFields()
    setCanSave(false)
    setDiscardModalOpen(false)
    setConfirmingClose(false)
    onClose()
  }

  const requestClose = () => {
    if (confirmingClose) return
    if (isDirty()) {
      setDiscardModalOpen(true)
      return
    }
    closeDrawer()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await onSubmit(values)
      closeDrawer()
    } catch (error) {
      if (isFormValidationError(error)) {
        applyApiFieldErrors(form, error)
        message.error(getFormErrorMessage(error))
      }
    }
  }

  return (
    <>
    <>
      <Drawer
        open={open}
        title={mode === 'create' ? 'Create Building' : 'Edit Building'}
        placement="right"
        onClose={requestClose}
        width={screens.md ? 500 : '100%'}
        destroyOnClose
        styles={{ body: { paddingBottom: 90 } }}
        maskClosable
        zIndex={DRAWER_Z_INDEX}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={initialValues}
          onFieldsChange={async () => {
            try {
              await form.validateFields({ validateOnly: true })
              setCanSave(isDirty())
            } catch {
              setCanSave(false)
            }
          }}
        >
          <Form.Item
            label={t("Code")}
            name="code"
            rules={[
              { required: true, message: t("Code is required") },
              {
                validator: async (_rule: unknown, value: string) => {
                  if (!value) return
                  if (existingCodes.some((code) => code.toLowerCase() === value.toLowerCase())) {
                    throw new Error('Code already exists')
                  }
                },
              },
            ]}
          >
            <Input size={isMobile ? 'large' : 'middle'} placeholder={t("BLD-001")} />
          </Form.Item>
          <Form.Item label={t("Name")} name="name" rules={[{ required: true, message: t("Name is required") }]}>
            <Input size={isMobile ? 'large' : 'middle'} placeholder={t("Sunrise Riverside")} />
          </Form.Item>
          <Form.Item label={t("Address")} name="address" rules={[{ required: true, message: t("Address is required") }]}>
            <Input size={isMobile ? 'large' : 'middle'} placeholder={t("12 Nguyen Van Cu")} />
          </Form.Item>
          <Form.Item label={t("Note")} name="note">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>

        <div style={{ position: 'sticky', bottom: 0, padding: '12px 0', background: '#fff', borderTop: '1px solid #f0f0f0' }}>
          <Space style={{ width: '100%', justifyContent: isMobile ? 'space-between' : 'flex-start' }}>
            <Button size={isMobile ? 'large' : 'middle'} onClick={requestClose}>
              {t("Cancel")}
            </Button>
            <Button size={isMobile ? 'large' : 'middle'} type="primary" loading={loading} disabled={!canSave} onClick={handleSubmit}>
              {t("Save")}
            </Button>
          </Space>
        </div>
      </Drawer>

      <Modal
        open={discardModalOpen}
        title={t("Discard unsaved changes?")}
        onCancel={() => setDiscardModalOpen(false)}
        onOk={async () => {
          setConfirmingClose(true)
          closeDrawer()
        }}
        okText={t("Discard")}
        okButtonProps={{ danger: true }}
        cancelText={t("Keep editing")}
        maskClosable
        zIndex={CONFIRM_MODAL_Z_INDEX}
        getContainer={() => document.body}
      >
        <Space>
          <ExclamationCircleOutlined />
          {t("You have unsaved changes.")}
        </Space>
      </Modal>
    </>
    </>
  )
}
