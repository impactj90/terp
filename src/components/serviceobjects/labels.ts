/**
 * German display labels for ServiceObject enums.
 *
 * The backend stores enum values verbatim (SITE, OPERATIONAL, …). These
 * helpers map them to the user-facing German text. Tenant UI is German-
 * only per memory/feedback; if/when the tenant UI gets full next-intl
 * wiring, these move into the messages JSON.
 */

export const KIND_LABELS: Record<string, string> = {
  SITE: 'Standort',
  BUILDING: 'Gebäude',
  SYSTEM: 'Anlage',
  EQUIPMENT: 'Gerät',
  COMPONENT: 'Komponente',
}

export const STATUS_LABELS: Record<string, string> = {
  OPERATIONAL: 'Betriebsbereit',
  DEGRADED: 'Eingeschränkt',
  IN_MAINTENANCE: 'In Wartung',
  OUT_OF_SERVICE: 'Außer Betrieb',
  DECOMMISSIONED: 'Stillgelegt',
}

export const BUILDING_USAGE_LABELS: Record<string, string> = {
  OFFICE: 'Büro',
  WAREHOUSE: 'Lager',
  PRODUCTION: 'Produktion',
  RETAIL: 'Einzelhandel',
  RESIDENTIAL: 'Wohnen',
  MIXED: 'Gemischt',
  OTHER: 'Sonstiges',
}

export function kindLabel(kind: string | null | undefined): string {
  if (!kind) return '—'
  return KIND_LABELS[kind] ?? kind
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return STATUS_LABELS[status] ?? status
}

export function buildingUsageLabel(
  usage: string | null | undefined
): string | null {
  if (!usage) return null
  return BUILDING_USAGE_LABELS[usage] ?? usage
}
