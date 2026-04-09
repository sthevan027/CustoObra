-- JL-DashboardCusto - PostgreSQL schema (Supabase-friendly)
--
-- Convenção de nomes (espelhada em web/src/lib/db/catalog.ts):
--   Tabelas: prefixo cost_* — dimensões (grupos, itens, orçamentos) e fatos
--            (cost_entries = lançamentos; cost_entries_audit = trilha de mudanças).
--   Views:   prefixo vw_cost_* — leitura/análise via PostgREST (todas com security_invoker).
--
-- Sections:
-- 1. Tables
-- 2. Indexes
-- 3. Seed data
-- 4. Views (com security_invoker para RLS)
-- 5. RLS + grants (tabelas + views no PostgREST)
-- 6. Queries (exemplos)

-- =========================
-- 1) TABLES
-- =========================

-- Groups are the top-level buckets (e.g., "Mão de Obra")
create table if not exists public.cost_groups (
  id bigint generated always as identity primary key,
  name text not null,
  code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_groups_name_uk unique (name)
);

-- Subgroups are optional children of groups
create table if not exists public.cost_subgroups (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.cost_groups(id) on delete restrict,
  name text not null,
  code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_subgroups_group_name_uk unique (group_id, name),
  constraint cost_subgroups_id_group_uk unique (id, group_id)
);

-- Items are the final tracking level (each item belongs to a group and optionally a subgroup)
create table if not exists public.cost_items (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.cost_groups(id) on delete restrict,
  subgroup_id bigint null,
  name text not null,
  code text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_items_group_name_uk unique (group_id, name),
  constraint cost_items_subgroup_consistency_fk
    foreign key (subgroup_id, group_id)
    references public.cost_subgroups(id, group_id)
    on delete restrict
);

-- Budgets store the planned value per item (total budget for that item)
create table if not exists public.cost_budgets (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.cost_items(id) on delete cascade,
  planned_value numeric(14,2) not null,
  currency_code char(3) not null default 'BRL',
  effective_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_budgets_item_uk unique (item_id),
  constraint cost_budgets_planned_value_ck check (planned_value >= 0)
);

-- Costs are the actual monthly execution values (can have multiple entries per item)
create table if not exists public.cost_entries (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.cost_items(id) on delete cascade,
  cost_date date not null,
  amount numeric(14,2) not null,
  description text null,
  external_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_entries_amount_ck check (amount >= 0),
  constraint cost_entries_item_external_uk unique (item_id, external_id)
);

-- Histórico/auditoria de lançamentos em cost_entries
-- Guarda "quem", "quando" e "o que mudou".
create table if not exists public.cost_entries_audit (
  id bigint generated always as identity primary key,
  cost_id bigint null,
  action text not null, -- INSERT | UPDATE | DELETE
  changed_at timestamptz not null default now(),
  changed_by uuid null, -- Supabase Auth user id (quando existir)
  old_row jsonb null,
  new_row jsonb null
);

-- =========================
-- 2) INDEXES
-- =========================

-- Foreign-key helper indexes (nomes com prefixo cost_* — evitam colisão com schema legado groups/items/…)
create index if not exists idx_cost_subgroups_group_id on public.cost_subgroups(group_id);
create index if not exists idx_cost_items_group_id on public.cost_items(group_id);
create index if not exists idx_cost_items_subgroup_id on public.cost_items(subgroup_id);
create index if not exists idx_cost_budgets_item_id on public.cost_budgets(item_id);

-- Costs performance indexes (as required)
create index if not exists idx_cost_entries_item_id on public.cost_entries(item_id);
create index if not exists idx_cost_entries_cost_date on public.cost_entries(cost_date);
create index if not exists idx_cost_entries_item_date on public.cost_entries(item_id, cost_date);

create index if not exists idx_cost_entries_audit_cost_id on public.cost_entries_audit(cost_id);
create index if not exists idx_cost_entries_audit_changed_at on public.cost_entries_audit(changed_at);

-- =========================
-- 3) SEED DATA
-- =========================

-- Seed gerado do Excel (Controle Operacional V2.xlsx) via scripts/generate_seed_from_excel.py
-- - Grupo 'Total': totais por item (código) da aba 'Dados'
-- - Demais grupos: quebra por Mão de Obra/Equipamento/Materiais quando existir
--
-- Observação: o mesmo código (items.code) pode existir no grupo Total e em
-- Mão de Obra/Equipamento/Materiais. A análise por atividade usa só o grupo
-- Total (`vw_cost_activity_analysis`). Os resumos por grupo/subgrupo usam
-- todas as linhas da quebra MO/EQ/MAT (`vw_cost_budget_line_unique`), sem
-- colapsar código — assim cada grupo aparece com o valor correto.

-- Groups
insert into public.cost_groups (name, code) values
  ('Mão de Obra','MO'),
  ('Equipamento','EQ'),
  ('Materiais','MAT'),
  ('Total','TOT')
on conflict (name) do nothing;

-- Subgroups
insert into public.cost_subgroups (group_id, name, code)
select g.id, s.name, s.code
from public.cost_groups g
join (values
  ('Mão de Obra','Mão de Obra','MO-M-O-DE-OBRA'),
  ('Equipamento','Banheiros hidráulicos','EQ-BANHEIROS-HIDR-ULICOS'),
  ('Equipamento','Caminhão pipa com operador','EQ-CAMINH-O-PIPA-COM-OPERAD'),
  ('Equipamento','Carro Leves','EQ-CARRO-LEVES'),
  ('Equipamento','Carros Leve','EQ-CARROS-LEVE'),
  ('Equipamento','Conteiner','EQ-CONTEINER'),
  ('Equipamento','Contêiner','EQ-CONT-INER'),
  ('Equipamento','Ferramenta de pequeno/médio porte','EQ-FERRAMENTA-DE-PEQUENO-M-'),
  ('Equipamento','Geral','EQ-GERAL'),
  ('Equipamento','Guindaste','EQ-GUINDASTE'),
  ('Equipamento','Guindastes','EQ-GUINDASTES'),
  ('Equipamento','Locação de Equipamento','EQ-LOCA-O-DE-EQUIPAMENTO'),
  ('Equipamento','Maquinas Pesadas','EQ-MAQUINAS-PESADAS'),
  ('Equipamento','Maquinas pesadas','EQ-MAQUINAS-PESADAS'),
  ('Equipamento','Munck','EQ-MUNCK'),
  ('Equipamento','Onibus','EQ-ONIBUS'),
  ('Equipamento','Outros','EQ-OUTROS'),
  ('Equipamento','REPAROS E IDENIZAÇÕES EM EQUIPAMENTOS DE PEQUENO E MÉDIO PORTE','EQ-REPAROS-E-IDENIZA-ES-EM-'),
  ('Equipamento','Ônibus transporte interno','EQ-NIBUS-TRANSPORTE-INTERNO'),
  ('Materiais','Andaime','MAT-ANDAIME'),
  ('Materiais','Caçamba','MAT-CA-AMBA'),
  ('Materiais','Caçambas','MAT-CA-AMBAS'),
  ('Materiais','Concreto/ controle tecnico','MAT-CONCRETO-CONTROLE-TECNIC'),
  ('Materiais','Consumiveis','MAT-CONSUMIVEIS'),
  ('Materiais','Consumo','MAT-CONSUMO'),
  ('Materiais','Consumíveis de instalação','MAT-CONSUM-VEIS-DE-INSTALA-O'),
  ('Materiais','Equipe MOD | Equipe MOI','MAT-EQUIPE-MOD-EQUIPE-MOI'),
  ('Materiais','Ferramental','MAT-FERRAMENTAL'),
  ('Materiais','Geral','MAT-GERAL'),
  ('Materiais','Locação','MAT-LOCA-O'),
  ('Materiais','Outros','MAT-OUTROS'),
  ('Total','Total','TOT-TOTAL')
) as s(group_name, name, code) on s.group_name=g.name
on conflict (group_id, name) do nothing;

-- Items (totais por código)
insert into public.cost_items (group_id, subgroup_id, name, code)
select g.id, sg.id, i.name, i.code
from public.cost_groups g
join public.cost_subgroups sg on sg.group_id=g.id
join (values
  ('Total','Total','Mobilização de equipe e equipamentos','1.1.1.1.1'),
  ('Total','Total','Desmobilização de equipe e equipamentos','1.1.1.1.2'),
  ('Total','Total','Construção de Canteiro Completo (Adm, Vestiários, Refeitório, Armazém, etc)','1.2.1.1'),
  ('Total','Total','Administração e Manutenção de Canteiro','1.2.1.2'),
  ('Total','Total','Desmobilização de Canteiro Completo (Adm, Vestiários, Refeitório, Armazém, etc)','1.2.1.3'),
  ('Total','Total','Administração Local','1.3.1.1')
  -- ... (seed completo continua no arquivo seed.generated.sql)
) as i(group_name, subgroup_name, name, code)
  on i.group_name=g.name and i.subgroup_name=sg.name
on conflict (group_id, name) do nothing;

-- IMPORTANTE:
-- O seed completo do Excel ficou em `Supabase/seed.generated.sql` porque é
-- extenso (dezenas de itens). Cole/execute esse arquivo no Supabase SQL Editor
-- junto com este schema para criar TODOS os itens e cost_budgets/cost_entries iniciais.

-- =========================
-- 4) VIEWS
-- =========================

-- =========================
-- 4.1) RULES (TRIGGERS / FUNCTIONS)
-- =========================

-- Impedir lançar custo para item sem budget
create or replace function public.fn_cost_entries_require_budget()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.cost_budgets b
    where b.item_id = new.item_id
  ) then
    raise exception 'Item % não possui orçamento (budgets). Crie o budget antes de lançar custos.', new.item_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cost_entries_require_budget on public.cost_entries;
create trigger trg_cost_entries_require_budget
before insert or update of item_id on public.cost_entries
for each row
execute function public.fn_cost_entries_require_budget();

-- Trilha de auditoria de lançamentos (INSERT/UPDATE/DELETE)
create or replace function public.fn_cost_entries_audit()
returns trigger
language plpgsql
as $$
declare
  v_user uuid;
begin
  -- Em projetos Supabase, auth.uid() retorna o usuário autenticado.
  -- Se o call estiver fora de um contexto autenticado, fica null.
  begin
    v_user := auth.uid();
  exception when undefined_function then
    v_user := null;
  end;

  if tg_op = 'INSERT' then
    insert into public.cost_entries_audit (cost_id, action, changed_by, old_row, new_row)
    values (new.id, 'INSERT', v_user, null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.cost_entries_audit (cost_id, action, changed_by, old_row, new_row)
    values (new.id, 'UPDATE', v_user, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.cost_entries_audit (cost_id, action, changed_by, old_row, new_row)
    values (old.id, 'DELETE', v_user, to_jsonb(old), null);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_cost_entries_audit on public.cost_entries;
create trigger trg_cost_entries_audit
after insert or update or delete on public.cost_entries
for each row
execute function public.fn_cost_entries_audit();

-- security_invoker: RLS das tabelas base (cost_items, cost_budgets, cost_entries, cost_groups, …) vale para quem consulta a view (anon/auth).
create or replace view public.vw_cost_analysis
with (security_invoker = true)
as
with actuals as (
  select
    c.item_id,
    sum(c.amount) as actual_value
  from public.cost_entries c
  group by c.item_id
)
select
  i.id as item_id,
  i.name as item_name,
  g.name as group_name,
  b.planned_value as planned_value,
  coalesce(a.actual_value, 0)::numeric(14,2) as actual_value,
  (b.planned_value - coalesce(a.actual_value, 0))::numeric(14,2) as balance,
  case
    when b.planned_value = 0 then null
    else (coalesce(a.actual_value, 0) / nullif(b.planned_value, 0))::numeric(14,4)
  end as percent_used,
  case
    when coalesce(a.actual_value, 0) > b.planned_value then 'OVERBUDGET'
    when coalesce(a.actual_value, 0) >= b.planned_value * 0.9 then 'HIGH_USAGE'
    when coalesce(a.actual_value, 0) >= b.planned_value * 0.7 then 'WARNING'
    else 'OK'
  end as status
from public.cost_items i
join public.cost_groups g on g.id = i.group_id
join public.cost_budgets b on b.item_id = i.id
left join actuals a on a.item_id = i.id;

-- Uma linha orçamentária por código lógico: evita somar duas vezes o mesmo
-- código quando existe no Total e também na quebra MO/EQ/MAT.
-- Ordem: preferir linhas fora do grupo Total quando o mesmo código aparece nos dois.
create or replace view public.vw_cost_budget_line_unique
with (security_invoker = true)
as
select
  v.item_id,
  v.item_name,
  v.group_name,
  v.planned_value,
  v.actual_value,
  v.balance,
  v.percent_used,
  v.status,
  i.code as item_code,
  i.id::text as dedup_key
from public.vw_cost_analysis v
join public.cost_items i on i.id = v.item_id
join public.cost_groups g on g.id = i.group_id
where g.name <> 'Total';

-- View agregada por grupo (cards e tabelas — soma da quebra MO/EQ/MAT)
create or replace view public.vw_cost_group_summary
with (security_invoker = true)
as
with group_totals as (
  select
    v.group_name,
    sum(v.planned_value)::numeric(14,2) as planned_value,
    sum(v.actual_value)::numeric(14,2) as actual_value
  from public.vw_cost_budget_line_unique v
  where v.group_name <> 'Total'
  group by v.group_name
)
select
  gt.group_name,
  gt.planned_value,
  gt.actual_value,
  (gt.planned_value - gt.actual_value)::numeric(14,2) as balance,
  case
    when gt.planned_value = 0 then null
    else (gt.actual_value / nullif(gt.planned_value, 0))::numeric(14,4)
  end as percent_used,
  case
    when gt.actual_value > gt.planned_value then 'OVERBUDGET'
    when gt.actual_value >= gt.planned_value * 0.9 then 'HIGH_USAGE'
    when gt.actual_value >= gt.planned_value * 0.7 then 'WARNING'
    else 'OK'
  end as status
from group_totals gt;

-- Agregado por subgrupo (mesma base que o resumo por grupo)
create or replace view public.vw_cost_subgroup_summary
with (security_invoker = true)
as
with sub_totals as (
  select
    g.name as group_name,
    coalesce(sg.name, '—') as subgroup_name,
    sum(v.planned_value)::numeric(14,2) as planned_value,
    sum(v.actual_value)::numeric(14,2) as actual_value
  from public.vw_cost_budget_line_unique v
  join public.cost_items i on i.id = v.item_id
  left join public.cost_subgroups sg on sg.id = i.subgroup_id
  join public.cost_groups g on g.id = i.group_id
  where g.name <> 'Total'
  group by g.name, coalesce(sg.name, '—')
)
select
  st.group_name,
  st.subgroup_name,
  st.planned_value,
  st.actual_value,
  (st.planned_value - st.actual_value)::numeric(14,2) as balance,
  case
    when st.planned_value = 0 then null
    else (st.actual_value / nullif(st.planned_value, 0))::numeric(14,4)
  end as percent_used,
  case
    when st.actual_value > st.planned_value then 'OVERBUDGET'
    when st.actual_value >= st.planned_value * 0.9 then 'HIGH_USAGE'
    when st.actual_value >= st.planned_value * 0.7 then 'WARNING'
    else 'OK'
  end as status
from sub_totals st;

-- View por item/código (totais por atividade)
-- Usa apenas o grupo 'Total' para evitar duplicidade com a quebra por MO/EQ/MAT.
create or replace view public.vw_cost_activity_analysis
with (security_invoker = true)
as
select
  v.item_id,
  v.item_name,
  v.planned_value,
  v.actual_value,
  v.balance,
  v.percent_used,
  v.status,
  -- no grupo Total, `item_code` fica em `items.code`
  i.code as item_code
from public.vw_cost_analysis v
join public.cost_items i on i.id = v.item_id
where v.group_name = 'Total';

-- View de evolução mensal por grupo (VP mês a mês)
create or replace view public.vw_cost_monthly_group_actuals
with (security_invoker = true)
as
select
  date_trunc('month', c.cost_date)::date as month,
  g.name as group_name,
  sum(c.amount)::numeric(14,2) as actual_value
from public.cost_entries c
join public.cost_items i on i.id = c.item_id
join public.cost_groups g on g.id = i.group_id
where g.name <> 'Total'
group by 1, 2
order by 1, 2;

-- Evolução mensal do real no mesmo universo dos lançamentos (MO/EQ/MAT — não grupo Total)
create or replace view public.vw_cost_monthly_total_actuals
with (security_invoker = true)
as
select
  date_trunc('month', c.cost_date)::date as month,
  sum(c.amount)::numeric(14,2) as actual_value
from public.cost_entries c
join public.cost_items i on i.id = c.item_id
join public.cost_groups g on g.id = i.group_id
where g.name <> 'Total'
group by 1
order by 1;

-- Lookup para selects (lançamentos) — itens com orçamento, exceto grupo Total
create or replace view public.vw_cost_item_lookup
with (security_invoker = true)
as
select
  i.id as item_id,
  i.code as item_code,
  i.name as item_name,
  g.name as group_name,
  sg.id as subgroup_id,
  sg.name as subgroup_name,
  b.planned_value
from public.cost_items i
join public.cost_groups g on g.id = i.group_id
left join public.cost_subgroups sg on sg.id = i.subgroup_id
join public.cost_budgets b on b.item_id = i.id
where g.name <> 'Total'
  and coalesce(i.is_active, true) = true;

-- Auditoria legível (join com item/grupo; valores extraídos do JSON)
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
  ca.new_row
from public.cost_entries_audit ca
left join public.cost_items i
  on i.id = coalesce(
    (ca.new_row->>'item_id')::bigint,
    (ca.old_row->>'item_id')::bigint
  )
left join public.cost_groups g on g.id = i.group_id;

-- Quebra estilo aba "Dados" (MO/EQ/MAT por código) para tela Visual
create or replace view public.vw_cost_visual_breakdown
with (security_invoker = true)
as
select
  v.item_id,
  v.item_name,
  v.group_name,
  i.code as item_code,
  i.subgroup_id,
  sg.name as subgroup_name,
  v.planned_value,
  v.actual_value,
  v.balance,
  v.percent_used,
  v.status
from public.vw_cost_analysis v
join public.cost_items i on i.id = v.item_id
left join public.cost_subgroups sg on sg.id = i.subgroup_id
where v.group_name <> 'Total';

-- =========================
-- 5) RLS + grants (tabelas base + uso das views no PostgREST)
-- =========================
-- As VIEWS não guardam linhas próprias: o acesso passa pelas tabelas base.
-- `security_invoker` nas views (acima) faz o Postgres aplicar RLS como o usuário da requisição (ex.: anon).
-- Políticas abaixo: app interno com chave anon no frontend (ajuste depois para auth.uid()).

alter table public.cost_groups enable row level security;
alter table public.cost_subgroups enable row level security;
alter table public.cost_items enable row level security;
alter table public.cost_budgets enable row level security;
alter table public.cost_entries enable row level security;
alter table public.cost_entries_audit enable row level security;

drop policy if exists "jl_anon_select_groups" on public.cost_groups;
drop policy if exists "jl_anon_select_subgroups" on public.cost_subgroups;
drop policy if exists "jl_anon_select_items" on public.cost_items;
drop policy if exists "jl_anon_all_budgets" on public.cost_budgets;
drop policy if exists "jl_anon_all_cost_entries" on public.cost_entries;
drop policy if exists "jl_anon_select_cost_entries_audit" on public.cost_entries_audit;
drop policy if exists "jl_anon_insert_cost_entries_audit" on public.cost_entries_audit;
drop policy if exists "jl_anon_update_subgroups" on public.cost_subgroups;

create policy "jl_anon_select_groups"
  on public.cost_groups for select using (true);

create policy "jl_anon_select_subgroups"
  on public.cost_subgroups for select using (true);

create policy "jl_anon_select_items"
  on public.cost_items for select using (true);

create policy "jl_anon_all_budgets"
  on public.cost_budgets for all using (true) with check (true);

create policy "jl_anon_all_cost_entries"
  on public.cost_entries for all using (true) with check (true);

create policy "jl_anon_select_cost_entries_audit"
  on public.cost_entries_audit for select using (true);

create policy "jl_anon_insert_cost_entries_audit"
  on public.cost_entries_audit for insert with check (true);

create policy "jl_anon_update_subgroups"
  on public.cost_subgroups for update using (true) with check (true);

-- API: leitura nas views expostas ao PostgREST (além das tabelas)
grant usage on schema public to anon, authenticated;
grant select on public.vw_cost_analysis to anon, authenticated;
grant select on public.vw_cost_budget_line_unique to anon, authenticated;
grant select on public.vw_cost_group_summary to anon, authenticated;
grant select on public.vw_cost_activity_analysis to anon, authenticated;
grant select on public.vw_cost_monthly_group_actuals to anon, authenticated;
grant select on public.vw_cost_monthly_total_actuals to anon, authenticated;
grant select on public.vw_cost_item_lookup to anon, authenticated;
grant select on public.vw_cost_visual_breakdown to anon, authenticated;
grant select on public.vw_cost_subgroup_summary to anon, authenticated;
grant select on public.vw_cost_audit_enriched to anon, authenticated;

comment on table public.cost_groups is 'Centros de custo de 1º nível (ex.: Mão de Obra, Equipamento, Materiais, Total).';
comment on table public.cost_subgroups is 'Subdivisão opcional dentro de um grupo (tipo de equipamento, etc.).';
comment on table public.cost_items is 'Linha orçamentária: item de custo vinculado a grupo e opcionalmente a subgrupo.';
comment on table public.cost_budgets is 'Valor previsto (orçado) por item; no máximo uma linha por item.';
comment on table public.cost_entries is 'Lançamentos de valor real (competência, valor, id externo opcional).';
comment on table public.cost_entries_audit is 'Trilha de auditoria dos lançamentos (INSERT/UPDATE/DELETE em cost_entries).';

comment on view public.vw_cost_analysis is 'Por item: previsto vs real, saldo, status e % utilizado.';
comment on view public.vw_cost_budget_line_unique is 'Análise por item deduplicada por código (exclui dupla contagem Total + MO/EQ/MAT).';
comment on view public.vw_cost_group_summary is 'Agregado por grupo (MO/EQ/MAT) para cards e tabelas.';
comment on view public.vw_cost_subgroup_summary is 'Agregado por grupo e subgrupo.';
comment on view public.vw_cost_activity_analysis is 'Itens no grupo Total — visão por código/atividade.';
comment on view public.vw_cost_monthly_group_actuals is 'Série mensal do real por grupo.';
comment on view public.vw_cost_monthly_total_actuals is 'Série mensal do real (universo MO/EQ/MAT).';
comment on view public.vw_cost_item_lookup is 'Itens com orçamento para selects (ex.: lançamentos), exceto grupo Total.';
comment on view public.vw_cost_audit_enriched is 'Auditoria com item e grupo resolvidos para leitura humana.';
comment on view public.vw_cost_visual_breakdown is 'Quebra MO/EQ/MAT por código (tela Visual / estilo planilha Dados).';

-- =========================
-- 6) QUERIES (exemplos)
-- =========================

-- 5.1 Total summary (planned vs actual vs balance)
-- (Use the view to stay consistent with status/percent rules)
-- select
--   sum(planned_value) as total_planned,
--   sum(actual_value) as total_actual,
--   sum(balance) as total_balance
-- from public.vw_cost_analysis;

-- 5.2 Top 5 highest risk items (prioritize OVERBUDGET > HIGH_USAGE > WARNING > OK)
-- select
--   *
-- from public.vw_cost_analysis
-- order by
--   case status
--     when 'OVERBUDGET' then 4
--     when 'HIGH_USAGE' then 3
--     when 'WARNING' then 2
--     else 1
--   end desc,
--   percent_used desc nulls last
-- limit 5;

-- 5.3 Monthly evolution (grouped by month)
-- select
--   date_trunc('month', c.cost_date)::date as month,
--   sum(c.amount) as actual_value
-- from public.cost_entries c
-- group by 1
-- order by 1;

-- 5.4 Breakdown by group (planned vs actual vs balance)
-- select
--   v.group_name,
--   sum(v.planned_value) as planned_value,
--   sum(v.actual_value) as actual_value,
--   sum(v.balance) as balance
-- from public.vw_cost_analysis v
-- group by v.group_name
-- order by v.group_name;

