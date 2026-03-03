import { ExclamationCircleOutlined } from '@ant-design/icons'
import { Button, Drawer, Form, Grid, Input, InputNumber, Modal, Select, Space } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Room, RoomStatus, RoomUpsertPayload } from './roomTypes'

interface RoomsUpsertDrawerProps {
  open: boolean
  mode: 'create' | 'edit'
  room: Room | null
  building_id: string
  loading: boolean
  existingCodes: string[]
  onClose: () => void
  onSubmit: (payload: RoomUpsertPayload) => Promise<void>
}

const defaultValues: Omit<RoomUpsertPayload, 'building_id'> = {
  code: '',
  floor: null,
  area_m2: null,
  status: 'ACTIVE',
  base_rent: 0,
  deposit_default: 0,
  max_occupants: 1,
  note: null,
}

export function RoomsUpsertDrawer({ open, mode, room, building_id, loading, existingCodes, onClose, onSubmit }: RoomsUpsertDrawerProps) {
  const [form] = Form.useForm<Omit<RoomUpsertPayload, 'building_id'>>()
  const [canSave, setCanSave] = useState(false)
  const initialSnapshotRef = useRef<string>('')
  const screens = Grid.useBreakpoint()

  const initialValues = useMemo(() => {
    if (mode === 'edit' && room) {
      return {
        code: room.code,
        floor: room.floor,
        area_m2: room.area_m2,
        status: room.status,
        base_rent: room.base_rent,
        deposit_default: room.deposit_default,
        max_occupants: room.max_occupants,
        note: room.note,
      }
    }
    return defaultValues
  }, [mode, room])

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue(initialValues)
      initialSnapshotRef.current = JSON.stringify(initialValues)
    }
  }, [form, initialValues, open])

  const isDirty = () => JSON.stringify(form.getFieldsValue()) !== initialSnapshotRef.current

  const requestClose = () => {
    if (isDirty()) {
      Modal.confirm({
        title: 'Discard unsaved room changes?',
        icon: <ExclamationCircleOutlined />,
        onOk: onClose,
      })
      return
    }
    onClose()
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    await onSubmit({ ...values, building_id, note: values.note ?? null })
    setCanSave(false)
  }

  return (
    <Drawer
      open={open}
      title={mode === 'create' ? 'Add Room' : 'Edit Room'}
      onClose={requestClose}
      placement="right"
      width={screens.xl ? 520 : screens.md ? 480 : '100%'}
      destroyOnClose
      styles={{ body: { paddingBottom: 88 } }}
    >
      <Form
        form={form}
        layout="vertical"
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
                  throw new Error('Room code already exists in this building')
                }
              },
            },
          ]}
        >
          <Input placeholder="A-103" />
        </Form.Item>
        <Form.Item label="Status" name="status" rules={[{ required: true }]}>
          <Select<RoomStatus>
            options={[
              { label: 'Active', value: 'ACTIVE' },
              { label: 'Maintenance', value: 'MAINTENANCE' },
              { label: 'Inactive', value: 'INACTIVE' },
            ]}
          />
        </Form.Item>
        <Form.Item label="Price" name="base_rent" rules={[{ required: true, message: 'Price is required' }]}>
          <InputNumber min={0} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Floor" name="floor">
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Area (m²)" name="area_m2">
          <InputNumber min={0} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Deposit" name="deposit_default">
          <InputNumber min={0} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Max Occupants" name="max_occupants" rules={[{ required: true }]}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Note" name="note">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>

      <div style={{ position: 'sticky', bottom: 0, padding: '12px 0', background: '#fff', borderTop: '1px solid #f0f0f0' }}>
        <Space>
          <Button onClick={requestClose}>Cancel</Button>
          <Button type="primary" loading={loading} disabled={!canSave} onClick={handleSave}>
            Save
          </Button>
        </Space>
      </div>
    </Drawer>
  )
}
