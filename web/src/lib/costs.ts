import type { SupabaseClient } from '@supabase/supabase-js'
import { T } from './db/catalog'

/** Substitui todos os lançamentos do item por um único valor (ajuste manual na tela Visual). */
export async function replaceItemActualWithManualTotal(
  client: SupabaseClient,
  itemId: number,
  amount: number,
  costDate: string
) {
  const { error: delErr } = await client
    .from(T.cost_entries)
    .delete()
    .eq('item_id', itemId)
  if (delErr) throw delErr

  const { error: insErr } = await client.from(T.cost_entries).insert({
    item_id: itemId,
    cost_date: costDate,
    amount,
    description: 'Ajuste manual (tela Visual)',
    external_id: 'MANUAL_UI_TOTAL',
  })
  if (insErr) throw insErr
}
