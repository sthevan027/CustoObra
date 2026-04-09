export type GroupRow = {
  group_name: string
  planned_value: number
  actual_value: number
  balance: number
  percent_used: number | null
  status: string
}

export type SubgroupRow = {
  group_name: string
  subgroup_name: string
  planned_value: number
  actual_value: number
  balance: number
  percent_used: number | null
  status: string
}

export type ActivityRow = {
  item_id: number
  item_name: string
  planned_value: number
  actual_value: number
  balance: number
  percent_used: number | null
  status: string
  item_code: string | null
}

export type MonthRow = { month: string; actual_value: number }
