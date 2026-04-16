-- Nome exibido no histórico de auditoria (join em vw_cost_audit_enriched).

alter table public.app_profiles
  add column if not exists display_name text null;

comment on column public.app_profiles.display_name is
  'Nome amigável do administrador; usado em cost_entries_audit via view.';

drop policy if exists "jl_profile_upd_own" on public.app_profiles;

create policy "jl_profile_upd_own"
  on public.app_profiles for update to authenticated
  using (auth.uid() = id and public.jl_is_cost_admin())
  with check (auth.uid() = id and public.jl_is_cost_admin());

grant update on table public.app_profiles to authenticated;

-- Nota: changed_by_name no *final* do SELECT — CREATE OR REPLACE VIEW não pode
-- inserir coluna no meio (Postgres acusa troca de nome item_id → changed_by_name).

create or replace view public.vw_cost_audit_enriched
with (security_invoker = true)
as
select
  ca.id,
  ca.cost_id,
  ca.action,
  ca.changed_at,
  ca.changed_by,
  coalesce(
    (ca.new_row->>'item_id')::bigint,
    (ca.old_row->>'item_id')::bigint
  ) as item_id,
  coalesce(ca.new_row->>'cost_date', ca.old_row->>'cost_date') as cost_date_text,
  coalesce((ca.new_row->>'amount')::numeric, (ca.old_row->>'amount')::numeric) as amount,
  i.name as item_name,
  g.name as group_name,
  ca.old_row,
  ca.new_row,
  nullif(trim(prof.display_name), '') as changed_by_name
from public.cost_entries_audit ca
left join public.app_profiles prof on prof.id = ca.changed_by
left join public.cost_items i
  on i.id = coalesce(
    (ca.new_row->>'item_id')::bigint,
    (ca.old_row->>'item_id')::bigint
  )
left join public.cost_groups g on g.id = i.group_id;
