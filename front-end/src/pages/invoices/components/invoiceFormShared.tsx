import { Form, Input, InputNumber, Select } from 'antd'
import { useEffect, useMemo } from 'react'
import type { FormInstance } from 'antd/es/form'
import { getEffectiveUtilityRate, getInvoicePrefill } from '../../../services/invoicesService'
import type { Building, Contract, InvoiceStatus, Room } from '../types'
import { useInvoiceDerivedValues, type InvoiceFormValues } from './invoiceFormState'

interface InvoiceFormFieldsProps {
  form: FormInstance<InvoiceFormValues>
  buildings?: Building[]
  rooms: Room[]
  contracts: Contract[]
  tenantName?: string
  invoiceStatusOptions: { label: string; value: InvoiceStatus }[]
  currencyFormatter: (value: number) => string
  roomLocked?: boolean
  autoFillFromLatest?: boolean
}

export function InvoiceFormFields({
  form,
  buildings = [],
  rooms,
  contracts,
  tenantName,
  invoiceStatusOptions,
  currencyFormatter,
  roomLocked = false,
  autoFillFromLatest = false,
}: InvoiceFormFieldsProps) {
  const selectedBuildingId = Form.useWatch('building_id', form)
  const selectedRoomId = Form.useWatch('room_id', form)
  const selectedMonth = Form.useWatch('month', form)

  const activeContracts = useMemo(() => contracts.filter((contract) => contract.status === 'ACTIVE'), [contracts])
  const occupiedRoomIds = useMemo(() => new Set(activeContracts.map((contract) => contract.room_id)), [activeContracts])

  const buildingOptions = useMemo(
    () =>
      buildings
        .filter((building) => rooms.some((room) => room.building_id === building.id && occupiedRoomIds.has(room.id)))
        .map((item) => ({ label: item.name, value: item.id })),
    [buildings, occupiedRoomIds, rooms],
  )

  const roomOptions = useMemo(() => {
    const selectableRooms = roomLocked ? rooms : rooms.filter((room) => occupiedRoomIds.has(room.id))

    return selectableRooms
      .filter((room) => !selectedBuildingId || room.building_id === selectedBuildingId)
      .map((item) => ({ label: item.code, value: item.id }))
  }, [occupiedRoomIds, roomLocked, rooms, selectedBuildingId])

  const contractOptions = useMemo(
    () => activeContracts.filter((contract) => !selectedRoomId || contract.room_id === selectedRoomId),
    [activeContracts, selectedRoomId],
  )

  const { electricUsage, waterUsage, electricAmount, waterAmount, subtotal, totalAmount } = useInvoiceDerivedValues(form)

  useEffect(() => {
    if (!selectedRoomId) {
      return
    }

    const selectedRoom = rooms.find((item) => item.id === selectedRoomId)
    if (!selectedRoom) {
      return
    }

    if (buildings.length > 0 && form.getFieldValue('building_id') !== selectedRoom.building_id) {
      form.setFieldValue('building_id', selectedRoom.building_id)
    }

    const activeContract = activeContracts.find((item) => item.room_id === selectedRoomId)
    const currentContractId = form.getFieldValue('contract_id')
    if (activeContract && !activeContracts.some((item) => item.id === currentContractId && item.room_id === selectedRoomId)) {
      form.setFieldValue('contract_id', activeContract.id)
    }
  }, [activeContracts, buildings.length, form, rooms, selectedRoomId])

  useEffect(() => {
    if (!selectedRoomId || !selectedMonth) {
      return
    }

    const selectedRoom = rooms.find((item) => item.id === selectedRoomId)
    if (!selectedRoom) {
      return
    }

    let cancelled = false

    if (autoFillFromLatest) {
      void getInvoicePrefill(selectedRoomId, selectedMonth).then((prefill) => {
        if (cancelled) {
          return
        }

        const electricityCurr = Number(form.getFieldValue('electricity_curr') ?? 0)
        const waterCurr = Number(form.getFieldValue('water_curr') ?? 0)

        form.setFieldsValue({
          building_id: buildings.length > 0 ? prefill.building_id : form.getFieldValue('building_id'),
          contract_id: prefill.contract_id || form.getFieldValue('contract_id'),
          issued_at: prefill.issued_at,
          due_date: prefill.due_date ?? form.getFieldValue('due_date'),
          rent_amount: prefill.rent_amount,
          electricity_prev: prefill.electricity_prev,
          electricity_curr: electricityCurr < prefill.electricity_prev ? prefill.electricity_prev : electricityCurr,
          water_prev: prefill.water_prev,
          water_curr: waterCurr < prefill.water_prev ? prefill.water_prev : waterCurr,
          electric_unit_price: prefill.electric_unit_price,
          water_unit_price: prefill.water_unit_price,
        })
      })

      return () => {
        cancelled = true
      }
    }

    void getEffectiveUtilityRate(selectedRoomId, selectedMonth).then((rate) => {
      if (cancelled) {
        return
      }

      if (!form.getFieldValue('electric_unit_price')) {
        form.setFieldValue('electric_unit_price', rate.electricity_unit_price)
      }
      if (!form.getFieldValue('water_unit_price')) {
        form.setFieldValue('water_unit_price', rate.water_unit_price)
      }
      if (!form.getFieldValue('rent_amount')) {
        const contract = activeContracts.find((item) => item.room_id === selectedRoomId)
        form.setFieldValue('rent_amount', contract?.rent_price ?? selectedRoom.base_rent)
      }
    })

    return () => {
      cancelled = true
    }
  }, [activeContracts, autoFillFromLatest, buildings.length, selectedRoomId, selectedMonth, rooms, form])

  return (
    <div className="invoice-form-grid">
      {buildings.length > 0 ? (
        <Form.Item label="Building" name="building_id" rules={[{ required: true, message: 'Please select building' }]}>
          <Select
            showSearch
            optionFilterProp="label"
            options={buildingOptions}
            onChange={() => {
              form.setFieldsValue({
                room_id: undefined,
                contract_id: undefined,
                rent_amount: 0,
                electricity_prev: 0,
                electricity_curr: 0,
                water_prev: 0,
                water_curr: 0,
              })
            }}
          />
        </Form.Item>
      ) : null}

      <Form.Item label="Room" name="room_id" rules={[{ required: true, message: 'Please select room' }]}>
        <Select
          showSearch
          optionFilterProp="label"
          options={roomOptions}
          disabled={roomLocked}
          onChange={(value) => {
            const selectedRoom = rooms.find((room) => room.id === value)
            form.setFieldsValue({
              building_id: selectedRoom?.building_id ?? form.getFieldValue('building_id'),
              contract_id: undefined,
              rent_amount: 0,
              electricity_prev: 0,
              electricity_curr: 0,
              water_prev: 0,
              water_curr: 0,
            })
          }}
        />
      </Form.Item>
      <Form.Item label="Contract" name="contract_id" rules={[{ required: true, message: 'Please select contract' }]}>
        <Select
          options={contractOptions.map((item) => ({
            label: item.tenant_name ? `${item.id} - ${item.tenant_name}` : item.id,
            value: item.id,
          }))}
        />
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
