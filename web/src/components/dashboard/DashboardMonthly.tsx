import { useMemo } from 'react'
import type { MonthRow } from '../../lib/dashboardTypes'
import { formatBRL } from '../../lib/money'

type Props = {
  months: MonthRow[]
  totalPlanned: number
  formatMonthLabel: (iso: string) => string
}

export function DashboardMonthly({ months, totalPlanned, formatMonthLabel }: Props) {
  const maxMonthValue = useMemo(() => {
    if (months.length === 0) return 1
    const uniform = months.length > 0 ? totalPlanned / months.length : 0
    const maxA = Math.max(...months.map((m) => Number(m.actual_value)), 1)
    return Math.max(maxA, uniform, 1)
  }, [months, totalPlanned])

  const cumulativeRows = useMemo(() => {
    const n = months.length
    return months.reduce<
      Array<{
        month: string
        monthActual: number
        cumActual: number
        plannedLinearEnd: number
      }>
    >((acc, m, idx) => {
      const prev = acc.length === 0 ? 0 : acc[acc.length - 1].cumActual
      const cumActual = prev + Number(m.actual_value)
      acc.push({
        month: m.month,
        monthActual: Number(m.actual_value),
        cumActual,
        plannedLinearEnd: n > 0 ? (totalPlanned * (idx + 1)) / n : 0,
      })
      return acc
    }, [])
  }, [months, totalPlanned])

  const uniformMonthly = months.length > 0 ? totalPlanned / months.length : 0

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-base font-semibold text-[var(--text)]">Realizado por mês</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Cada barra compara o real do mês com uma referência linear do previsto total ({months.length}{' '}
          {months.length === 1 ? 'mês' : 'meses'} · {formatBRL(uniformMonthly)} / mês).
        </p>
        <div className="mt-4 space-y-3">
          {months.length === 0 && (
            <p className="text-sm text-[var(--muted)]">Sem lançamentos ainda.</p>
          )}
          {months.map((row) => {
            const v = Number(row.actual_value)
            const ref = uniformMonthly
            const denom = maxMonthValue > 0 ? maxMonthValue : 1
            const pctActual = (v / denom) * 100
            const pctRef = (ref / denom) * 100
            return (
              <div key={row.month} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                  <span className="min-w-[88px] font-medium capitalize text-[var(--muted)]">
                    {formatMonthLabel(row.month)}
                  </span>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="tabular-nums font-semibold">{formatBRL(row.actual_value)}</span>
                    <span className="text-xs text-[var(--muted)]">
                      ref. linear: {formatBRL(ref)}
                    </span>
                  </div>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full bg-slate-400/40 motion-safe:transition-[width] motion-safe:duration-300 motion-reduce:transition-none dark:bg-slate-600/50"
                    style={{ width: `${Math.min(100, pctRef)}%` }}
                    title="Referência linear (previsto)"
                  />
                  <div
                    className="relative h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 motion-safe:transition-[width] motion-safe:duration-300 motion-reduce:transition-none"
                    style={{ width: `${Math.min(100, pctActual)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {cumulativeRows.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-[var(--text)]">Curva acumulada (real × previsto linear)</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            O previsto acumulado assume distribuição uniforme no tempo (baseline simples). Útil para comparar ritmo
            de gasto com uma referência, não com cronograma físico da obra.
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-slate-50 dark:bg-slate-800/95">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Mês</th>
                  <th className="px-3 py-2 text-right font-medium">Real acum.</th>
                  <th className="px-3 py-2 text-right font-medium">Previsto acum. (linear)</th>
                  <th className="px-3 py-2 text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                {cumulativeRows.map((r) => {
                  const delta = r.cumActual - r.plannedLinearEnd
                  return (
                    <tr
                      key={r.month}
                      className="border-b border-[var(--border)] odd:bg-slate-50/40 last:border-0 dark:odd:bg-slate-800/25"
                    >
                      <td className="px-3 py-2 capitalize text-[var(--muted)]">
                        {formatMonthLabel(r.month)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatBRL(r.cumActual)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">
                        {formatBRL(r.plannedLinearEnd)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-medium ${
                          delta > 0
                            ? 'text-rose-700 dark:text-rose-300'
                            : delta < 0
                              ? 'text-emerald-700 dark:text-emerald-300'
                              : ''
                        }`}
                      >
                        {delta >= 0 ? '+' : ''}
                        {formatBRL(delta)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
