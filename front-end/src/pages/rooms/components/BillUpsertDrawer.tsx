import { Button, Drawer, Form, Grid, Space, message } from 'antd'
import { useEffect, useMemo } from 'react'
import { InvoiceFormFields } from '../../invoices/components/invoiceFormShared'
import {
  getInvoiceFormDefaultValues,
  invoiceFormDefaultValues,
  type InvoiceFormValues,
} from '../../invoices/components/invoiceFormState'
import '../../invoices/components/invoiceFormShared.css'
import type { Contract, InvoiceStatus, Room } from '../../invoices/types'
import type { MonthlyBill, MonthlyBillUpsertPayload } from '../../buildings/components/roomTypes'
import { Localized } from '../../../shared/components/Localized'
import { vndCurrency } from '../../../i18n'
import { getFormErrorMessage } from '../../../services/errorMessage'

interface BillUpsertDrawerProps {
  open: boolean
  mode: 'create' | 'edit'
  room_id: string
  bill: MonthlyBill | null
  room: Room
  contracts: Contract[]
  tenantName?: string
  loading: boolean
  onClose: () => void
  onSubmit: (payload: MonthlyBillUpsertPayload) => Promise<void>
}

const statusOptions: { label: string; value: InvoiceStatus }[] = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Issued', value: 'ISSUED' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Overdue', value: 'OVERDUE' },
  { label: 'Void', value: 'VOID' },
]

const currency = vndCurrency

export function BillUpsertDrawer({
  open,
  mode,
  room_id,
  bill,
  room,
  contracts,
  tenantName,
  loading,
  onClose,
  onSubmit,
}: BillUpsertDrawerProps) {
  const [form] = Form.useForm<InvoiceFormValues>()
  const screens = Grid.useBreakpoint()

  const initialValues = useMemo<InvoiceFormValues>(() => {
    if (mode === 'edit' && bill) {
      return {
        contract_id: bill.contract_id,
        room_id: bill.room_id,
        building_id: room.building_id,
        month: bill.month,
        status: bill.invoice_status,
        issued_at: bill.issued_at ?? undefined,
        due_date: bill.due_date ?? undefined,
        rent_amount: bill.rent_amount,
        electricity_prev: bill.electricity_prev,
        electricity_curr: bill.electricity_curr,
        water_prev: bill.water_prev,
        water_curr: bill.water_curr,
        electric_unit_price: bill.electric_unit_price,
        water_unit_price: bill.water_unit_price,
        other_fees: bill.other_fees,
        discount: bill.discount,
        note: bill.note ?? undefined,
      }
    }

    return {
      ...getInvoiceFormDefaultValues(),
      building_id: room.building_id,
      room_id,
      contract_id: contracts[0]?.id,
      rent_amount: room.base_rent,
    }
  }, [mode, bill, room_id, contracts, room.base_rent, room.building_id])

  useEffect(() => {
    if (!open) {
      return
    }

    form.resetFields()
    form.setFieldsValue(initialValues)
  }, [open, form, initialValues])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (!values.contract_id || !values.room_id) {
        throw new Error('Please select a contract and room.')
      }

      await onSubmit({
        room_id: values.room_id,
        contract_id: values.contract_id,
        month: values.month,
        electricity_prev: values.electricity_prev,
        electricity_curr: values.electricity_curr,
        water_prev: values.water_prev,
        water_curr: values.water_curr,
        electric_unit_price: values.electric_unit_price,
        water_unit_price: values.water_unit_price,
        rent_amount: values.rent_amount,
        other_fees: values.other_fees,
        discount: values.discount,
        invoice_status: values.status,
        issued_at: values.issued_at ?? null,
        due_date: values.due_date ?? null,
        note: values.note ?? null,
      })

      onClose()
    } catch (error) {
      message.error(getFormErrorMessage(error, 'Unable to save the invoice.'))
    }
  }

  return (
    <Localized>
    <Drawer
      open={open}
      title={mode === 'create' ? 'Add Bill' : 'Edit Bill'}
      onClose={onClose}
      width={screens.md ? 500 : '100%'}
      placement="right"
      destroyOnClose
      maskClosable
    >
      <Form form={form} layout="vertical" initialValues={invoiceFormDefaultValues}>
        <InvoiceFormFields
          form={form}
          rooms={[room]}
          contracts={contracts}
          tenantName={tenantName}
          invoiceStatusOptions={statusOptions}
          currencyFormatter={(value) => currency.format(value)}
          roomLocked
        />
        <Space className="invoice-drawer-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={loading} onClick={() => void handleSubmit()}>
            {mode === 'create' ? 'Create bill' : 'Save changes'}
          </Button>
        </Space>
      </Form>
    </Drawer>
    </Localized>
  )
}
