/** Status vindo das views SQL; CRITICAL é legado (antes de HIGH_USAGE). */
export type StatusCode =
  | 'OVERBUDGET'
  | 'HIGH_USAGE'
  | 'CRITICAL'
  | 'WARNING'
  | 'OK'
  | string

export function normalizeStatus(status: string): StatusCode {
  if (status === 'CRITICAL') return 'HIGH_USAGE'
  return status
}

export function statusLabelPt(status: string): string {
  const k = normalizeStatus(status)
  switch (k) {
    case 'OVERBUDGET':
      return 'Acima do orçado'
    case 'HIGH_USAGE':
      return 'Alto uso (≥90%)'
    case 'WARNING':
      return 'Atenção (70–90%)'
    case 'OK':
      return 'No orçamento'
    default:
      return status
  }
}

/** Classes com contraste ok em tema claro e escuro (badges). */
export function statusBadgeClass(status: string): string {
  const k = normalizeStatus(status)
  switch (k) {
    case 'OVERBUDGET':
      return 'bg-rose-500/15 text-rose-800 ring-rose-500/35 dark:bg-rose-500/20 dark:text-rose-100 dark:ring-rose-400/40'
    case 'HIGH_USAGE':
      return 'bg-sky-500/15 text-sky-900 ring-sky-500/35 dark:bg-sky-500/15 dark:text-sky-100 dark:ring-sky-400/40'
    case 'WARNING':
      return 'bg-amber-500/15 text-amber-900 ring-amber-500/35 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/40'
    default:
      return 'bg-emerald-500/15 text-emerald-900 ring-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-100 dark:ring-emerald-400/35'
  }
}
