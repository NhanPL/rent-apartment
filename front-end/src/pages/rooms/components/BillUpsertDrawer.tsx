import { ExclamationCircleOutlined } from '@ant-design/icons'
import { Button, Drawer, Form, Grid, Input, InputNumber, Modal, Select, Space } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MonthlyBill, MonthlyBillUpsertPayload } from '../../buildings/components/roomTypes'

interface BillUpsertDrawerProps {
  open: boolean
  mode: 'create' | 'edit'
  room_id: string
  bill: MonthlyBill | null
  loading: boolean
  onClose: () => void
  onSubmit: (payload: MonthlyBillUpsertPayload) => Promise<void>
}

type BillFormValues = Omit<MonthlyBillUpsertPayload, 'room_id'>

const defaultValues: BillFormValues = {
  month: '',
  electricity_prev: null,
  electricity_curr: null,
  water_prev: null,
  water_curr: null,
  total_bill_amount: 0,
  invoice_status: 'ISSUED',
  note: null,
}

export function BillUpsertDrawer({ open, mode, room_id, bill, loading, onClose, onSubmit }: BillUpsertDrawerProps) {
  const [form] = Form.useForm<BillFormValues>()
  const screens = Grid.useBreakpoint()
  const [canSave, setCanSave] = useState(false)
  const initialSnapshotRef = useRef<string>('')

  const initialValues = useMemo<BillFormValues>(() => {
    if (mode === 'edit' && bill) {
      return {
        month: bill.month.slice(0, 7),
        electricity_prev: bill.electricity_prev,
        electricity_curr: bill.electricity_curr,
        water_prev: bill.water_prev,
        water_curr: bill.water_curr,
        total_bill_amount: bill.total_bill_amount,
        invoice_status: bill.invoice_status,
        note: bill.note,
      }
    }
    return defaultValues
  }, [mode, bill])

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
        title: 'Discard bill changes?',
        icon: <ExclamationCircleOutlined />,
        onOk: onClose,
      })
      return
    }
    onClose()
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    await onSubmit({ ...values, room_id, month: `${values.month}-01`, note: values.note ?? null })
  }

  return (
    <Drawer open={open} title={mode === 'create' ? 'Add Bill' : 'Edit Bill'} onClose={requestClose} width={screens.md ? 500 : '100%'} placement="right" destroyOnClose>
      <Form
        form={form}
        layout="vertical"
        onValuesChange={async () => {
          const electricity_prev = form.getFieldValue('electricity_prev') as number | null
          const electricity_curr = form.getFieldValue('electricity_curr') as number | null
          const water_prev = form.getFieldValue('water_prev') as number | null
          const water_curr = form.getFieldValue('water_curr') as number | null
          if (electricity_prev !== null && electricity_curr !== null && water_prev !== null && water_curr !== null) {
            const autoTotal = Math.max(electricity_curr - electricity_prev, 0) * 0.8 + Math.max(water_curr - water_prev, 0) * 0.5
            form.setFieldValue('total_bill_amount', Number(autoTotal.toFixed(2)))
          }
          try {
            await form.validateFields({ validateOnly: true })
            setCanSave(isDirty())
          } catch {
            setCanSave(false)
          }
        }}
      >
        <Form.Item label="Month" name="month" rules={[{ required: true, message: 'Month is required' }]}>
          <Input type="month" />
        </Form.Item>
        <Form.Item label="Electricity previous" name="electricity_prev">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          label="Electricity current"
          name="electricity_curr"
          rules={[
            ({ getFieldValue }) => ({
              validator: async (_rule: unknown, value: number | null) => {
                const prev = getFieldValue('electricity_prev') as number | null
                if (value === null || prev === null || value >= prev) return
                throw new Error('Electricity current must be >= previous')
              },
            }),
          ]}
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Water previous" name="water_prev">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          label="Water current"
          name="water_curr"
          rules={[
            ({ getFieldValue }) => ({
              validator: async (_rule: unknown, value: number | null) => {
                const prev = getFieldValue('water_prev') as number | null
                if (value === null || prev === null || value >= prev) return
                throw new Error('Water current must be >= previous')
              },
            }),
          ]}
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Total bill" name="total_bill_amount" rules={[{ required: true }, { type: 'number', min: 0 }]}>
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Status" name="invoice_status" rules={[{ required: true }]}>
          <Select
            options={[
              { label: 'Draft', value: 'DRAFT' },
              { label: 'Issued', value: 'ISSUED' },
              { label: 'Paid', value: 'PAID' },
              { label: 'Void', value: 'VOID' },
              { label: 'Overdue', value: 'OVERDUE' },
            ]}
          />
        </Form.Item>
        <Form.Item label="Note" name="note">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
      <Space>
        <Button onClick={requestClose}>Cancel</Button>
        <Button type="primary" loading={loading} disabled={!canSave} onClick={handleSubmit}>
          Save
        </Button>
      </Space>
    </Drawer>
  )
}
