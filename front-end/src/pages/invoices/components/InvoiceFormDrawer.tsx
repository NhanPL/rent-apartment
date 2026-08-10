import { Button, Drawer, Form, Space, Spin } from 'antd'
import type { FormInstance } from 'antd'
import type { Contract } from '../types'
import { invoiceFormDefaultValues, type InvoiceFormValues } from './invoiceFormState'
import { InvoiceFormFields } from './invoiceFormShared'

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  width: number | string
  form: FormInstance<InvoiceFormValues>
  loading: boolean
  saveLoading: boolean
  utilitySourceId: string | null
  buildings: { id: string; name: string }[]
  rooms: { id: string; building_id: string; code: string; base_rent: number }[]
  contracts: Contract[]
  tenantName?: string
  currencyFormatter: (value: number) => string
  onClose: () => void
  onSave: () => void
}

export function InvoiceFormDrawer(props: Props) {
  const title = props.mode === 'create'
    ? (props.utilitySourceId ? 'Create invoice from utility reading' : 'Add invoice')
    : 'Edit invoice'

  return (
    <Drawer title={title} placement="right" open={props.open} width={props.width} onClose={props.onClose} destroyOnClose>
      <Spin spinning={props.loading} tip="Loading approved utility reading...">
        <Form form={props.form} layout="vertical" initialValues={invoiceFormDefaultValues}>
          <InvoiceFormFields
            form={props.form}
            buildings={props.buildings}
            rooms={props.rooms}
            contracts={props.contracts}
            tenantName={props.tenantName}
            invoiceStatusOptions={[{ label: 'Draft', value: 'DRAFT' }]}
            currencyFormatter={props.currencyFormatter}
            sourceLocked={Boolean(props.utilitySourceId)}
            autoFillFromLatest={props.mode === 'create' && !props.utilitySourceId}
          />
          <Space className="invoice-drawer-actions">
            <Button onClick={props.onClose}>Cancel</Button>
            <Button type="primary" loading={props.saveLoading} disabled={props.loading} onClick={props.onSave}>Save</Button>
          </Space>
        </Form>
      </Spin>
    </Drawer>
  )
}
