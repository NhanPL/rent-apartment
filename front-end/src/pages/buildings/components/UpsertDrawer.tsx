import { ExclamationCircleOutlined } from '@ant-design/icons'
import { Button, Drawer, Form, Grid, Input, Modal, Select, Space } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BuildingEntity, BuildingFormValues } from './types'

interface UpsertDrawerProps {
  open: boolean
  mode: 'create' | 'edit'
  item: BuildingEntity | null
  loading: boolean
  existingCodes: string[]
  onClose: () => void
  onSubmit: (values: BuildingFormValues) => Promise<void>
}

const defaultValues: BuildingFormValues = {
  code: '',
  name: '',
  address: '',
  note: '',
  status: 'active',
  manager: '',
}

export function UpsertDrawer({ open, mode, item, loading, existingCodes, onClose, onSubmit }: UpsertDrawerProps) {
  const [form] = Form.useForm<BuildingFormValues>()
  const [canSave, setCanSave] = useState(false)
  const [discardModalOpen, setDiscardModalOpen] = useState(false)
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
        status: item.status,
        manager: item.manager,
      }
    }
    return defaultValues
  }, [mode, item])

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue(initialValues)
      initialSnapshotRef.current = JSON.stringify(initialValues)
      setCanSave(false)
      setDiscardModalOpen(false)
    }
  }, [form, initialValues, open])

  const isDirty = () => JSON.stringify(form.getFieldsValue()) !== initialSnapshotRef.current

  const closeDrawer = () => {
    form.resetFields()
    setCanSave(false)
    setDiscardModalOpen(false)
    onClose()
  }

  const requestClose = () => {
    if (isDirty()) {
      setDiscardModalOpen(true)
      return
    }
    closeDrawer()
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    await onSubmit(values)
    closeDrawer()
  }

  return (
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
            label="Code"
            name="code"
            rules={[
              { required: true, message: 'Code is required' },
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
            <Input size={isMobile ? 'large' : 'middle'} placeholder="BLD-001" />
          </Form.Item>
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input size={isMobile ? 'large' : 'middle'} placeholder="Sunrise Riverside" />
          </Form.Item>
          <Form.Item label="Address" name="address" rules={[{ required: true, message: 'Address is required' }]}>
            <Input size={isMobile ? 'large' : 'middle'} placeholder="12 Nguyen Van Cu" />
          </Form.Item>
          <Form.Item label="Manager" name="manager" rules={[{ required: true, message: 'Manager is required' }]}>
            <Input size={isMobile ? 'large' : 'middle'} placeholder="Manager name" />
          </Form.Item>
          <Form.Item label="Status" name="status" rules={[{ required: true }]}>
            <Select
              size={isMobile ? 'large' : 'middle'}
              options={[{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }]}
            />
          </Form.Item>
          <Form.Item label="Note" name="note">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>

        <div style={{ position: 'sticky', bottom: 0, padding: '12px 0', background: '#fff', borderTop: '1px solid #f0f0f0' }}>
          <Space style={{ width: '100%', justifyContent: isMobile ? 'space-between' : 'flex-start' }}>
            <Button size={isMobile ? 'large' : 'middle'} onClick={requestClose}>
              Cancel
            </Button>
            <Button size={isMobile ? 'large' : 'middle'} type="primary" loading={loading} disabled={!canSave} onClick={handleSubmit}>
              Save
            </Button>
          </Space>
        </div>
      </Drawer>

      <Modal
        open={discardModalOpen}
        title="Discard unsaved changes?"
        onCancel={() => setDiscardModalOpen(false)}
        onOk={closeDrawer}
        okText="Discard"
        okButtonProps={{ danger: true }}
        cancelText="Keep editing"
        maskClosable
      >
        <Space>
          <ExclamationCircleOutlined />
          You have unsaved changes.
        </Space>
      </Modal>
    </>
  )
}
