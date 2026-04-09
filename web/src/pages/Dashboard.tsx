import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getErrorMessage } from '../lib/supabaseError'
import { formatBRL } from '../lib/money'
import { sortActivitiesByRisk } from '../lib/dashboardRisk'
import {
  normalizeStatus,
  statusBadgeClass,
  statusLabelPt,
} from '../lib/statusLabels'
import type {
  ActivityRow,
  GroupRow,
  MonthRow,
  SubgroupRow,
} from '../lib/dashboardTypes'
import { DashboardMonthly } from '../components/dashboard/DashboardMonthly'
import { DashboardSkeleton } from '../components/dashboard/DashboardSkeleton'

const CONTRACT_LABEL =
  (import.meta.env.VITE_CONTRACT_LABEL as string | undefined)?.trim() || 'Contrato'

function formatMonthLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
}

type GroupSortCol =
  | 'group_name'
  | 'planned_value'
  | 'actual_value'
  | 'balance'
  | 'percent_used'
  | 'status'
type SubgroupSortCol =
  | 'group_name'
  | 'subgroup_name'
  | 'planned_value'
  | 'actual_value'
  | 'balance'
  | 'percent_used'
  | 'status'

function downloadCsv(name: string, headers: string[], rows: (string | number)[][]) {
  const esc = (c: string | number) => {
    const s = String(c)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.join(','), ...rows.map((r) => r.map(esc).join(','))]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export function Dashboard() {
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [subgroups, setSubgroups] = useState<SubgroupRow[]>([])
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const [months, setMonths] = useState<MonthRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [reconOpen, setReconOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<'group' | 'subgroup'>('group')
  const [filterQuery, setFilterQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortGroup, setSortGroup] = useState<{ col: GroupSortCol; asc: boolean }>({
    col: 'group_name',
    asc: true,
  })
  const [sortSubgroup, setSortSubgroup] = useState<{ col: SubgroupSortCol; asc: boolean }>({
    col: 'group_name',
    asc: true,
  })

  useEffect(() => {
    let ok = true
    ;(async () => {
      setErr(null)
      setLoading(true)
      try {
        const [g, sg, a, m] = await Promise.all([
          supabase.from('vw_group_cost_summary').select('*').order('group_name'),
          supabase
            .from('vw_subgroup_cost_summary')
            .select('*')
            .order('group_name')
            .order('subgroup_name'),
          supabase.from('vw_activity_cost_analysis').select('*'),
          supabase.from('vw_monthly_total_actuals').select('*').order('month'),
        ])
        if (g.error) throw g.error
        if (sg.error) throw sg.error
        if (a.error) throw a.error
        if (m.error) throw m.error
        if (!ok) return
        setGroups((g.data ?? []) as GroupRow[])
        setSubgroups((sg.data ?? []) as SubgroupRow[])
        setActivities((a.data ?? []) as ActivityRow[])
        setMonths((m.data ?? []) as MonthRow[])
        setLoadedAt(new Date())
      } catch (e: unknown) {
        if (ok) setErr(getErrorMessage(e))
      } finally {
        if (ok) setLoading(false)
      }
    })()
    return () => {
      ok = false
    }
  }, [])

  const totalsPrimary = useMemo(() => {
    let p = 0
    let ac = 0
    for (const g of groups) {
      p += Number(g.planned_value)
      ac += Number(g.actual_value)
    }
    const bal = p - ac
    return {
      planned: p,
      actual: ac,
      balance: bal,
      pct: p > 0 ? ac / p : null,
    }
  }, [groups])

  const totalsContract = useMemo(() => {
    let p = 0
    let ac = 0
    for (const r of activities) {
      p += Number(r.planned_value)
      ac += Number(r.actual_value)
    }
    const bal = p - ac
    return {
      planned: p,
      actual: ac,
      balance: bal,
      pct: p > 0 ? ac / p : null,
    }
  }, [activities])

  const reconDiff = useMemo(() => {
    return {
      planned: totalsPrimary.planned - totalsContract.planned,
      actual: totalsPrimary.actual - totalsContract.actual,
    }
  }, [totalsPrimary, totalsContract])

  const hasReconGap =
    Math.abs(reconDiff.planned) > 0.01 || Math.abs(reconDiff.actual) > 0.01

  const health = useMemo(() => {
    const o = { over: 0, high: 0, warn: 0, ok: 0 }
    for (const a of activities) {
      const k = normalizeStatus(a.status)
      if (k === 'OVERBUDGET') o.over++
      else if (k === 'HIGH_USAGE') o.high++
      else if (k === 'WARNING') o.warn++
      else o.ok++
    }
    return o
  }, [activities])

  const riskItems = useMemo(() => sortActivitiesByRisk(activities).slice(0, 5), [activities])

  const q = filterQuery.trim().toLowerCase()

  const filteredGroups = useMemo(() => {
    let r = groups.filter((g) => !q || g.group_name.toLowerCase().includes(q))
    if (statusFilter !== 'all') {
      r = r.filter((g) => normalizeStatus(g.status) === statusFilter)
    }
    return r
  }, [groups, q, statusFilter])

  const filteredSubgroups = useMemo(() => {
    let r = subgroups.filter(
      (s) =>
        !q ||
        s.group_name.toLowerCase().includes(q) ||
        s.subgroup_name.toLowerCase().includes(q)
    )
    if (statusFilter !== 'all') {
      r = r.filter((s) => normalizeStatus(s.status) === statusFilter)
    }
    return r
  }, [subgroups, q, statusFilter])

  const sortedGroups = useMemo(() => {
    const { col, asc } = sortGroup
    const copy = [...filteredGroups]
    const num = (r: GroupRow, c: GroupSortCol) => {
      switch (c) {
        case 'planned_value':
          return Number(r.planned_value)
        case 'actual_value':
          return Number(r.actual_value)
        case 'balance':
          return Number(r.balance)
        case 'percent_used':
          return r.percent_used != null ? Number(r.percent_used) : -1
        case 'status':
          return statusLabelPt(r.status)
        default:
          return r.group_name
      }
    }
    copy.sort((a, b) => {
      const va = num(a, col)
      const vb = num(b, col)
      if (typeof va === 'string' && typeof vb === 'string') {
        const c = va.localeCompare(vb, 'pt-BR')
        return asc ? c : -c
      }
      const na = va as number
      const nb = vb as number
      return asc ? na - nb : nb - na
    })
    return copy
  }, [filteredGroups, sortGroup])

  const sortedSubgroups = useMemo(() => {
    const { col, asc } = sortSubgroup
    const copy = [...filteredSubgroups]
    const num = (r: SubgroupRow, c: SubgroupSortCol) => {
      switch (c) {
        case 'planned_value':
          return Number(r.planned_value)
        case 'actual_value':
          return Number(r.actual_value)
        case 'balance':
          return Number(r.balance)
        case 'percent_used':
          return r.percent_used != null ? Number(r.percent_used) : -1
        case 'status':
          return statusLabelPt(r.status)
        case 'subgroup_name':
          return r.subgroup_name
        default:
          return r.group_name
      }
    }
    copy.sort((a, b) => {
      const va = num(a, col)
      const vb = num(b, col)
      if (typeof va === 'string' && typeof vb === 'string') {
        const c = va.localeCompare(vb, 'pt-BR')
        return asc ? c : -c
      }
      const na = va as number
      const nb = vb as number
      return asc ? na - nb : nb - na
    })
    return copy
  }, [filteredSubgroups, sortSubgroup])

  const footerGroups = useMemo(() => {
    let p = 0
    let a = 0
    for (const r of sortedGroups) {
      p += Number(r.planned_value)
      a += Number(r.actual_value)
    }
    return { planned: p, actual: a, balance: p - a }
  }, [sortedGroups])

  const footerSubgroups = useMemo(() => {
    let p = 0
    let a = 0
    for (const r of sortedSubgroups) {
      p += Number(r.planned_value)
      a += Number(r.actual_value)
    }
    return { planned: p, actual: a, balance: p - a }
  }, [sortedSubgroups])

  const dataThrough = months.length > 0 ? months[months.length - 1].month : null

  const toggleGroupSort = (col: GroupSortCol) => {
    setSortGroup((s) =>
      s.col === col ? { col, asc: !s.asc } : { col, asc: col === 'group_name' }
    )
  }

  const toggleSubgroupSort = (col: SubgroupSortCol) => {
    setSortSubgroup((s) =>
      s.col === col ? { col, asc: !s.asc } : { col, asc: col === 'group_name' || col === 'subgroup_name' }
    )
  }

  const exportDetailCsv = () => {
    if (detailTab === 'group') {
      downloadCsv(
        'dashboard-grupos.csv',
        ['Grupo', 'Previsto', 'Real', 'Saldo', '%', 'Status'],
        sortedGroups.map((r) => [
          r.group_name,
          formatBRL(r.planned_value),
          formatBRL(r.actual_value),
          formatBRL(r.balance),
          r.percent_used != null ? `${(Number(r.percent_used) * 100).toFixed(1)}%` : '—',
          statusLabelPt(r.status),
        ])
      )
    } else {
      downloadCsv(
        'dashboard-subgrupos.csv',
        ['Grupo', 'Subgrupo', 'Previsto', 'Real', 'Saldo', '%', 'Status'],
        sortedSubgroups.map((r) => [
          r.group_name,
          r.subgroup_name,
          formatBRL(r.planned_value),
          formatBRL(r.actual_value),
          formatBRL(r.balance),
          r.percent_used != null ? `${(Number(r.percent_used) * 100).toFixed(1)}%` : '—',
          statusLabelPt(r.status),
        ])
      )
    }
  }

  if (loading) {
    return <DashboardSkeleton />
  }

  if (err) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 dark:bg-red-950/40 dark:text-red-100">
        <p className="font-medium">Não foi possível conectar ao Supabase</p>
        <p className="mt-1 text-sm">{err}</p>
        <p className="mt-2 text-sm">
          Confira <code className="rounded bg-red-100 px-1 dark:bg-red-900">web/.env</code> com{' '}
          <code className="rounded bg-red-100 px-1 dark:bg-red-900">VITE_SUPABASE_URL</code> e{' '}
          <code className="rounded bg-red-100 px-1 dark:bg-red-900">VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    )
  }

  const semDados =
    totalsPrimary.planned === 0 &&
    totalsPrimary.actual === 0 &&
    groups.length === 0

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)]">
            Visão do contrato — orçado × realizado
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
            KPIs principais alinham com a soma dos grupos (exceto Total). Itens do grupo Total alimentam a análise
            por atividade e a lista de prioridades.
          </p>
        </div>
        <div className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--muted)]">
          <div className="font-medium text-[var(--text)]">{CONTRACT_LABEL}</div>
          {dataThrough && (
            <div className="mt-1">Dados até {formatMonthLabel(dataThrough)}</div>
          )}
          {loadedAt && (
            <div className="mt-0.5">
              Atualizado em{' '}
              {loadedAt.toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </div>
          )}
        </div>
      </div>

      {semDados && (
        <div className="rounded-xl border border-amber-400/60 bg-amber-50 p-4 text-left text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">Nenhum dado apareceu (tudo zerado)</p>
          <p className="mt-2 text-sm">
            No Supabase isso costuma ser <strong>RLS</strong> sem política (a API devolve 0 linhas) ou o projeto
            ainda <strong>sem seed</strong>.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>
              Rode no SQL Editor o arquivo{' '}
              <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">Supabase/rls_policies.sql</code>
            </li>
            <li>
              Confirme que rodou <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">schema.sql</code>,{' '}
              <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">seed.generated.sql</code> e que as
              views existem
            </li>
            <li>
              Use a chave <strong>anon</strong> (não service_role) no{' '}
              <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">web/.env</code> e reinicie o{' '}
              <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">pnpm dev</code>
            </li>
          </ol>
        </div>
      )}

      <section className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Total previsto (grupos)
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{formatBRL(totalsPrimary.planned)}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Total real (grupos)
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{formatBRL(totalsPrimary.actual)}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Saldo</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{formatBRL(totalsPrimary.balance)}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">% consumido</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {totalsPrimary.pct != null ? `${(totalsPrimary.pct * 100).toFixed(2)}%` : '—'}
            </div>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          <strong className="text-[var(--text)]">Base dos cards:</strong> soma de{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">vw_group_cost_summary</code> (grupos MO/EQ/MAT
          etc., sem o grupo Total). Confere com a tabela de detalhamento abaixo.
        </p>
        {hasReconGap && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-50/90 p-3 text-sm text-amber-950 dark:bg-amber-950/25 dark:text-amber-50">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left font-medium"
              onClick={() => setReconOpen(!reconOpen)}
            >
              <span>Reconciliação: grupo Total (atividades) vs soma dos grupos</span>
              <span className="tabular-nums text-xs">{reconOpen ? '−' : '+'}</span>
            </button>
            {reconOpen && (
              <div className="mt-2 space-y-2 border-t border-amber-500/30 pt-2 text-xs dark:border-amber-500/20">
                <p>
                  Os itens em{' '}
                  <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/80">vw_activity_cost_analysis</code>{' '}
                  (apenas grupo Total no cadastro) somam valores diferentes da quebra por grupo — isso é esperado
                  quando o contrato usa linhas no Total e outras linhas nos grupos MO/EQ/MAT.
                </p>
                <ul className="list-inside list-disc space-y-1 tabular-nums">
                  <li>Previsto atividades (Total): {formatBRL(totalsContract.planned)}</li>
                  <li>Previsto grupos (soma): {formatBRL(totalsPrimary.planned)}</li>
                  <li>
                    Δ previsto: {reconDiff.planned >= 0 ? '+' : ''}
                    {formatBRL(reconDiff.planned)}
                  </li>
                  <li>
                    Δ real: {reconDiff.actual >= 0 ? '+' : ''}
                    {formatBRL(reconDiff.actual)}
                  </li>
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--text)]">Saúde por item (grupo Total)</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Contagem das atividades analisadas no grupo Total — onde os alertas de orçamento são calculados.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-rose-500/10 px-3 py-1.5 text-sm">
            <span className="font-semibold text-rose-800 dark:text-rose-200">{health.over}</span>
            <span className="text-[var(--muted)]">acima do orçado</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-sky-500/10 px-3 py-1.5 text-sm">
            <span className="font-semibold text-sky-800 dark:text-sky-200">{health.high}</span>
            <span className="text-[var(--muted)]">alto uso (≥90%)</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-amber-500/10 px-3 py-1.5 text-sm">
            <span className="font-semibold text-amber-800 dark:text-amber-200">{health.warn}</span>
            <span className="text-[var(--muted)]">atenção (70–90%)</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-emerald-500/10 px-3 py-1.5 text-sm">
            <span className="font-semibold text-emerald-800 dark:text-emerald-200">{health.ok}</span>
            <span className="text-[var(--muted)]">no orçamento (&lt;70%)</span>
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
          <span className="font-medium text-[var(--text)]">Legenda:</span>
          {(
            [
              ['OVERBUDGET', 'Acima do orçado'],
              ['HIGH_USAGE', 'Alto uso (≥90%)'],
              ['WARNING', 'Atenção (70–90%)'],
              ['OK', 'No orçamento'],
            ] as const
          ).map(([code, label]) => (
            <span key={code} className="inline-flex items-center gap-1.5">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusBadgeClass(code)}`}>
                {label}
              </span>
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Prioridades (maior risco primeiro)</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Ordenação: estouros (real &gt; previsto) pelo valor excedente; demais itens por maior % consumido e menor
          saldo. Até 5 itens — para editar valores, abra{' '}
          <Link className="font-medium text-[var(--accent)] underline-offset-2 hover:underline" to="/visual">
            Visual (Dados)
          </Link>
          .
        </p>
        <ul className="mt-3 space-y-3">
          {riskItems.map((r) => (
            <li
              key={r.item_id}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm shadow-sm"
            >
              <div className="font-medium leading-snug">
                {r.item_code} · {r.item_name.slice(0, 96)}
                {r.item_name.length > 96 ? '…' : ''}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                <div>
                  <span className="text-[var(--muted)]">Previsto</span>
                  <div className="tabular-nums font-medium">{formatBRL(r.planned_value)}</div>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Real</span>
                  <div className="tabular-nums font-medium">{formatBRL(r.actual_value)}</div>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Saldo</span>
                  <div className="tabular-nums font-medium">{formatBRL(r.balance)}</div>
                </div>
                <div>
                  <span className="text-[var(--muted)]">% · status</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums font-medium">
                      {r.percent_used != null ? `${(Number(r.percent_used) * 100).toFixed(2)}%` : '—'}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusBadgeClass(r.status)}`}
                    >
                      {statusLabelPt(r.status)}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Evolução mensal (grupo Total)</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Lançamentos associados a itens do grupo Total. Referência linear usa o previsto total dos grupos da tabela
          abaixo ({formatBRL(totalsPrimary.planned)}).
        </p>
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <DashboardMonthly
            months={months}
            totalPlanned={totalsPrimary.planned}
            formatMonthLabel={formatMonthLabel}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Detalhamento</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Filtros e exportação aplicam-se à tabela visível. Subgrupos: soma por grupo + subgrupo (exceto grupo
              Total no cadastro).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 transition-colors ${
                detailTab === 'group'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] ring-[var(--accent)]/30'
                  : 'border border-[var(--border)] bg-[var(--card)] hover:bg-slate-50 dark:hover:bg-slate-800/80'
              }`}
              onClick={() => setDetailTab('group')}
            >
              Por grupo
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 transition-colors ${
                detailTab === 'subgroup'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] ring-[var(--accent)]/30'
                  : 'border border-[var(--border)] bg-[var(--card)] hover:bg-slate-50 dark:hover:bg-slate-800/80'
              }`}
              onClick={() => setDetailTab('subgroup')}
            >
              Por subgrupo
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800/80"
              onClick={exportDetailCsv}
            >
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-medium text-[var(--muted)]">
            Buscar
            <input
              type="search"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Nome do grupo ou subgrupo"
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)]"
            />
          </label>
          <label className="flex w-full min-w-[180px] flex-col gap-1 text-xs font-medium text-[var(--muted)] sm:w-auto">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)]"
            >
              <option value="all">Todos</option>
              <option value="OVERBUDGET">Acima do orçado</option>
              <option value="HIGH_USAGE">Alto uso (≥90%)</option>
              <option value="WARNING">Atenção (70–90%)</option>
              <option value="OK">No orçamento</option>
            </select>
          </label>
        </div>

        {detailTab === 'group' ? (
          <div className="max-h-[min(70vh,640px)] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-slate-50 dark:bg-slate-800/95">
                <tr>
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleGroupSort('group_name')}
                    >
                      Grupo {sortGroup.col === 'group_name' ? (sortGroup.asc ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleGroupSort('planned_value')}
                    >
                      Previsto {sortGroup.col === 'planned_value' ? (sortGroup.asc ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleGroupSort('actual_value')}
                    >
                      Real {sortGroup.col === 'actual_value' ? (sortGroup.asc ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleGroupSort('balance')}
                    >
                      Saldo {sortGroup.col === 'balance' ? (sortGroup.asc ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleGroupSort('percent_used')}
                    >
                      % {sortGroup.col === 'percent_used' ? (sortGroup.asc ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleGroupSort('status')}
                    >
                      Status {sortGroup.col === 'status' ? (sortGroup.asc ? '↑' : '↓') : ''}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedGroups.map((r, i) => (
                  <tr
                    key={r.group_name}
                    className={`border-b border-[var(--border)] last:border-0 ${
                      i % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-medium">{r.group_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(r.planned_value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(r.actual_value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(r.balance)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.percent_used != null ? `${(Number(r.percent_used) * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusBadgeClass(r.status)}`}
                      >
                        {statusLabelPt(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-10 border-t-2 border-[var(--border)] bg-slate-100/95 font-medium dark:bg-slate-900/95">
                <tr>
                  <td className="px-3 py-2">Total (visível)</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBRL(footerGroups.planned)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBRL(footerGroups.actual)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBRL(footerGroups.balance)}</td>
                  <td className="px-3 py-2 text-right text-[var(--muted)]">—</td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="max-h-[min(70vh,640px)] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-slate-50 dark:bg-slate-800/95">
                <tr>
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleSubgroupSort('group_name')}
                    >
                      Grupo {sortSubgroup.col === 'group_name' ? (sortSubgroup.asc ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleSubgroupSort('subgroup_name')}
                    >
                      Subgrupo {sortSubgroup.col === 'subgroup_name' ? (sortSubgroup.asc ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleSubgroupSort('planned_value')}
                    >
                      Previsto {sortSubgroup.col === 'planned_value' ? (sortSubgroup.asc ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleSubgroupSort('actual_value')}
                    >
                      Real {sortSubgroup.col === 'actual_value' ? (sortSubgroup.asc ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleSubgroupSort('balance')}
                    >
                      Saldo {sortSubgroup.col === 'balance' ? (sortSubgroup.asc ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleSubgroupSort('percent_used')}
                    >
                      % {sortSubgroup.col === 'percent_used' ? (sortSubgroup.asc ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      onClick={() => toggleSubgroupSort('status')}
                    >
                      Status {sortSubgroup.col === 'status' ? (sortSubgroup.asc ? '↑' : '↓') : ''}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSubgroups.map((r, i) => (
                  <tr
                    key={`${r.group_name}-${r.subgroup_name}`}
                    className={`border-b border-[var(--border)] last:border-0 ${
                      i % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''
                    }`}
                  >
                    <td className="px-3 py-2 align-top font-medium">{r.group_name}</td>
                    <td className="min-w-[220px] max-w-md break-words px-3 py-2 align-top">{r.subgroup_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">{formatBRL(r.planned_value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">{formatBRL(r.actual_value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">{formatBRL(r.balance)}</td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">
                      {r.percent_used != null ? `${(Number(r.percent_used) * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusBadgeClass(r.status)}`}
                      >
                        {statusLabelPt(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-10 border-t-2 border-[var(--border)] bg-slate-100/95 font-medium dark:bg-slate-900/95">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>
                    Total (visível)
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBRL(footerSubgroups.planned)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBRL(footerSubgroups.actual)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBRL(footerSubgroups.balance)}</td>
                  <td className="px-3 py-2 text-right text-[var(--muted)]">—</td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
