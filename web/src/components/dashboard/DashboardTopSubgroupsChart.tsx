import { useMemo } from 'react'
import type { SubgroupRow } from '../../lib/dashboardTypes'
import { formatBRL } from '../../lib/money'

type Row = SubgroupRow & { mag: number }

type Props = {
  subgroups: SubgroupRow[]
}

function labelFor(s: SubgroupRow): string {
  const sub = s.subgroup_name.trim() || '—'
  return `${s.group_name} · ${sub}`
}

export function DashboardTopSubgroupsChart({ subgroups }: Props) {
  const { top10, maxMag } = useMemo(() => {
    const withMag: Row[] = subgroups.map((s) => ({
      ...s,
      mag: Math.max(Number(s.planned_value), Number(s.actual_value)),
    }))
    const sorted = [...withMag].sort((a, b) => b.mag - a.mag).slice(0, 10)
    const maxMag = sorted.length === 0 ? 1 : Math.max(...sorted.map((r) => r.mag), 1)
    return { top10: sorted, maxMag }
  }, [subgroups])

  if (top10.length === 0) {
    return (
      <section className="rounded-xl border border-(--border) bg-(--card) p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-(--text)">Onde está o maior custo (subgrupos)</h2>
        <p className="mt-2 text-sm text-(--muted)">Sem dados para o gráfico.</p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-(--border) bg-(--card) p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-(--text)">Onde está o maior custo (subgrupos)</h2>
        <div className="flex shrink-0 flex-wrap gap-4 text-xs text-(--muted)">
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-3 rounded-sm bg-blue-600 dark:bg-blue-500" />
            Previsto
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-3 rounded-sm bg-red-600 dark:bg-red-500" />
            Realizado
          </span>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto pb-2">
        <div className="flex min-h-[240px] items-end justify-start gap-4 px-1 sm:gap-6">
          {top10.map((s) => {
            const p = Number(s.planned_value)
            const a = Number(s.actual_value)
            const hp = maxMag > 0 ? (p / maxMag) * 100 : 0
            const ha = maxMag > 0 ? (a / maxMag) * 100 : 0
            const lab = labelFor(s)
            return (
              <div
                key={`${s.group_name}-${s.subgroup_name}`}
                className="flex w-[88px] shrink-0 flex-col items-center gap-2 sm:w-[104px]"
              >
                <div className="flex h-52 w-full items-end justify-center gap-1.5">
                  <div
                    className="flex h-full w-[38%] max-w-9 flex-col justify-end rounded-t bg-slate-800/60 dark:bg-slate-900/80"
                    title={`Previsto: ${formatBRL(p)}`}
                  >
                    <div
                      className="w-full rounded-t bg-blue-600 motion-safe:transition-[height] motion-safe:duration-300 motion-reduce:transition-none dark:bg-blue-500"
                      style={{
                        height: `${Math.min(100, hp)}%`,
                        minHeight: p > 0 ? '3px' : 0,
                      }}
                    />
                  </div>
                  <div
                    className="flex h-full w-[38%] max-w-9 flex-col justify-end rounded-t bg-slate-800/60 dark:bg-slate-900/80"
                    title={`Realizado: ${formatBRL(a)}`}
                  >
                    <div
                      className="w-full rounded-t bg-red-600 motion-safe:transition-[height] motion-safe:duration-300 motion-reduce:transition-none dark:bg-red-500"
                      style={{
                        height: `${Math.min(100, ha)}%`,
                        minHeight: a > 0 ? '3px' : 0,
                      }}
                    />
                  </div>
                </div>
                <p
                  className="w-full px-0.5 text-center text-[10px] leading-tight text-(--text) sm:text-[11px]"
                  title={lab}
                >
                  <span className="line-clamp-3">{lab}</span>
                </p>
                <div className="w-full space-y-0.5 text-center text-[9px] tabular-nums leading-tight text-(--muted) sm:text-[10px]">
                  <div>O {formatBRL(p)}</div>
                  <div>R {formatBRL(a)}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
