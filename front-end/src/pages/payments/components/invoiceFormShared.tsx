import { Form, Input, InputNumber, Select } from 'antd'
import { useEffect, useMemo } from 'react'
import type { FormInstance } from 'antd/es/form'
import { getEffectiveUtilityRate } from '../../../services/paymentsService'
import type { Contract, InvoiceStatus, Room } from '../types'
import { useInvoiceDerivedValues, type InvoiceFormValues } from './invoiceFormState'

interface InvoiceFormFieldsProps {
  form: FormInstance<InvoiceFormValues>
  rooms: Room[]
  contracts: Contract[]
  tenantName?: string
  invoiceStatusOptions: { label: string; value: InvoiceStatus }[]
  currencyFormatter: (value: number) => string
  roomLocked?: boolean
}

export function InvoiceFormFields({
  form,
  rooms,
  contracts,
  tenantName,
  invoiceStatusOptions,
  currencyFormatter,
  roomLocked = false,
}: InvoiceFormFieldsProps) {
  const selectedRoomId = Form.useWatch('room_id', form)
  const selectedMonth = Form.useWatch('month', form)

  const roomOptions = useMemo(() => rooms.map((item) => ({ label: item.code, value: item.id })), [rooms])

  const contractOptions = useMemo(
    () => contracts.filter((contract) => contract.status === 'ACTIVE' && (!selectedRoomId || contract.room_id === selectedRoomId)),
    [contracts, selectedRoomId],
  )

  const { electricUsage, waterUsage, electricAmount, waterAmount, subtotal, totalAmount } = useInvoiceDerivedValues(form)

  useEffect(() => {
    if (!selectedRoomId || !selectedMonth) {
      return
    }

    const selectedRoom = rooms.find((item) => item.id === selectedRoomId)
    if (!selectedRoom) {
      return
    }

    void getEffectiveUtilityRate(selectedRoomId, selectedMonth).then((rate) => {
      form.setFieldValue('electric_unit_price', rate.electricity_unit_price)
      form.setFieldValue('water_unit_price', rate.water_unit_price)
      if (!form.getFieldValue('rent_amount')) {
        const contract = contracts.find((item) => item.room_id === selectedRoomId && item.status === 'ACTIVE')
        form.setFieldValue('rent_amount', contract?.rent_price ?? selectedRoom.base_rent)
      }
    })
  }, [selectedRoomId, selectedMonth, rooms, contracts, form])

  return (
    <div className="invoice-form-grid">
      <Form.Item label="Room" name="room_id" rules={[{ required: true, message: 'Please select room' }]}>
        <Select showSearch optionFilterProp="label" options={roomOptions} disabled={roomLocked} />
      </Form.Item>
      <Form.Item label="Contract" name="contract_id" rules={[{ required: true, message: 'Please select contract' }]}>
        <Select options={contractOptions.map((item) => ({ label: item.id, value: item.id }))} />
      </Form.Item>

      <Form.Item label="Tenant" className="invoice-form-readonly">
        <Input value={tenantName ?? '-'} readOnly />
      </Form.Item>
      <Form.Item label="Billing month" name="month" rules={[{ required: true }]}>
        <Input type="date" />
      </Form.Item>

      <Form.Item label="Invoice status" name="status" rules={[{ required: true }]}>
        <Select options={invoiceStatusOptions} />
      </Form.Item>
      <Form.Item label="Issued at" name="issued_at">
        <Input type="date" />
      </Form.Item>

      <Form.Item label="Due date" name="due_date">
        <Input type="date" />
      </Form.Item>
      <Form.Item label="Room rent" name="rent_amount" rules={[{ required: true }]}>
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item label="Previous electric reading" name="electricity_prev" rules={[{ required: true }]}>
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="Current electric reading"
        name="electricity_curr"
        dependencies={['electricity_prev']}
        rules={[
          { required: true },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (typeof value !== 'number') {
                return Promise.reject(new Error('Current electric reading is required'))
              }

              if (value < (getFieldValue('electricity_prev') ?? 0)) {
                return Promise.reject(new Error('Current reading must be greater than or equal to previous reading'))
              }

              return Promise.resolve()
            },
          }),
        ]}
      >
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item label="Previous water reading" name="water_prev" rules={[{ required: true }]}>
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item
        label="Current water reading"
        name="water_curr"
        dependencies={['water_prev']}
        rules={[
          { required: true },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (typeof value !== 'number') {
                return Promise.reject(new Error('Current water reading is required'))
              }

              if (value < (getFieldValue('water_prev') ?? 0)) {
                return Promise.reject(new Error('Current reading must be greater than or equal to previous reading'))
              }

              return Promise.resolve()
            },
          }),
        ]}
      >
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item label="Electric unit price" name="electric_unit_price" rules={[{ required: true }]}>
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="Water unit price" name="water_unit_price" rules={[{ required: true }]}>
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item label="Electric usage">
        <Input value={electricUsage} readOnly />
      </Form.Item>
      <Form.Item label="Electric amount">
        <Input value={currencyFormatter(electricAmount)} readOnly />
      </Form.Item>

      <Form.Item label="Water usage">
        <Input value={waterUsage} readOnly />
      </Form.Item>
      <Form.Item label="Water amount">
        <Input value={currencyFormatter(waterAmount)} readOnly />
      </Form.Item>

      <Form.Item label="Other fees" name="other_fees" rules={[{ required: true }]}>
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="Discount" name="discount" rules={[{ required: true }]}>
        <InputNumber min={0} style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item label="Subtotal">
        <Input value={currencyFormatter(subtotal)} readOnly />
      </Form.Item>
      <Form.Item label="Total amount">
        <Input value={currencyFormatter(totalAmount)} readOnly />
      </Form.Item>

      <Form.Item label="Notes" name="note" className="invoice-form-full">
        <Input.TextArea rows={3} />
      </Form.Item>
    </div>
  )
}
