import type { SubgroupRow } from "./dashboardTypes";
import {
  foldSubgroupKey,
  formatSubgroupLabelForDisplay,
} from "./mergeSubgroups";

export type SubgroupChartBar = {
  id: string;
  /** Texto curto no eixo */
  label: string;
  /** Tooltip / acessibilidade */
  fullLabel: string;
  planned_value: number;
  actual_value: number;
  /** Divisor de secção (só visual; sem barras P/R). */
  kind?: "data" | "section";
};

function sumPair(rows: SubgroupRow[]): { p: number; a: number } {
  let p = 0;
  let a = 0;
  for (const r of rows) {
    p += Number(r.planned_value);
    a += Number(r.actual_value);
  }
  return { p, a };
}

/** Soma prevista por grupo (para donut de distribuição). */
export function buildCostDistributionQuad(rows: SubgroupRow[]): {
  mo: number;
  eq: number;
  mat: number;
  forn: number;
} {
  let mo = 0;
  let eq = 0;
  let mat = 0;
  let forn = 0;
  for (const r of rows) {
    const v = Number(r.planned_value);
    if (r.group_name === "Mão de Obra") mo += v;
    else if (r.group_name === "Equipamento") eq += v;
    else if (r.group_name === "Materiais") mat += v;
    else if (r.group_name === "Fornecimento") forn += v;
  }
  return { mo, eq, mat, forn };
}

function sortBarsByPlannedDesc(bars: SubgroupChartBar[]): SubgroupChartBar[] {
  return [...bars].sort((a, b) => b.planned_value - a.planned_value);
}

/** Id estável e único por chave dobrada (evita colisão de slug e keys React duplicadas). */
function barIdFromFolded(idPrefix: string, folded: string): string {
  if (folded === "—") return `${idPrefix}-emdash`;
  let h = 2166136261;
  for (let i = 0; i < folded.length; i++) {
    h ^= folded.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${idPrefix}-k${(h >>> 0).toString(16)}-${folded.length}`;
}

/**
 * Barras horizontais por subgrupo (nome normalizado), maior previsto primeiro.
 * Usado para Equipamento, Materiais e Fornecimento.
 */
function buildHorizontalBarsForGroup(
  rows: SubgroupRow[],
  groupName: string,
  idPrefix: string,
  fullLabelPrefix: string,
): SubgroupChartBar[] {
  const filtered = rows.filter((r) => r.group_name === groupName);
  const byFold = new Map<string, { planned: number; actual: number }>();
  for (const r of filtered) {
    const raw = (r.subgroup_name || "—").trim() || "—";
    const folded = foldSubgroupKey(raw);
    const cur = byFold.get(folded) ?? { planned: 0, actual: 0 };
    cur.planned += Number(r.planned_value);
    cur.actual += Number(r.actual_value);
    byFold.set(folded, cur);
  }
  const bars: SubgroupChartBar[] = [];
  for (const [folded, s] of byFold) {
    const subName =
      folded === "—" ? "—" : formatSubgroupLabelForDisplay(folded);
    bars.push({
      id: barIdFromFolded(idPrefix, folded),
      label: subName.length > 26 ? `${subName.slice(0, 24)}…` : subName,
      fullLabel: `${fullLabelPrefix} — ${subName}`,
      planned_value: s.planned,
      actual_value: s.actual,
    });
  }
  return sortBarsByPlannedDesc(bars);
}

/** Chaves internas do gráfico «Custos por Equipamento» (só visual). */
type EquipmentHorizKey =
  | "principal_onibus"
  | "principal_munck"
  | "principal_guindaste"
  | "principal_carros"
  | "principal_container"
  | "principal_banheiro"
  | "principal_outros"
  | "mq_carreta"
  | "mq_basculante"
  | "mq_sucateira"
  | "mq_tesoura"
  | "mq_rompedor"
  | "mq_pipa"
  | "mq_escav";

const EQ_HORIZ_LABELS: Record<
  EquipmentHorizKey,
  { label: string; fullLabel: string }
> = {
  principal_onibus: { label: "Ônibus", fullLabel: "Equipamento — Ônibus" },
  principal_munck: { label: "Munck", fullLabel: "Equipamento — Munck" },
  principal_guindaste: {
    label: "Guindaste",
    fullLabel: "Equipamento — Guindaste",
  },
  principal_carros: {
    label: "Carros leves",
    fullLabel: "Equipamento — Carros leves",
  },
  principal_container: {
    label: "Contêiner",
    fullLabel: "Equipamento — Contêiner",
  },
  principal_banheiro: {
    label: "Banheiros hidráulicos",
    fullLabel: "Equipamento — Banheiros hidráulicos",
  },
  principal_outros: {
    label: "Outros",
    fullLabel:
      "Equipamento — Outros (ferramental, limpeza banheiros, tambor, bomba, etc.)",
  },
  mq_carreta: { label: "Carreta", fullLabel: "Equipamento — Máq. pesadas — Carreta" },
  mq_basculante: {
    label: "Basculante",
    fullLabel: "Equipamento — Máq. pesadas — Basculante",
  },
  mq_sucateira: {
    label: "Sucateira",
    fullLabel: "Equipamento — Máq. pesadas — Sucateira",
  },
  mq_tesoura: {
    label: "Tesoura hidráulica",
    fullLabel: "Equipamento — Máq. pesadas — Tesoura hidráulica",
  },
  mq_rompedor: {
    label: "Rompedor",
    fullLabel: "Equipamento — Máq. pesadas — Rompedor",
  },
  mq_pipa: { label: "Pipa", fullLabel: "Equipamento — Máq. pesadas — Pipa" },
  mq_escav: {
    label: "Escavadeira / retro / mini",
    fullLabel: "Equipamento — Máq. pesadas — Escavadeira / retro / mini",
  },
};

/**
 * Classifica subgrupo de Equipamento (nome já dobrado) para o gráfico.
 * Máquinas pesadas primeiro, depois faixas “gerais”, o resto em Outros.
 */
function equipmentHorizontalBucket(folded: string): EquipmentHorizKey {
  const f = folded;
  if (!f || f === "—") return "principal_outros";

  // --- Máquinas pesadas
  if (f.includes("carreta")) return "mq_carreta";
  if (f.includes("basculante")) return "mq_basculante";
  if (f.includes("sucateira")) return "mq_sucateira";
  if (f.includes("tesoura") && f.includes("hidraul")) return "mq_tesoura";
  if (f.includes("rompedor")) return "mq_rompedor";
  if (f.includes("pipa")) return "mq_pipa";
  if (
    f.includes("retroescavadeira") ||
    f.includes("escavadeira") ||
    (f.includes("mini") && f.includes("escav"))
  ) {
    return "mq_escav";
  }

  // --- Faixas principais (Ônibus inclui ônibus extra)
  if (f.includes("onibus") || f.includes("nibus")) return "principal_onibus";
  if (f.includes("munck") || f.includes("munk")) return "principal_munck";
  if (f.includes("guindaste")) return "principal_guindaste";
  if (f.includes("carros")) return "principal_carros";
  if (f.includes("contein") || f.includes("container")) {
    return "principal_container";
  }
  if (f.includes("banheiro") && f.includes("hidraul")) {
    return "principal_banheiro";
  }

  // Ferramental (todas as variantes) e restantes pedidos → Outros
  if (f.includes("ferramental")) return "principal_outros";
  if (f.includes("limpeza") && f.includes("banheiro")) return "principal_outros";
  if (f.includes("tambor")) return "principal_outros";
  if (f.includes("bomba")) return "principal_outros";

  return "principal_outros";
}

const PRINCIPAL_KEYS: EquipmentHorizKey[] = [
  "principal_onibus",
  "principal_munck",
  "principal_guindaste",
  "principal_carros",
  "principal_container",
  "principal_banheiro",
  "principal_outros",
];

const MQ_KEYS: EquipmentHorizKey[] = [
  "mq_carreta",
  "mq_basculante",
  "mq_sucateira",
  "mq_tesoura",
  "mq_rompedor",
  "mq_pipa",
  "mq_escav",
];

function barFromEqKey(
  key: EquipmentHorizKey,
  sums: Record<EquipmentHorizKey, { planned: number; actual: number }>,
  idPrefix: string,
): SubgroupChartBar {
  const s = sums[key];
  const meta = EQ_HORIZ_LABELS[key];
  return {
    id: `${idPrefix}${key}`,
    label: meta.label,
    fullLabel: meta.fullLabel,
    planned_value: s.planned,
    actual_value: s.actual,
    kind: "data",
  };
}

function accumulateEquipmentHorizSums(
  rows: SubgroupRow[],
): Record<EquipmentHorizKey, { planned: number; actual: number }> {
  const filtered = rows.filter((r) => r.group_name === "Equipamento");
  const sums = {} as Record<
    EquipmentHorizKey,
    { planned: number; actual: number }
  >;
  for (const k of [...PRINCIPAL_KEYS, ...MQ_KEYS]) {
    sums[k] = { planned: 0, actual: 0 };
  }
  for (const r of filtered) {
    const raw = (r.subgroup_name || "—").trim() || "—";
    const folded = foldSubgroupKey(raw);
    const b = equipmentHorizontalBucket(folded);
    sums[b].planned += Number(r.planned_value);
    sums[b].actual += Number(r.actual_value);
  }
  return sums;
}

/**
 * Equipamento: só faixas gerais (aba «Equipamento»).
 */
export function buildEquipmentHorizontalSeries(
  rows: SubgroupRow[],
): SubgroupChartBar[] {
  const sums = accumulateEquipmentHorizSums(rows);
  return sortBarsByPlannedDesc(
    PRINCIPAL_KEYS.map((k) => barFromEqKey(k, sums, "eq-h-b-")).filter(
      (b) =>
        Number(b.planned_value) > 0.005 || Number(b.actual_value) > 0.005,
    ),
  );
}

/**
 * Máquinas pesadas (aba própria; mesma lógica de classificação do equipamento).
 */
export function buildMaquinasPesadasHorizontalSeries(
  rows: SubgroupRow[],
): SubgroupChartBar[] {
  const sums = accumulateEquipmentHorizSums(rows);
  return sortBarsByPlannedDesc(
    MQ_KEYS.map((k) => barFromEqKey(k, sums, "mq-h-b-")).filter(
      (b) =>
        Number(b.planned_value) > 0.005 || Number(b.actual_value) > 0.005,
    ),
  );
}

/** Faixas do gráfico «Custos por Material» (demais subgrupos vão para «Outros»). */
export type MaterialHorizontalBucket =
  | "consumiveis_gas"
  | "outros_consumiveis"
  | "andaimes"
  | "cacambas"
  | "material_mecanico"
  | "demais";

const MAT_HORIZ_LABELS: Record<
  MaterialHorizontalBucket,
  { label: string; fullLabel: string }
> = {
  consumiveis_gas: {
    label: "Consumíveis/Gás",
    fullLabel: "Materiais — Consumíveis/Gás",
  },
  outros_consumiveis: {
    label: "Outros/Consumíveis",
    fullLabel: "Materiais — Outros/Consumíveis",
  },
  andaimes: {
    label: "Andaimes",
    fullLabel: "Materiais — Andaimes",
  },
  cacambas: {
    label: "Caçambas",
    fullLabel: "Materiais — Caçambas",
  },
  material_mecanico: {
    label: "Material mecânico",
    fullLabel: "Materiais — Material mecânico",
  },
  demais: {
    label: "Outros",
    fullLabel: "Materiais — Outros (MT, concreto, demais subgrupos, etc.)",
  },
};

/**
 * Classifica subgrupo de Materiais (chave já dobrada) para uma das faixas do gráfico.
 */
export function materialHorizontalBucket(
  folded: string,
): MaterialHorizontalBucket {
  const f = folded;
  if (!f || f === "—") return "demais";
  if (f === "consumiveis/gas" || f.startsWith("consumiveis/gas/")) {
    return "consumiveis_gas";
  }
  if (f === "outros/consumiveis" || f.startsWith("outros/consumiveis/")) {
    return "outros_consumiveis";
  }
  if (f.includes("andaime")) return "andaimes";
  if (f.includes("cacamba")) return "cacambas";
  if (f === "material mecanico") return "material_mecanico";
  return "demais";
}

/**
 * Materiais: barras agregadas (Gás, Outros/Consum., Andaimes, Caçambas, Material mecânico, Outros),
 * ordenadas do maior ao menor previsto.
 */
export function buildMaterialHorizontalSeries(
  rows: SubgroupRow[],
): SubgroupChartBar[] {
  const filtered = rows.filter((r) => r.group_name === "Materiais");
  const sums: Record<
    MaterialHorizontalBucket,
    { planned: number; actual: number }
  > = {
    consumiveis_gas: { planned: 0, actual: 0 },
    outros_consumiveis: { planned: 0, actual: 0 },
    andaimes: { planned: 0, actual: 0 },
    cacambas: { planned: 0, actual: 0 },
    material_mecanico: { planned: 0, actual: 0 },
    demais: { planned: 0, actual: 0 },
  };
  for (const r of filtered) {
    const raw = (r.subgroup_name || "—").trim() || "—";
    const folded = foldSubgroupKey(raw);
    const b = materialHorizontalBucket(folded);
    sums[b].planned += Number(r.planned_value);
    sums[b].actual += Number(r.actual_value);
  }
  const bars: SubgroupChartBar[] = (
    Object.keys(sums) as MaterialHorizontalBucket[]
  ).map((key) => {
    const s = sums[key];
    const meta = MAT_HORIZ_LABELS[key];
    return {
      id: `mat-sg-b-${key}`,
      label: meta.label,
      fullLabel: meta.fullLabel,
      planned_value: s.planned,
      actual_value: s.actual,
    };
  });
  return sortBarsByPlannedDesc(bars).filter(
    (b) =>
      Number(b.planned_value) > 0.005 || Number(b.actual_value) > 0.005,
  );
}

/**
 * Fornecimento: um par de barras por subgrupo, maior previsto primeiro.
 */
export function buildFornecimentoHorizontalSeries(
  rows: SubgroupRow[],
): SubgroupChartBar[] {
  return buildHorizontalBarsForGroup(
    rows,
    "Fornecimento",
    "for-h",
    "Fornecimento",
  );
}

/**
 * Série combinada: Mão de Obra (total) + subgrupos de Equipamento, Materiais e Fornecimento.
 */
export function buildSubgroupChartSeries(rows: SubgroupRow[]): SubgroupChartBar[] {
  const mo = rows.filter((r) => r.group_name === "Mão de Obra");
  const sMo = sumPair(mo);
  const moBar: SubgroupChartBar = {
    id: "mo",
    label: "Mão de obra",
    fullLabel: "Mão de Obra (total)",
    planned_value: sMo.p,
    actual_value: sMo.a,
  };
  const eqBars = [
    ...buildEquipmentHorizontalSeries(rows).map((b) => ({
      ...b,
      id: b.id.replace(/^eq-h-/, "eq-"),
    })),
    ...buildMaquinasPesadasHorizontalSeries(rows).map((b) => ({
      ...b,
      id: `eq-mq-${b.id.replace(/^mq-h-b-/, "")}`,
    })),
  ];
  const matBars = buildMaterialHorizontalSeries(rows).map((b) => ({
    ...b,
    id: b.id.replace(/^mat-sg-/, "mat-"),
  }));
  const forBars = buildFornecimentoHorizontalSeries(rows).map((b) => ({
    ...b,
    id: b.id.replace(/^for-h-/, "for-"),
  }));
  return [moBar, ...eqBars, ...matBars, ...forBars];
}
