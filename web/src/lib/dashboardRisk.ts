import type { ActivityRow } from './dashboardTypes'

export function sortActivitiesByRisk(acts: ActivityRow[]): ActivityRow[] {
  return [...acts].sort((a, b) => {
    const oa = Number(a.actual_value) - Number(a.planned_value)
    const ob = Number(b.actual_value) - Number(b.planned_value)
    if (oa > 0 && ob > 0) return ob - oa
    if (oa > 0) return -1
    if (ob > 0) return 1
    const pa = Number(a.percent_used ?? 0)
    const pb = Number(b.percent_used ?? 0)
    if (pb !== pa) return pb - pa
    return Math.abs(Number(a.balance)) - Math.abs(Number(b.balance))
  })
}
