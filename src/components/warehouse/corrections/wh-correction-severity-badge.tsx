'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'

type BadgeVariant = 'red' | 'amber' | 'blue'

const severityVariant: Record<string, BadgeVariant> = {
  ERROR: 'red',
  WARNING: 'amber',
  INFO: 'blue',
}

const severityKeys: Record<string, string> = {
  ERROR: 'severityError',
  WARNING: 'severityWarning',
  INFO: 'severityInfo',
}

export function WhCorrectionSeverityBadge({ severity }: { severity: string }) {
  const t = useTranslations('warehouseCorrections')
  const variant = severityVariant[severity] ?? 'blue'
  const key = severityKeys[severity] ?? 'severityInfo'
  return <Badge variant={variant}>{t(key as Parameters<typeof t>[0])}</Badge>
}
