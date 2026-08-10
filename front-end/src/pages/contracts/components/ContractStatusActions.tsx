import { EditOutlined } from '@ant-design/icons'
import { Button, Space } from 'antd'
import type { ReactNode } from 'react'
import type { ContractDetail } from '../types'

interface Props {
  contract: ContractDetail
  canChange: boolean
  actionLoading: string | null
  statusTag: ReactNode
  businessStageTag: ReactNode
  onEdit: () => void
  onActivate: () => void
  onEnd: () => void
  onCancel: () => void
}

export function ContractStatusActions(props: Props) {
  return (
    <Space wrap className="contract-detail-actions">
      {props.statusTag}
      {props.businessStageTag}
      <Button icon={<EditOutlined />} disabled={!props.canChange} onClick={props.onEdit}>Edit</Button>
      {props.contract.status === 'DRAFT' ? (
        <Button type="primary" loading={props.actionLoading === `activate-${props.contract.id}`} onClick={props.onActivate}>Activate</Button>
      ) : null}
      {props.canChange ? <><Button onClick={props.onEnd}>End</Button><Button danger onClick={props.onCancel}>Cancel</Button></> : null}
    </Space>
  )
}
