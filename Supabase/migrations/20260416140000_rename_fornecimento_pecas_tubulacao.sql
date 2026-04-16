-- Subgrupo em Fornecimento: evita homônimo «Material Mecanico» (Materiais).
update public.cost_subgroups sg
set
  name = 'Peças de tubulação',
  code = 'FOR-PECAS-DE-TUBULACAO'
from public.cost_groups g
where sg.group_id = g.id
  and g.name = 'Fornecimento'
  and sg.name = 'Material Mecanico';

update public.cost_items i
set name = replace(i.name, '— Material Mecanico', '— Peças de tubulação')
from public.cost_subgroups sg
join public.cost_groups g on g.id = sg.group_id
where i.subgroup_id = sg.id
  and g.name = 'Fornecimento'
  and i.name like '%— Material Mecanico%';
