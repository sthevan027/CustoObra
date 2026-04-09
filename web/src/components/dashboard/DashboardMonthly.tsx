import { useMemo } from 'react'
import type { MonthRow } from '../../lib/dashboardTypes'
import { formatBRL, formatBRLAxis } from '../../lib/money'

type Props = {
  months: MonthRow[]
  totalPlanned: number
  formatMonthLabel: (iso: string) => string
}

const BAR_W = 16
const BAR_GAP = 5
const PAD_L = 58
/** Altura área útil — valores do mês (escala local) */
const H_MONTH = 152
/** Altura área útil — acumulado */
const H_CUM = 176
const GAP_SECTION = 36

export function DashboardMonthly({ months, totalPlanned, formatMonthLabel }: Props) {
  const n = months.length
  const uniformMonthly = n > 0 ? totalPlanned / n : 0

  const cumulativeRows = useMemo(() => {
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
  }, [months, totalPlanned, n])

  /** Escala só para barras mensais — previsto e real ficam comparáveis */
  const monthMaxY = useMemo(() => {
    let m = Math.max(uniformMonthly, 1)
    for (const row of months) m = Math.max(m, Number(row.actual_value))
    return m
  }, [months, uniformMonthly])

  /** Escala para curvas acumuladas */
  const cumMaxY = useMemo(() => {
    let m = Math.max(totalPlanned, 1)
    for (const r of cumulativeRows) {
      m = Math.max(m, r.cumActual, r.plannedLinearEnd)
    }
    return m
  }, [totalPlanned, cumulativeRows])

  const colW = BAR_W * 2 + BAR_GAP + 20
  const svgW = Math.max(n * colW + PAD_L + 28, 300)

  const topPad = 20
  const monthBottom = topPad + H_MONTH
  const cumTop = monthBottom + GAP_SECTION
  const cumBottom = cumTop + H_CUM
  const svgH = cumBottom + 44

  const yMonth = (v: number) =>
    monthBottom - (monthMaxY > 0 ? (v / monthMaxY) * H_MONTH : 0)
  const yCum = (v: number) =>
    cumBottom - (cumMaxY > 0 ? (v / cumMaxY) * H_CUM : 0)

  const cx = (i: number) => PAD_L + i * colW + colW / 2

  const linePlanned = cumulativeRows
    .map((r, i) => {
      const x = cx(i)
      const y = yCum(r.plannedLinearEnd)
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')

  const lineActual = cumulativeRows
    .map((r, i) => {
      const x = cx(i)
      const y = yCum(r.cumActual)
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')

  const last = cumulativeRows[cumulativeRows.length - 1]

  return (
    <div className="space-y-5">
      {/* Painel numérico */}
      {months.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-(--border) bg-slate-50/90 px-3 py-3 dark:bg-slate-800/50">
            <p className="text-[11px] font-medium uppercase tracking-wide text-(--muted)">
              Ref. linear / mês
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-(--text)">
              {formatBRL(uniformMonthly)}
            </p>
          </div>
          <div className="rounded-xl border border-(--border) bg-slate-50/90 px-3 py-3 dark:bg-slate-800/50">
            <p className="text-[11px] font-medium uppercase tracking-wide text-(--muted)">
              Real no período (último mês)
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
              {formatBRL(months.length ? Number(months[months.length - 1]!.actual_value) : 0)}
            </p>
          </div>
          <div className="rounded-xl border border-(--border) bg-slate-50/90 px-3 py-3 dark:bg-slate-800/50">
            <p className="text-[11px] font-medium uppercase tracking-wide text-(--muted)">
              Previsto acum. (linear)
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-blue-600 dark:text-blue-400">
              {last ? formatBRL(last.plannedLinearEnd) : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-(--border) bg-slate-50/90 px-3 py-3 dark:bg-slate-800/50">
            <p className="text-[11px] font-medium uppercase tracking-wide text-(--muted)">
              Real acumulado
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
              {last ? formatBRL(last.cumActual) : '—'}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-(--border) pb-3 text-[11px] text-(--muted)">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
          Previsto (mês)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-600" />
          Real (mês)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-px w-5 bg-blue-500" />
          Previsto acum.
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-px w-5 bg-red-500" />
          Real acum.
        </span>
      </div>

      {months.length === 0 ? (
        <p className="text-sm text-(--muted)">Sem lançamentos ainda.</p>
      ) : (
        <div className="rounded-2xl border border-(--border) bg-(--card) p-3 shadow-sm sm:p-4">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="h-auto w-full max-w-full"
            preserveAspectRatio="xMidYMin meet"
            role="img"
            aria-label="Evolução mensal em duas faixas: valores do mês e acumulado"
          >
            {/* Título faixa 1 */}
            <text
              x={PAD_L}
              y={14}
              fill="var(--muted)"
              fontSize={11}
              fontWeight={600}
            >
              Valores do mês (escala própria — compare P e R)
            </text>

            {/* Grid mês */}
            {[0, 0.5, 1].map((t) => {
              const y = topPad + t * H_MONTH
              return (
                <line
                  key={`mg-${t}`}
                  x1={PAD_L - 6}
                  y1={y}
                  x2={svgW - 8}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  strokeWidth={1}
                />
              )
            })}
            {[0, 0.5, 1].map((t) => {
              const val = (1 - t) * monthMaxY
              const y = topPad + t * H_MONTH
              return (
                <text
                  key={`my-${t}`}
                  x={PAD_L - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--muted)"
                  fontSize={10}
                  className="tabular-nums"
                >
                  {formatBRLAxis(val)}
                </text>
              )
            })}

            {/* Barras mensais */}
            {months.map((row, i) => {
              const actual = Number(row.actual_value)
              const xBase = cx(i) - (BAR_W + BAR_GAP / 2)
              const hP = monthMaxY > 0 ? (uniformMonthly / monthMaxY) * H_MONTH : 0
              const hA = monthMaxY > 0 ? (actual / monthMaxY) * H_MONTH : 0
              const yP = monthBottom - hP
              const yA = monthBottom - hA
              return (
                <g key={`b-${row.month}`}>
                  <rect
                    x={xBase - BAR_W / 2}
                    y={yP}
                    width={BAR_W}
                    height={Math.max(hP, uniformMonthly > 0 ? 2 : 0)}
                    rx={3}
                    fill="rgb(37 99 235)"
                    opacity={0.9}
                  />
                  <rect
                    x={xBase + BAR_W / 2 + BAR_GAP}
                    y={yA}
                    width={BAR_W}
                    height={Math.max(hA, actual > 0 ? 2 : 0)}
                    rx={3}
                    fill="rgb(220 38 38)"
                    opacity={0.92}
                  />
                </g>
              )
            })}

            {/* Título faixa 2 */}
            <text
              x={PAD_L}
              y={cumTop - 8}
              fill="var(--muted)"
              fontSize={11}
              fontWeight={600}
            >
              Acumulado (curva linear × real — escala até o contrato)
            </text>

            {/* Grid acumulado */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = cumTop + t * H_CUM
              return (
                <line
                  key={`cg-${t}`}
                  x1={PAD_L - 6}
                  y1={y}
                  x2={svgW - 8}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  strokeWidth={1}
                />
              )
            })}
            {[0, 0.5, 1].map((t) => {
              const val = (1 - t) * cumMaxY
              const y = cumTop + t * H_CUM
              return (
                <text
                  key={`cy-${t}`}
                  x={PAD_L - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--muted)"
                  fontSize={10}
                  className="tabular-nums"
                >
                  {formatBRLAxis(val)}
                </text>
              )
            })}

            {/* Linhas acumulado — por cima */}
            {cumulativeRows.length > 1 ? (
              <>
                <path
                  d={linePlanned}
                  fill="none"
                  stroke="rgb(59 130 246)"
                  strokeWidth={2.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={lineActual}
                  fill="none"
                  stroke="rgb(239 68 68)"
                  strokeWidth={2.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            ) : cumulativeRows.length === 1 ? (
              <>
                <circle
                  cx={cx(0)}
                  cy={yCum(cumulativeRows[0]!.plannedLinearEnd)}
                  r={6}
                  fill="rgb(59 130 246)"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
                <circle
                  cx={cx(0)}
                  cy={yCum(cumulativeRows[0]!.cumActual)}
                  r={6}
                  fill="rgb(239 68 68)"
                  stroke="var(--card)"
                  strokeWidth={2}
                />
                <line
                  x1={cx(0)}
                  y1={yCum(cumulativeRows[0]!.plannedLinearEnd)}
                  x2={cx(0)}
                  y2={yCum(cumulativeRows[0]!.cumActual)}
                  stroke="currentColor"
                  strokeOpacity={0.25}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              </>
            ) : null}

            {/* Meses eixo X */}
            {months.map((row, i) => (
              <text
                key={`x-${row.month}`}
                x={cx(i)}
                y={cumBottom + 16}
                textAnchor="middle"
                fill="var(--text)"
                fontSize={11}
                className="font-medium capitalize"
              >
                {formatMonthLabel(row.month)}
              </text>
            ))}
          </svg>

          {/* Tabela resumo Δ */}
          <div className="mt-4 border-t border-(--border) pt-4">
            <p className="mb-2 text-xs font-medium text-(--muted)">
              Variação vs curva prevista acumulada (linear)
            </p>
            <div className="space-y-2">
              {cumulativeRows.map((r) => {
                const delta = r.cumActual - r.plannedLinearEnd
                const over = delta > 0
                return (
                  <div
                    key={`d-${r.month}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--border)/60 bg-slate-50/50 px-3 py-2 text-sm dark:bg-slate-800/30"
                  >
                    <span className="capitalize text-(--text)">
                      {formatMonthLabel(r.month)}
                    </span>
                    <span className="tabular-nums">
                      <span className="text-(--muted)">Δ </span>
                      <span
                        className={
                          over
                            ? 'font-medium text-rose-600 dark:text-rose-400'
                            : delta < 0
                              ? 'font-medium text-slate-600 dark:text-slate-300'
                              : 'text-(--text)'
                        }
                      >
                        {delta >= 0 ? '+' : ''}
                        {formatBRL(delta)}
                      </span>
                      <span className="ml-2 text-[10px] text-(--muted)">
                        {over ? '(acima da curva)' : delta < 0 ? '(abaixo da curva)' : ''}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
