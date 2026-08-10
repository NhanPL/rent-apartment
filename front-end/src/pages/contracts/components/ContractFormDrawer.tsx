import { Button, Drawer, Form, Input, InputNumber, Select, Skeleton, Space } from 'antd'
import type { FormInstance } from 'antd'
import type { BuildingOption, RoomOption, TenantOption } from '../types'
import type { ContractFormValues } from './formTypes'

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  loading: boolean
  saving: boolean
  width: number | string
  form: FormInstance<ContractFormValues>
  buildings: BuildingOption[]
  rooms: RoomOption[]
  tenants: TenantOption[]
  coTenantOptions: TenantOption[]
  selectedBuildingId?: string
  onClose: () => void
  onSave: () => void
}

export function ContractFormDrawer(props: Props) {
  return (
    <Drawer open={props.open} title={props.mode === 'create' ? 'New Contract' : 'Edit Contract'} placement="right" width={props.width} onClose={props.onClose} destroyOnClose>
      {props.loading ? <Skeleton active paragraph={{ rows: 8 }} /> : (
        <Form form={props.form} layout="vertical">
          <div className="contract-form-grid">
            <Form.Item name="building_id" label="Building" rules={[{ required: true, message: 'Please select a building' }]}>
              <Select options={props.buildings.map((item) => ({ label: item.name, value: item.id }))} onChange={() => props.form.setFieldValue('room_id', undefined)} />
            </Form.Item>
            <Form.Item name="room_id" label="Room" rules={[{ required: true, message: 'Please select a room' }]}>
              <Select disabled={!props.selectedBuildingId} options={props.rooms.map((item) => ({ label: item.code, value: item.id }))} onChange={(roomId) => {
                const room = props.rooms.find((item) => item.id === roomId)
                if (room && props.mode === 'create') props.form.setFieldsValue({ rent_price: room.base_rent, deposit_amount: room.deposit_default })
              }} />
            </Form.Item>
            <Form.Item name="contract_code" label="Contract code"><Input placeholder="Auto-generated if empty" /></Form.Item>
            <Form.Item name="billing_day" label="Billing day" rules={[{ required: true, message: 'Please enter billing day' }]}><InputNumber min={1} max={28} precision={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="start_date" label="Start date" rules={[{ required: true, message: 'Please select start date' }]}><Input type="date" /></Form.Item>
            <Form.Item name="end_date" label="End date"><Input type="date" /></Form.Item>
            <Form.Item name="move_in_date" label="Move-in date"><Input type="date" /></Form.Item>
            <Form.Item name="move_out_date" label="Move-out date"><Input type="date" /></Form.Item>
            <Form.Item name="rent_price" label="Rent" rules={[{ required: true, message: 'Please enter rent' }]}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="deposit_amount" label="Deposit" rules={[{ required: true, message: 'Please enter deposit' }]}><InputNumber min={0} precision={0} style={{ width: '100%' }} /></Form.Item>
            {props.mode === 'create' ? <>
              <Form.Item name="primary_tenant_id" label="Primary tenant" dependencies={['co_tenant_ids']} rules={[({ getFieldValue }) => ({ validator: async (_rule: unknown, value?: string) => {
                const coTenantIds = (getFieldValue('co_tenant_ids') as string[] | undefined) ?? []
                if (coTenantIds.length > 0 && !value) throw new Error('Please select a primary tenant')
              } })]}>
                <Select allowClear showSearch optionFilterProp="label" options={props.tenants.map((item) => ({ label: item.full_name, value: item.id }))} onChange={(value) => {
                  const ids = (props.form.getFieldValue('co_tenant_ids') as string[] | undefined) ?? []
                  props.form.setFieldValue('co_tenant_ids', ids.filter((id) => id !== value))
                }} />
              </Form.Item>
              <Form.Item name="co_tenant_ids" label="Co-tenants"><Select mode="multiple" allowClear showSearch optionFilterProp="label" options={props.coTenantOptions.map((item) => ({ label: item.full_name, value: item.id }))} /></Form.Item>
            </> : null}
            <Form.Item name="note" label="Note" className="contract-form-full-row"><Input.TextArea rows={3} placeholder="Internal note" /></Form.Item>
          </div>
          <div className="contract-drawer-actions"><Space style={{ width: '100%', justifyContent: 'flex-end' }}><Button onClick={props.onClose}>Cancel</Button><Button type="primary" loading={props.saving} onClick={props.onSave}>Save</Button></Space></div>
        </Form>
      )}
    </Drawer>
  )
}
