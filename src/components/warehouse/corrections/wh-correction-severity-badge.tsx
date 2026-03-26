'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'

const severityVariant: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  ERROR: 'destructive',
  WARNING: 'secondary',
  INFO: 'outline',
}

const severityKeys: Record<string, string> = {
  ERROR: 'severityError',
  WARNING: 'severityWarning',
  INFO: 'severityInfo',
}

export function WhCorrectionSeverityBadge({ severity }: { severity: string }) {
  const t = useTranslations('warehouseCorrections')
  const variant = severityVariant[severity] ?? 'outline'
  const key = severityKeys[severity] ?? 'severityInfo'
  return <Badge variant={variant}>{t(key as Parameters<typeof t>[0])}</Badge>
}
