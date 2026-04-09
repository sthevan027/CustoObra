import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { V } from '../lib/db/catalog'
import { formatBRL } from '../lib/money'

type EnrichedRow = {
  id: number
  cost_id: number | null
  action: string
  changed_at: string
  changed_by: string | null
  item_id: number | null
  cost_date_text: string | null
  amount: number | string | null
  item_name: string | null
  group_name: string | null
  old_row: Record<string, unknown> | null
  new_row: Record<string, unknown> | null
}

const ACTION_PT: Record<string, string> = {
  INSERT: 'Inclusão',
  UPDATE: 'Alteração',
  DELETE: 'Exclusão',
}

export function Historico() {
  const [rows, setRows] = useState<EnrichedRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    ;(async () => {
      setErr(null)
      const { data, error } = await supabase
        .from(V.cost_audit_enriched)
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(300)
      if (error) {
        setErr(error.message)
        setLoading(false)
        return
      }
      setRows((data ?? []) as EnrichedRow[])
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(() => {
    let r = rows
    if (actionFilter !== 'all') {
      r = r.filter((x) => x.action === actionFilter)
    }
    const t = q.trim().toLowerCase()
    if (t) {
      r = r.filter((row) => {
        const blob = [
          row.item_name,
          row.group_name,
          row.cost_id,
          row.action,
          row.cost_date_text,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return blob.includes(t)
      })
    }
    return r
  }, [rows, actionFilter, q])

  useEffect(() => {
    if (expanded != null && !filtered.some((r) => r.id === expanded)) {
      setExpanded(null)
    }
  }, [filtered, expanded])

  if (loading) {
    return <p className="text-(--muted)">Carregando histórico…</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Histórico de lançamentos</h1>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-medium text-(--muted)">
          Buscar
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Item, grupo, ação…"
            className="rounded-lg border border-(--border) bg-(--card) px-3 py-2 text-sm text-(--text)"
          />
        </label>
        <label className="flex w-full min-w-[160px] flex-col gap-1 text-xs font-medium text-(--muted) sm:w-auto">
          Tipo
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-(--border) bg-(--card) px-3 py-2 text-sm text-(--text)"
          >
            <option value="all">Todas</option>
            <option value="INSERT">Inclusões</option>
            <option value="UPDATE">Alterações</option>
            <option value="DELETE">Exclusões</option>
          </select>
        </label>
        <p className="text-xs text-(--muted)">
          {filtered.length} de {rows.length} evento(s)
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-(--border) bg-(--card)">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-(--border) bg-slate-50 dark:bg-slate-800/80">
              <th className="px-3 py-2.5 font-medium">Quando</th>
              <th className="px-3 py-2.5 font-medium">Ação</th>
              <th className="px-3 py-2.5 font-medium">Valor</th>
              <th className="px-3 py-2.5 font-medium">Competência</th>
              <th className="px-3 py-2.5 font-medium">Grupo</th>
              <th className="min-w-[200px] px-3 py-2.5 font-medium">Item</th>
              <th className="px-3 py-2.5 font-medium">ID custo</th>
              <th className="px-3 py-2.5 font-medium">Usuário</th>
              <th className="w-20 px-3 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const amt = r.amount != null ? Number(r.amount) : null
              const open = expanded === r.id
              const payload =
                r.action === 'DELETE' ? r.old_row : r.new_row ?? r.old_row
              return (
                <Fragment key={r.id}>
                  <tr
                    className="border-b border-(--border) align-top hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-(--muted)">
                      {new Date(r.changed_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium dark:bg-slate-800">
                        {ACTION_PT[r.action] ?? r.action}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {amt != null && !Number.isNaN(amt) ? formatBRL(amt) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-(--muted)">
                      {r.cost_date_text
                        ? new Date(r.cost_date_text + 'T12:00:00').toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                    <td
                      className="max-w-[140px] truncate px-3 py-2.5 text-(--muted)"
                      title={r.group_name ?? ''}
                    >
                      {r.group_name ?? '—'}
                    </td>
                    <td
                      className="max-w-xs px-3 py-2.5 text-xs leading-snug"
                      title={r.item_name ?? ''}
                    >
                      {r.item_name ?? (r.item_id != null ? `item #${r.item_id}` : '—')}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-(--muted)">{r.cost_id ?? '—'}</td>
                    <td className="max-w-[100px] truncate px-3 py-2.5 text-xs text-(--muted)">
                      {r.changed_by ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        className="text-xs font-medium text-(--accent) underline-offset-2 hover:underline"
                        onClick={() => setExpanded(open ? null : r.id)}
                      >
                        {open ? 'Fechar' : 'Auditoria'}
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-(--border) bg-slate-50/90 dark:bg-slate-900/40">
                      <td colSpan={9} className="px-3 py-3">
                        <p className="text-xs font-medium text-(--muted)">Payload bruto (JSON)</p>
                        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-(--card) p-3 text-xs leading-relaxed ring-1 ring-(--border)">
                          {JSON.stringify(payload, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && rows.length > 0 && (
        <p className="text-sm text-(--muted)">Nenhum evento com os filtros atuais.</p>
      )}
    </div>
  )
}
