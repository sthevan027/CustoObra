import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, "..", "Supabase", "seed.generated.sql");
const s = fs.readFileSync(seedPath, "utf8");

// Total por código (grupo Total)
const totalBlock = s.slice(
  s.indexOf("-- Budgets (total por código)"),
  s.indexOf("-- Budgets (quebra por grupo/subgrupo)"),
);
let totalPlanned = 0;
for (const line of totalBlock.split("\n")) {
  const n = line.match(/,\s*([0-9]+\.[0-9]{2})\s*\),?\s*$/);
  if (n) totalPlanned += parseFloat(n[1]);
}

// Quebra operacional
const brStart = s.indexOf("-- Budgets (quebra por grupo/subgrupo)");
const brEnd = s.indexOf(") as b(group_name, subgroup_name, item_name, item_code, planned_value)", brStart);
const block = s.slice(brStart, brEnd);

const byGroup = {};
const bySubgroup = {}; // "Grupo :: Subgrupo"

for (const line of block.split("\n")) {
  const n = line.match(/,\s*([0-9]+\.[0-9]{2})\s*\),?\s*$/);
  if (!n) continue;
  const v = parseFloat(n[1]);
  const m = line.match(/^\s*\('([^']*(?:''[^']*)*)',\s*'([^']*(?:''[^']*)*)',/);
  if (!m) continue;
  const g = m[1].replace(/''/g, "'");
  const sg = m[2].replace(/''/g, "'");
  byGroup[g] = (byGroup[g] || 0) + v;
  const key = `${g} :: ${sg}`;
  bySubgroup[key] = (bySubgroup[key] || 0) + v;
}

const sumBreakdown = Object.values(byGroup).reduce((a, b) => a + b, 0);

const sanity = s.match(/Soma Total previsto \(linhas pai\): ([0-9.]+)/);
const sanityBd = s.match(/Soma previsto \(MO\+EQ\+MAT[^\)]*\): ([0-9.]+)/);

console.log(
  JSON.stringify(
    {
      arquivo: seedPath,
      sanity_header: {
        soma_total_previsto_linhas_pai: sanity ? sanity[1] : null,
        soma_previsto_detalhado_comentario: sanityBd ? sanityBd[1] : null,
      },
      budgets_grupo_Total_contrato: {
        soma_planned_valores_item_Total: Number(totalPlanned.toFixed(2)),
      },
      quebra_operacional_previsto: {
        por_grupo: Object.fromEntries(
          Object.entries(byGroup).sort((a, b) => a[0].localeCompare(b[0], "pt-BR")),
        ),
        soma_todas_linhas_quebra: Number(sumBreakdown.toFixed(2)),
        por_subgrupo: Object.fromEntries(
          Object.entries(bySubgroup).sort((a, b) => a[0].localeCompare(b[0], "pt-BR")),
        ),
      },
    },
    null,
    2,
  ),
);
