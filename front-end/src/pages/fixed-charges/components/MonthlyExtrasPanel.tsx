import type { ReactNode } from 'react'
import type { ColumnsType } from 'antd/es/table'
import type { RoomMonthExtra } from '../types'
import { ChargeAssignmentPanel } from './ChargeAssignmentPanel'

interface Props {
  filters: ReactNode
  loading: boolean
  items: RoomMonthExtra[]
  columns: ColumnsType<RoomMonthExtra>
}

export function MonthlyExtrasPanel(props: Props) {
  return <ChargeAssignmentPanel filters={props.filters} loading={props.loading} items={props.items} columns={props.columns} scrollWidth={980} />
}
