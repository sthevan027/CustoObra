-- Executar no SQL Editor do Supabase se o projeto já existia antes desta alteração.
-- Permite apagar linhas de auditoria pelo app (histórico) sem mexer nos custos atuais.

drop policy if exists "jl_anon_delete_cost_entries_audit" on public.cost_entries_audit;

create policy "jl_anon_delete_cost_entries_audit"
  on public.cost_entries_audit for delete using (true);

grant delete on table public.cost_entries_audit to anon, authenticated;
